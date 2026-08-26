using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace CoachGG.Services;

public class PlayerSearchResult
{
    public string GamerTag { get; set; } = "";
    public string? Prefix { get; set; }
    public string Slug { get; set; } = "";
    public long UserId { get; set; }
}

/// <summary>Thrown when start.gg is unreachable, rejects our credentials, or keeps rate-limiting us.
/// Lets /search return 502/503 instead of a silent empty list that looks like "no players found".</summary>
public class StartGgUnavailableException : Exception
{
    public bool IsRateLimit { get; }
    public StartGgUnavailableException(string message, bool isRateLimit = false) : base(message)
        => IsRateLimit = isRateLimit;
}

public class SearchService
{
    private readonly HttpClient _http;
    private readonly ILogger<SearchService> _logger;

    // Curated majors — pro players attend these (updated list covering 2024-2026)
    private static readonly string[] Majors =
    [
        "genesis-x", "genesis-9", "genesis-8",
        "evo-2025", "evo-2024", "evo-2023",
        "smash-con-2025", "smash-con-2024", "smash-con-2023",
        "collision-2025", "collision-2024", "collision-2023",
        "get-on-my-level-2025", "get-on-my-level-2024", "get-on-my-level-2023",
        "mainstage-2025", "mainstage-2024", "mainstage-2023",
        "ludwig-smash-invitational", "ludwig-smash-invitational-2",
        "don-t-park-on-the-grass-2025", "don-t-park-on-the-grass-2024",
        "big-house-12", "big-house-11", "big-house-10",
        "low-tide-city-2025", "low-tide-city-2024",
        "supernova-2025", "supernova-2024",
        "battle-of-bc-7", "battle-of-bc-6", "battle-of-bc-5",
        "shine-2025", "shine-2024",
        "summit-18", "summit-17", "summit-16",
        "port-priority-9", "port-priority-8", "port-priority-7",
        "worlds-finest-2025", "glitch-infinite",
    ];

    // Batched: one query returns 20 tournaments + matching participants — for local/regional players
    private const string RecentBatchedQuery = """
        query BatchSearch($tag: String!, $beforeDate: Timestamp!, $afterDate: Timestamp!, $page: Int!) {
          tournaments(query: {
            page: $page, perPage: 20,
            sortBy: "startAt desc",
            filter: { videogameIds: [1386], beforeDate: $beforeDate, afterDate: $afterDate }
          }) {
            nodes {
              participants(query: { perPage: 5, filter: { gamerTag: $tag } }) {
                nodes {
                  gamerTag
                  user { id slug player { gamerTag prefix } }
                }
              }
            }
          }
        }
        """;

    private const string MajorSearchQuery = """
        query MajorSearch($slug: String!, $tag: String!) {
          tournament(slug: $slug) {
            participants(query: { perPage: 5, filter: { gamerTag: $tag } }) {
              nodes {
                gamerTag
                user { id slug player { gamerTag prefix } }
              }
            }
          }
        }
        """;

    private const string DirectUserQuery = """
        query GetUser($slug: String!) {
          user(slug: $slug) { id slug player { gamerTag prefix } }
        }
        """;

    public SearchService(HttpClient http, ILogger<SearchService> logger)
    {
        _http = http;
        _logger = logger;
    }

    // start.gg allows ~80 req/min per key; a single search used to fire up to ~50.
    private const int MaxUpstreamRequestsPerSearch = 20;
    private const int MaxAttemptsPerRequest = 3;

    /// <summary>Tracks upstream health across the parallel calls of one search so we can
    /// bail out early (instead of burning the rest of our rate-limit budget) and report
    /// degradation to the caller instead of returning a misleading empty list.</summary>
    internal sealed class UpstreamHealth
    {
        public bool SawAuthFailure;
        public bool SawRateLimit;
        public bool SawTransportFailure;
        public int Requests;
        public int Successes;
        // A transient blip that a later request recovered from is NOT an outage;
        // auth rejection is — every other call would fail identically.
        public bool Outaged => SawAuthFailure || ((SawRateLimit || SawTransportFailure) && Successes == 0);
    }

