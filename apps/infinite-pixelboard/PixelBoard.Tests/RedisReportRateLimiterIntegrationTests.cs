using Microsoft.Extensions.Options;
using PixelBoard.Application;
using PixelBoard.Configuration;
using PixelBoard.Contracts.V1;
using PixelBoard.Infrastructure.Moderation;
using StackExchange.Redis;

namespace PixelBoard.Tests;

public sealed class RedisReportRateLimiterIntegrationTests
{
    [RedisFact]
    [Trait("Category", "Integration")]
    public async Task DuplicateAndVolumeLimitsAreAtomicAndFailedReportsCanReleaseAdmission()
    {
        var connectionString = Environment.GetEnvironmentVariable("PIXELBOARD_TEST_REDIS")!;
        await using var redis = await ConnectionMultiplexer.ConnectAsync(connectionString);
        var limiter = new RedisReportRateLimiter(
            redis,
            Options.Create(new RedisOptions
            {
                ConnectionString = connectionString,
                InstanceName = $"PixelBoardReportTest_{Guid.NewGuid():N}_"
            }));
        var accountId = new AccountId($"firebase-report-{Guid.NewGuid():N}");
        var submittedAt = DateTimeOffset.UtcNow;
        var first = Command(accountId, submittedAt, 0);

        Assert.Equal(
            ReportAdmissionOutcome.Allowed,
            await limiter.TryAcquireAsync(first));
        Assert.Equal(
            ReportAdmissionOutcome.Duplicate,
            await limiter.TryAcquireAsync(Command(accountId, submittedAt.AddSeconds(1), 0)));

        await limiter.ReleaseAsync(first);
        Assert.Equal(
            ReportAdmissionOutcome.Allowed,
            await limiter.TryAcquireAsync(Command(accountId, submittedAt.AddSeconds(2), 0)));

        for (var index = 1; index < RedisReportRateLimiter.MaxReportsPerWindow; index++)
        {
            Assert.Equal(
                ReportAdmissionOutcome.Allowed,
                await limiter.TryAcquireAsync(
                    Command(accountId, submittedAt.AddSeconds(index + 2), index)));
        }

        Assert.Equal(
            ReportAdmissionOutcome.RateLimited,
            await limiter.TryAcquireAsync(
                Command(
                    accountId,
                    submittedAt.AddSeconds(20),
                    RedisReportRateLimiter.MaxReportsPerWindow)));
    }

    private static ReportCommand Command(
        AccountId accountId,
        DateTimeOffset submittedAt,
        int left) =>
        new(
            ReportId.New(),
            accountId,
            new ReportRegion(0, left, 1, 1),
            ReportReason.Threat,
            null,
            new ClientContext("test", "1.0"),
            submittedAt);
}
