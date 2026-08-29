using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using PixelBoard.Application;
using PixelBoard.Configuration;
using StackExchange.Redis;

namespace PixelBoard.Infrastructure.Ledger;

public sealed class RedisPlacementRateLimiter(
    IConnectionMultiplexer redis,
    IOptions<RedisOptions> redisOptions,
    IOptions<PlacementRateLimitOptions> rateLimitOptions) : IPlacementRateLimiter
{
    public static readonly TimeSpan Window = TimeSpan.FromMinutes(1);

    private const string AcquireScript =
        """
        local n = redis.call('INCR', KEYS[1])
        if n == 1 then
            redis.call('EXPIRE', KEYS[1], ARGV[1])
        end
        if n > tonumber(ARGV[2]) then
            return 1
        end
        redis.call('SADD', KEYS[2], ARGV[3])
        if redis.call('TTL', KEYS[2]) < 0 then
            redis.call('EXPIRE', KEYS[2], ARGV[1])
        end
        if redis.call('SCARD', KEYS[2]) > tonumber(ARGV[4]) then
            return 2
        end
        return 0
        """;

    private readonly RedisOptions _redis = redisOptions.Value;
    private readonly PlacementRateLimitOptions _limits = rateLimitOptions.Value;

    public async ValueTask<bool> TryAcquireAsync(
        AccountId accountId,
        string? clientIp,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (string.IsNullOrWhiteSpace(clientIp))
        {
            return true;
        }

        var result = (int)await redis.GetDatabase().ScriptEvaluateAsync(
            AcquireScript,
            [PlacementKey(clientIp), AccountKey(clientIp)],
            [
                (int)Window.TotalSeconds,
                _limits.MaxPlacementsPerIpPerMinute,
                accountId.Value,
                _limits.MaxAccountsPerIpPerMinute
            ]);
        return result == 0;
    }

    private RedisKey PlacementKey(string clientIp) =>
        $"{_redis.InstanceName}PlaceRate:{Hash(clientIp)}";

    private RedisKey AccountKey(string clientIp) =>
        $"{_redis.InstanceName}PlaceAccounts:{Hash(clientIp)}";

    private static string Hash(string value) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
}
