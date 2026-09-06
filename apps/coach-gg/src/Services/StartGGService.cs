using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using CoachGG.Models;
using Microsoft.Extensions.DependencyInjection;

namespace CoachGG.Services;

public class StartGGService
{
    private readonly HttpClient _http;
    private readonly ILogger<StartGGService> _logger;
    private readonly Func<TimeSpan, CancellationToken, Task> _delay;
    private readonly TimeProvider _time;
    private readonly Func<TimeSpan, TimeSpan> _applyJitter;

    /// <summary>UTC ticks; 0 means no cooldown. Written with Interlocked.</summary>
    private long _cooldownUntilUtcTicks;

    private const int MaxRateLimitAttempts = 10;
    private const int MaxTransportAttempts = 3;
    private static readonly TimeSpan DefaultRateLimitCooldown = TimeSpan.FromSeconds(20);
    private static readonly TimeSpan MaxRetryAfter = TimeSpan.FromSeconds(60);
    private static readonly TimeSpan BackoffBase = TimeSpan.FromSeconds(2);
    private static readonly TimeSpan BackoffCap = TimeSpan.FromSeconds(32);

    private const string GamesCountQuery = @"
query CountQuery($slug: String $page: Int $perPage: Int) {
  user(slug: $slug) {
    id
    player {
      prefix
      gamerTag
      sets(page: $page perPage: $perPage filters: { hideEmpty: true }) {
        pageInfo { totalPages }
      }
    }
  }
}";

    private const string GamesMetadataQuery = @"
query ResultsQuery($slug: String $page: Int $perPage: Int) {
  user(slug: $slug) {
    id
    player {
      sets(page: $page perPage: $perPage filters: { hideEmpty: true }) {
        nodes {
          fullRoundText
          games {
            winnerId
            selections {
              entrant {
                id
                participants {
                  user { id slug }
                }
              }
              selectionValue
            }
            stage { id name }
          }
        }
      }
    }
  }
}";

    [ActivatorUtilitiesConstructor]
    public StartGGService(HttpClient http, ILogger<StartGGService> logger)
        : this(http, logger, delay: null, time: null, applyJitter: null)
    {
    }

    public StartGGService(
        HttpClient http,
        ILogger<StartGGService> logger,
        Func<TimeSpan, CancellationToken, Task>? delay,
        TimeProvider? time = null,
        Func<TimeSpan, TimeSpan>? applyJitter = null)
    {
        _http = http;
        _logger = logger;
        _delay = delay ?? Task.Delay;
        _time = time ?? TimeProvider.System;
        _applyJitter = applyJitter ?? AddDefaultJitter;
    }

    private static TimeSpan AddDefaultJitter(TimeSpan delay)
    {
        if (delay <= TimeSpan.Zero)
            return delay;
        return delay + TimeSpan.FromMilliseconds(Random.Shared.Next(0, 500));
    }

    private async Task<JsonNode?> ExecuteAsync(string query, object variables, CancellationToken ct)
    {
        var body = JsonSerializer.Serialize(new { query, variables });
        var rateLimitAttempts = 0;
        var transportAttempts = 0;

        await WaitSharedCooldownAsync(ct);

        while (true)
        {
            ct.ThrowIfCancellationRequested();
            HttpRequestMessage? request = null;
            HttpResponseMessage? response = null;
            try
            {
                request = new HttpRequestMessage(HttpMethod.Post, "")
                {
                    Content = new StringContent(body, Encoding.UTF8, "application/json")
                };
                response = await _http.SendAsync(request, ct);
                var json = await response.Content.ReadAsStringAsync(ct);
                var status = (int)response.StatusCode;

                if (status is 429 or 503)
                {
                    rateLimitAttempts++;
                    var wait = ResolveWait(response, rateLimitAttempts, out var usedRetryAfter);
                    ArmCooldown(usedRetryAfter ? wait : DefaultRateLimitCooldown);

                    if (rateLimitAttempts >= MaxRateLimitAttempts)
                        throw new Exception($"start.gg rate limit persisted after {MaxRateLimitAttempts} attempts — try again in a minute");

                    _logger.LogWarning(
                        "start.gg HTTP {StatusCode} (attempt {Attempt}/{Max}); waiting {WaitSeconds:0.###}s ({WaitSource})",
                        status,
                        rateLimitAttempts,
                        MaxRateLimitAttempts,
                        wait.TotalSeconds,
                        usedRetryAfter ? "Retry-After" : "exponential backoff");
                    await _delay(wait, ct);
                    continue;
                }

                if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden
                    || status == 400 && json.Contains("Invalid authentication token", StringComparison.Ordinal))
                {
                    // Never retry auth failures — surface the actual ops problem instead of hanging
                    var detail = TryReadErrorMessage(json);
                    throw new Exception(string.IsNullOrEmpty(detail)
                        ? $"start.gg rejected the configured API key (HTTP {status}). Check STARTGG_APIKEY."
                        : $"start.gg rejected the configured API key (HTTP {status}): {detail}. Rotate STARTGG_APIKEY.");
                }

                response.EnsureSuccessStatusCode();

                var node = JsonNode.Parse(json);
                if (node?["errors"] != null)
                    throw new Exception($"GraphQL error: {node["errors"]!.ToJsonString()}");

                return node?["data"];
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
            {
                transportAttempts++;
                _logger.LogWarning(ex, "start.gg request failed (attempt {Attempt}/{Max})", transportAttempts, MaxTransportAttempts);
                if (transportAttempts >= MaxTransportAttempts)
                    throw new Exception($"start.gg unreachable after {MaxTransportAttempts} attempts", ex);
            }
            finally
            {
                request?.Dispose();
                response?.Dispose();
            }
        }
    }

