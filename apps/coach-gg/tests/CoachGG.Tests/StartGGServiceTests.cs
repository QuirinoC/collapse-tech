using System.Net.Http.Headers;
using System.Text;
using CoachGG.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace CoachGG.Tests;

public class StartGGServiceTests
{
    private const string EmptyUserJson = """{"data":{"user":null}}""";

    private sealed class StubHandler(Func<HttpRequestMessage, HttpResponseMessage> responder) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
            => Task.FromResult(responder(request));
    }

    private static StartGGService CreateService(
        StubHandler handler,
        Func<TimeSpan, CancellationToken, Task>? delay = null)
        => new(
            new HttpClient(handler) { BaseAddress = new Uri("https://api.start.gg/gql/alpha"), Timeout = TimeSpan.FromSeconds(10) },
            NullLogger<StartGGService>.Instance,
            delay ?? ((_, ct) => { ct.ThrowIfCancellationRequested(); return Task.CompletedTask; }),
            applyJitter: d => d);

    private static HttpResponseMessage Json(int status, string body, string? retryAfter = null)
    {
        var response = new HttpResponseMessage((System.Net.HttpStatusCode)status)
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json")
        };
        if (retryAfter != null)
            response.Headers.RetryAfter = RetryConditionHeaderValue.Parse(retryAfter);
        return response;
    }

    private static Func<TimeSpan, CancellationToken, Task> RecordDelays(List<TimeSpan> delays)
        => (wait, ct) =>
        {
            delays.Add(wait);
            ct.ThrowIfCancellationRequested();
            return Task.CompletedTask;
        };

    [Fact]
    public async Task ExpiredToken_SurfacesStartGgMessage()
    {
        var svc = CreateService(new StubHandler(_ =>
            Json(401, """{"success":false,"message":"Token has expired."}""")));

        var ex = await Assert.ThrowsAsync<Exception>(() => svc.GetGamesMetadataAsync("bc954a2e"));
        Assert.Contains("Token has expired", ex.Message);
        Assert.Contains("STARTGG_APIKEY", ex.Message);
    }

    [Fact]
    public async Task InvalidToken_DoesNotRetry()
    {
        var calls = 0;
        var delays = new List<TimeSpan>();
        var svc = CreateService(new StubHandler(_ =>
        {
            Interlocked.Increment(ref calls);
            return Json(401, """{"success":false,"message":"Invalid authentication token"}""");
        }), RecordDelays(delays));

        await Assert.ThrowsAsync<Exception>(() => svc.GetGamesMetadataAsync("bc954a2e"));
        Assert.Equal(1, calls);
        Assert.Empty(delays);
    }

    [Fact]
    public async Task RateLimitedThenOk_SucceedsWithoutThrowing()
    {
        var calls = 0;
        var delays = new List<TimeSpan>();
        var svc = CreateService(new StubHandler(_ =>
        {
            var n = Interlocked.Increment(ref calls);
            return n == 1
                ? Json(429, """{"message":"Too Many Requests"}""")
                : Json(200, EmptyUserJson);
        }), RecordDelays(delays));

        var result = await svc.GetGamesMetadataAsync("bc954a2e");
        Assert.Null(result.UserId);
        Assert.Equal(2, calls);
        Assert.Equal(TimeSpan.FromSeconds(2), Assert.Single(delays));
    }

    [Fact]
    public async Task RateLimitedWithRetryAfter_WaitsThatDuration()
    {
        var delays = new List<TimeSpan>();
        var svc = CreateService(new StubHandler(_ =>
        {
            if (delays.Count == 0)
                return Json(429, """{"message":"Too Many Requests"}""", retryAfter: "7");
            return Json(200, EmptyUserJson);
        }), RecordDelays(delays));

        await svc.GetGamesMetadataAsync("bc954a2e");
        Assert.Equal(TimeSpan.FromSeconds(7), Assert.Single(delays));
    }

    [Fact]
    public async Task PersistentRateLimit_ThrowsAfterMaxAttempts()
    {
        var calls = 0;
        var delays = new List<TimeSpan>();
        var svc = CreateService(new StubHandler(_ =>
        {
            Interlocked.Increment(ref calls);
            return Json(429, """{"message":"Too Many Requests"}""");
        }), RecordDelays(delays));

        var ex = await Assert.ThrowsAsync<Exception>(() => svc.GetGamesMetadataAsync("bc954a2e"));
        Assert.Contains("rate limit", ex.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(10, calls);
        Assert.Equal(9, delays.Count);
        Assert.Equal(TimeSpan.FromSeconds(2), delays[0]);
        Assert.Equal(TimeSpan.FromSeconds(4), delays[1]);
        Assert.Equal(TimeSpan.FromSeconds(8), delays[2]);
        Assert.Equal(TimeSpan.FromSeconds(16), delays[3]);
        Assert.Equal(TimeSpan.FromSeconds(32), delays[4]);
        Assert.All(delays.Skip(4), d => Assert.Equal(TimeSpan.FromSeconds(32), d));
    }

    [Fact]
    public async Task After429_NextRequestWaitsRemainingCooldown()
    {
        var calls = 0;
        var delays = new List<TimeSpan>();
        var svc = CreateService(new StubHandler(_ =>
        {
            var n = Interlocked.Increment(ref calls);
            if (n == 1)
                return Json(429, """{"message":"Too Many Requests"}""");
            return Json(200, EmptyUserJson);
        }), RecordDelays(delays));

        await svc.GetGamesMetadataAsync("bc954a2e");
        await svc.GetGamesMetadataAsync("bc954a2e");

        Assert.Equal(3, calls);
        Assert.Equal(2, delays.Count);
        Assert.Equal(TimeSpan.FromSeconds(2), delays[0]);
        Assert.InRange(delays[1].TotalSeconds, 19, 20);
    }

    [Fact]
    public async Task CancellationDuringWait_StillCancels()
    {
        using var cts = new CancellationTokenSource();
        var waiting = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var svc = CreateService(new StubHandler(_ =>
            Json(429, """{"message":"Too Many Requests"}""", retryAfter: "20")),
            async (_, ct) =>
            {
                waiting.TrySetResult();
                await Task.Delay(Timeout.InfiniteTimeSpan, ct);
            });

        var task = svc.GetGamesMetadataAsync("bc954a2e", ct: cts.Token);
        await waiting.Task.WaitAsync(TimeSpan.FromSeconds(2));
        cts.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => task);
    }
}
