using CoachGG.Services;
using Microsoft.Extensions.Logging.Abstractions;
using StackExchange.Redis;
using Xunit;

namespace CoachGG.Tests;

public class RedisServiceLeaseIntegrationTests
{
    [RedisIntegrationFact]
    public async Task JobLease_ExcludesOtherOwners_AndSupportsExpiryTakeover()
    {
        var connectionString = Environment.GetEnvironmentVariable("COACHGG_TEST_REDIS")!;
        await using var redis = await ConnectionMultiplexer.ConnectAsync(connectionString);
        var service = new RedisService(redis, NullLogger<RedisService>.Instance);
        var slug = $"lease-test-{Guid.NewGuid():N}";
        var firstOwner = Guid.NewGuid().ToString("N");
        var secondOwner = Guid.NewGuid().ToString("N");
        var duration = TimeSpan.FromSeconds(1);

        try
        {
            Assert.True(await service.TryAcquireJobLeaseAsync(slug, firstOwner, duration));
            Assert.False(await service.TryAcquireJobLeaseAsync(slug, secondOwner, duration));

            await Task.Delay(duration + TimeSpan.FromMilliseconds(500));
            Assert.True(await service.TryAcquireJobLeaseAsync(slug, secondOwner, duration));

            Assert.False(await service.ReleaseJobLeaseAsync(slug, firstOwner));
            Assert.False(await service.RenewJobLeaseAsync(slug, firstOwner, duration));
            Assert.True(await service.RenewJobLeaseAsync(slug, secondOwner, duration));
        }
        finally
        {
            await service.ReleaseJobLeaseAsync(slug, secondOwner);
        }
    }
}
