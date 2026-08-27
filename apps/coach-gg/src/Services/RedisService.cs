using StackExchange.Redis;
using System.Text.Json;
using CoachGG.Models;

namespace CoachGG.Services;

public class RedisService
{
    private readonly IDatabase _db;
    private readonly ILogger<RedisService> _logger;
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    public RedisService(IConnectionMultiplexer redis, ILogger<RedisService> logger)
    {
        _db = redis.GetDatabase();
        _logger = logger;
    }

    public async Task<(long UserId, List<RawGame> Games)?> GetCachedGamesAsync(string slug)
    {
        try
        {
            var val = await _db.StringGetAsync($"game_cache:{slug}");
            if (!val.HasValue) return null;
            var data = JsonSerializer.Deserialize<CachedGames>(val!, JsonOpts);
            return data == null ? null : (data.UserId, data.Games);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Redis read failed for {Slug}", slug);
            return null;
        }
    }

    public async Task SetCachedGamesAsync(string slug, long userId, List<RawGame> games)
    {
        try
        {
            var data = new CachedGames { UserId = userId, Games = games };
            await _db.StringSetAsync($"game_cache:{slug}", JsonSerializer.Serialize(data, JsonOpts), TimeSpan.FromHours(24));
        }
        catch (Exception ex) { _logger.LogWarning(ex, "Redis write failed for {Slug}", slug); }
    }

    public async Task<JobState?> GetJobStateAsync(string slug)
    {
        try
        {
            var val = await _db.StringGetAsync($"job_state:{slug}");
            return val.HasValue ? JsonSerializer.Deserialize<JobState>(val!, JsonOpts) : null;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Redis job-state read failed for {Slug}", slug);
            return null;
        }
    }

    public async Task SetJobStateAsync(string slug, JobState state, TimeSpan? ttl = null)
    {
        try
        {
            await _db.StringSetAsync($"job_state:{slug}", JsonSerializer.Serialize(state, JsonOpts), ttl ?? TimeSpan.FromHours(1));
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Redis job-state write failed for {Slug}", slug);
        }
    }

    public async Task DeleteJobStateAsync(string slug)
    {
        try { await _db.KeyDeleteAsync($"job_state:{slug}"); }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Redis job-state deletion failed for {Slug}", slug);
        }
    }

    private class CachedGames
    {
        public long UserId { get; set; }
        public List<RawGame> Games { get; set; } = new();
    }
}