    private async Task<JsonNode?> ExecuteAsync(string query, object variables, UpstreamHealth? health = null)
    {
        var body = JsonSerializer.Serialize(new { query, variables });

        for (var attempt = 1; attempt <= MaxAttemptsPerRequest; attempt++)
        {
            if (health != null && Interlocked.Increment(ref health.Requests) > MaxUpstreamRequestsPerSearch)
            {
                _logger.LogWarning("start.gg request budget ({Max}) exhausted for this search — skipping further calls", MaxUpstreamRequestsPerSearch);
                return null;
            }

            HttpRequestMessage? request = null;
            HttpResponseMessage response = null!;
            try
            {
                request = new HttpRequestMessage(HttpMethod.Post, "")
                {
                    Content = new StringContent(body, Encoding.UTF8, "application/json")
                };
                response = await _http.SendAsync(request);
                var json = await response.Content.ReadAsStringAsync();

                if ((int)response.StatusCode == 429)
                {
                    Mark(health, h => h.SawRateLimit = true);
                    _logger.LogWarning("start.gg rate limit hit (attempt {Attempt}/{Max})", attempt, MaxAttemptsPerRequest);
                    if (attempt < MaxAttemptsPerRequest) await Task.Delay(TimeSpan.FromSeconds(2 * attempt));
                    continue;
                }
                if (response.StatusCode == HttpStatusCode.Unauthorized || response.StatusCode == HttpStatusCode.Forbidden
                    || (int)response.StatusCode == 400 && json.Contains("Invalid authentication token"))
                {
                    Mark(health, h => h.SawAuthFailure = true);
                    _logger.LogError("start.gg rejected credentials (HTTP {Status}): {Body}. Check STARTGG_APIKEY.", (int)response.StatusCode, Truncate(json));
                    return null;
                }

                response.EnsureSuccessStatusCode();

                var node = JsonNode.Parse(json);
                // GraphQL-level failures come back as HTTP 200 with data:null + errors[]
                if (node?["errors"] != null)
                {
                    _logger.LogWarning("start.gg GraphQL errors: {Errors}", node["errors"]!.ToJsonString());
                    return null;
                }
                if (health != null) Interlocked.Increment(ref health.Successes);
                return node?["data"];
            }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
            {
                Mark(health, h => h.SawTransportFailure = true);
                _logger.LogWarning(ex, "start.gg request failed (attempt {Attempt}/{Max})", attempt, MaxAttemptsPerRequest);
                if (attempt >= MaxAttemptsPerRequest) return null;
            }
            finally
            {
                request?.Dispose();
                response?.Dispose();
            }
        }

        return null;
    }

    private static void Mark(UpstreamHealth? health, Action<UpstreamHealth> set)
    {
        if (health != null) set(health);
    }

    private static string Truncate(string s) => s.Length <= 300 ? s : s[..300] + "…";

    internal void ThrowIfOutage(UpstreamHealth health)
    {
        if (health.SawAuthFailure)
            throw new StartGgUnavailableException("start.gg rejected the configured API key (invalid or revoked STARTGG_APIKEY)");
        if (health.SawRateLimit)
            throw new StartGgUnavailableException("start.gg rate limit exceeded while searching — try again in a minute", isRateLimit: true);
        if (health.SawTransportFailure)
            throw new StartGgUnavailableException("could not reach start.gg");
    }

