using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using CoachGG.Models;

namespace CoachGG.Services;

public class StartGGService
{
    private readonly HttpClient _http;
    private readonly ILogger<StartGGService> _logger;

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

    public StartGGService(HttpClient http, ILogger<StartGGService> logger)
    {
        _http = http;
        _logger = logger;
    }

    private const int MaxAttemptsPerRequest = 3;

    private async Task<JsonNode?> ExecuteAsync(string query, object variables)
    {
        var body = JsonSerializer.Serialize(new { query, variables });

        for (var attempt = 1; attempt <= MaxAttemptsPerRequest; attempt++)
        {
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

                if ((int)response.StatusCode == 429 || (int)response.StatusCode == 503)
                {
                    _logger.LogWarning("Rate limited, retrying in 5s... (attempt {Attempt}/{Max})", attempt, MaxAttemptsPerRequest);
                    if (attempt < MaxAttemptsPerRequest)
                    {
                        await Task.Delay(5000);
                        continue;
                    }
                    throw new Exception($"start.gg rate limit persisted after {MaxAttemptsPerRequest} attempts — try again in a minute");
                }
                if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized
                    || response.StatusCode == System.Net.HttpStatusCode.Forbidden
                    || (int)response.StatusCode == 400 && json.Contains("Invalid authentication token"))
                {
                    // Never retry auth failures — surface the actual ops problem instead of hanging
                    throw new Exception($"start.gg rejected the configured API key (HTTP {(int)response.StatusCode}). Check STARTGG_APIKEY.");
                }

                response.EnsureSuccessStatusCode();

                var node = JsonNode.Parse(json);
                if (node?["errors"] != null)
                    throw new Exception($"GraphQL error: {node["errors"]!.ToJsonString()}");

                return node?["data"];
            }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException && attempt < MaxAttemptsPerRequest)
            {
                _logger.LogWarning(ex, "start.gg request failed (attempt {Attempt}/{Max})", attempt, MaxAttemptsPerRequest);
            }
            finally
            {
                request?.Dispose();
                response?.Dispose();
            }
        }

        throw new Exception($"start.gg unreachable after {MaxAttemptsPerRequest} attempts");
    }

    public async Task<(long? UserId, List<RawGame> Games)> GetGamesMetadataAsync(
        string slug,
        Func<int, int, List<RawGame>, long, Task>? onProgress = null)
    {
        var countVars = new { slug, page = 1, perPage = 30 };
        var countData = await ExecuteAsync(GamesCountQuery, countVars);

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
            var vars = new { slug, page, perPage = 30 };
            var data = await ExecuteAsync(GamesMetadataQuery, vars);
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
