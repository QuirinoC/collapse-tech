using Microsoft.Extensions.Options;
using PixelBoard.Application;
using PixelBoard.Configuration;
using PixelBoard.Infrastructure.Ledger;
using StackExchange.Redis;

namespace PixelBoard.Tests;

public sealed class RedisPlacementRateLimiterIntegrationTests
{
    [RedisFact]
    [Trait("Category", "Integration")]
    public async Task HighPerIpCapsAreEnforcedAcrossAccounts()
    {
        var connectionString = Environment.GetEnvironmentVariable("PIXELBOARD_TEST_REDIS")!;
        await using var redis = await ConnectionMultiplexer.ConnectAsync(connectionString);
        var limiter = new RedisPlacementRateLimiter(
            redis,
            Options.Create(new RedisOptions
            {
                ConnectionString = connectionString,
                InstanceName = $"PixelBoardPlaceTest_{Guid.NewGuid():N}_"
            }),
            Options.Create(new PlacementRateLimitOptions
            {
                MaxPlacementsPerIpPerMinute = 3,
                MaxAccountsPerIpPerMinute = 2
            }));
        var ip = "203.0.113.50";

        Assert.True(await limiter.TryAcquireAsync(new AccountId("a"), ip));
        Assert.True(await limiter.TryAcquireAsync(new AccountId("b"), ip));
        Assert.False(await limiter.TryAcquireAsync(new AccountId("c"), ip));
    }
}