    private List<PlayerSearchResult> ExtractParticipants(JsonArray? nodes, HashSet<string> seen)
    {
        var results = new List<PlayerSearchResult>();
        if (nodes == null) return results;
        foreach (var node in nodes)
        {
            var user = node?["user"];
            if (user?["id"] == null) continue;
            var slug = user["slug"]?.GetValue<string>()?.Replace("user/", "") ?? "";
            if (string.IsNullOrEmpty(slug) || !seen.Add(slug)) continue;
            results.Add(new PlayerSearchResult
            {
                GamerTag = node?["gamerTag"]?.GetValue<string>() ?? "",
                Prefix = user["player"]?["prefix"]?.GetValue<string>(),
                Slug = slug,
                UserId = user["id"]!.GetValue<long>()
            });
        }
        return results;
    }

    public async Task<List<PlayerSearchResult>> SearchAsync(string query, CancellationToken ct = default)
    {
        query = query.Trim();
        var seen = new HashSet<string>();
        var results = new List<PlayerSearchResult>();
        var health = new UpstreamHealth();

        // 1. Direct slug lookup — instant for users who paste their slug
        var directData = await ExecuteAsync(DirectUserQuery, new { slug = query }, health);
        var directUser = directData?["user"];
        if (directUser?["id"] != null)
        {
            var slug = directUser["slug"]?.GetValue<string>()?.Replace("user/", "") ?? "";
            if (!string.IsNullOrEmpty(slug))
                return [new PlayerSearchResult
                {
                    GamerTag = directUser["player"]?["gamerTag"]?.GetValue<string>() ?? query,
                    Prefix = directUser["player"]?["prefix"]?.GetValue<string>(),
                    Slug = slug,
                    UserId = directUser["id"]!.GetValue<long>()
                }];
        }

        ThrowIfOutage(health);
        if (ct.IsCancellationRequested) return results;

        // 2. Run both searches in parallel: curated majors + recent local events
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var oneYearAgo = DateTimeOffset.UtcNow.AddYears(-1).ToUnixTimeSeconds();

        var recentTask = SearchRecentAsync(query, now, oneYearAgo, seen, health, ct);
        var majorsTask = SearchMajorsAsync(query, seen, health, ct);

        await Task.WhenAll(recentTask, majorsTask);
        results.AddRange(await recentTask);
        results.AddRange(await majorsTask);

        // Every upstream call failed — surface degradation instead of a fake "no results"
        if (results.Count == 0 && health.Outaged)
            ThrowIfOutage(health);

        return results.Take(10).ToList();
    }

    private async Task<List<PlayerSearchResult>> SearchRecentAsync(
        string tag, long now, long afterDate, HashSet<string> seen, UpstreamHealth health, CancellationToken ct)
    {
        var results = new List<PlayerSearchResult>();
        for (int page = 1; page <= 5 && !ct.IsCancellationRequested; page++)
        {
            if (health.Outaged) break;
            var data = await ExecuteAsync(RecentBatchedQuery, new { tag, beforeDate = now, afterDate, page }, health);
            var tournaments = data?["tournaments"]?["nodes"]?.AsArray();
            if (tournaments == null || tournaments.Count == 0) break;

            foreach (var t in tournaments)
            {
                var nodes = t?["participants"]?["nodes"]?.AsArray();
                results.AddRange(ExtractParticipants(nodes, seen));
            }
            if (results.Count >= 5) break;
        }
        return results;
    }

    private async Task<List<PlayerSearchResult>> SearchMajorsAsync(
        string tag, HashSet<string> seen, UpstreamHealth health, CancellationToken ct)
    {
        var results = new List<PlayerSearchResult>();
        foreach (var batch in Majors.Chunk(8))
        {
            if (ct.IsCancellationRequested || results.Count >= 5 || health.Outaged) break;
            var tasks = batch.Select(async slug =>
            {
                var data = await ExecuteAsync(MajorSearchQuery, new { slug, tag }, health);
                return data?["tournament"]?["participants"]?["nodes"]?.AsArray();
            });
            foreach (var nodes in await Task.WhenAll(tasks))
                results.AddRange(ExtractParticipants(nodes, seen));
            if (results.Count >= 5) break;
        }
        return results;
    }
}