    private TimeSpan ResolveWait(HttpResponseMessage response, int rateLimitAttempt, out bool usedRetryAfter)
    {
        if (TryGetRetryAfter(response, _time, out var retryAfter) && retryAfter > TimeSpan.Zero)
        {
            usedRetryAfter = true;
            return ClampWait(retryAfter);
        }

        usedRetryAfter = false;
        var seconds = Math.Min(BackoffCap.TotalSeconds, BackoffBase.TotalSeconds * Math.Pow(2, rateLimitAttempt - 1));
        return _applyJitter(TimeSpan.FromSeconds(seconds));
    }

    private static bool TryGetRetryAfter(HttpResponseMessage response, TimeProvider time, out TimeSpan retryAfter)
    {
        retryAfter = TimeSpan.Zero;
        var header = response.Headers.RetryAfter;
        if (header is null)
            return false;

        if (header.Delta is TimeSpan delta)
        {
            retryAfter = delta;
            return true;
        }

        if (header.Date is DateTimeOffset date)
        {
            retryAfter = date - time.GetUtcNow();
            return true;
        }

        return false;
    }

    private static TimeSpan ClampWait(TimeSpan wait)
    {
        if (wait < TimeSpan.Zero)
            return TimeSpan.Zero;
        return wait > MaxRetryAfter ? MaxRetryAfter : wait;
    }

    private async Task WaitSharedCooldownAsync(CancellationToken ct)
    {
        var untilTicks = Interlocked.Read(ref _cooldownUntilUtcTicks);
        if (untilTicks <= 0)
            return;

        var remaining = new DateTimeOffset(untilTicks, TimeSpan.Zero) - _time.GetUtcNow();
        if (remaining <= TimeSpan.Zero)
            return;

        _logger.LogInformation(
            "start.gg cooldown: waiting {WaitSeconds:0.###}s before next request",
            remaining.TotalSeconds);
        await _delay(remaining, ct);
    }

    private void ArmCooldown(TimeSpan duration)
    {
        if (duration <= TimeSpan.Zero)
            return;

        var untilTicks = _time.GetUtcNow().Add(duration).UtcTicks;
        while (true)
        {
            var current = Interlocked.Read(ref _cooldownUntilUtcTicks);
            if (untilTicks <= current)
                return;
            if (Interlocked.CompareExchange(ref _cooldownUntilUtcTicks, untilTicks, current) == current)
                return;
        }
    }

    private static string? TryReadErrorMessage(string json)
    {
        try
        {
            return JsonNode.Parse(json)?["message"]?.GetValue<string>();
        }
        catch (JsonException)
        {
            return null;
        }
    }

    public async Task<(long? UserId, List<RawGame> Games)> GetGamesMetadataAsync(
        string slug,
        Func<int, int, List<RawGame>, long, Task>? onProgress = null,
        CancellationToken ct = default)
    {
        var countVars = new { slug, page = 1, perPage = 30 };
        var countData = await ExecuteAsync(GamesCountQuery, countVars, ct);

        if (countData?["user"] == null)
        {
            _logger.LogError("User with slug {Slug} not found", slug);
            return (null, new List<RawGame>());
        }

        var userNode = countData["user"]!;
        var playerNode = userNode["player"];
        if (playerNode?["sets"]?["pageInfo"]?["totalPages"] == null)
        {
            // User exists but has no linked start.gg player profile / sets — nothing to analyze
            _logger.LogError("User {Slug} has no player sets data on start.gg", slug);
            return (null, new List<RawGame>());
        }

        var userId = userNode["id"]!.GetValue<long>();
        var totalPages = playerNode["sets"]!["pageInfo"]!["totalPages"]!.GetValue<int>();

        _logger.LogInformation("Fetching {TotalPages} pages for {Slug}", totalPages, slug);

        var allGames = new List<RawGame>();
        var jsonOptions = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };

        for (int page = 1; page <= totalPages; page++)
        {
            ct.ThrowIfCancellationRequested();
            var vars = new { slug, page, perPage = 30 };
            var data = await ExecuteAsync(GamesMetadataQuery, vars, ct);
            var sets = data?["user"]?["player"]?["sets"]?["nodes"];

            if (sets != null)
            {
                foreach (var set in sets.AsArray())
                {
                    var games = set?["games"];
                    if (games == null) continue;
                    var parsed = games.Deserialize<List<RawGame>>(jsonOptions);
                    if (parsed != null) allGames.AddRange(parsed);
                }
            }

            if (onProgress != null)
                await onProgress(page, totalPages, new List<RawGame>(allGames), userId);
        }

        return (userId, allGames);
    }
}
