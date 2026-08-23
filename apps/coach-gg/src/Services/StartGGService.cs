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

    private async Task<JsonNode?> ExecuteAsync(string query, object variables)
    {
        var body = JsonSerializer.Serialize(new { query, variables });

        while (true)
        {
            var request = new HttpRequestMessage(HttpMethod.Post, "")
            {
                Content = new StringContent(body, Encoding.UTF8, "application/json")
            };

            var response = await _http.SendAsync(request);

            if ((int)response.StatusCode == 429 || (int)response.StatusCode == 503)
            {
                _logger.LogWarning("Rate limited, retrying in 5s...");
                await Task.Delay(5000);
                continue;
            }

            response.EnsureSuccessStatusCode();
            var json = await response.Content.ReadAsStringAsync();
            var node = JsonNode.Parse(json);

            if (node?["errors"] != null)
                throw new Exception($"GraphQL error: {node["errors"]}");

            return node?["data"];
        }
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

        var userId = countData["user"]!["id"]!.GetValue<long>();
        var totalPages = countData["user"]!["player"]!["sets"]!["pageInfo"]!["totalPages"]!.GetValue<int>();

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
