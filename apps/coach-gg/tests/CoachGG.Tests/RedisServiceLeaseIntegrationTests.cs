using CoachGG.Services;
using CoachGG.Models;
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
            Assert.False(await service.TrySetJobStateIfLeaseOwnerAsync(
                slug,
                firstOwner,
                new JobState { Status = JobStatus.Error }));
            Assert.True(await service.RenewJobLeaseAsync(slug, secondOwner, duration));
            Assert.True(await service.TrySetJobStateIfLeaseOwnerAsync(
                slug,
                secondOwner,
                new JobState { Status = JobStatus.Complete }));
            Assert.Equal(JobStatus.Complete, (await service.GetJobStateAsync(slug))!.Status);

            await service.SetJobStateAsync(slug, new JobState { Status = JobStatus.Error });
            Assert.Equal(JobStatus.Error, (await service.GetJobStateAsync(slug))!.Status);
            await service.DeleteJobStateAsync(slug);
            Assert.Null(await service.GetJobStateAsync(slug));
        }
        finally
        {
            await service.ReleaseJobLeaseAsync(slug, secondOwner);
            await service.DeleteJobStateAsync(slug);
        }
    }
}
