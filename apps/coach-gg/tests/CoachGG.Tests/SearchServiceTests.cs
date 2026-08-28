using System.Text;
using CoachGG.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace CoachGG.Tests;

/// <summary>
/// Regression tests for the silent-upstream-failure bug: start.gg returning
/// HTTP 400/401 "Invalid authentication token" (blank STARTGG_APIKEY) used to be swallowed
/// and surfaced to users as an empty search result (200 []).
/// </summary>
public class SearchServiceTests
{
    private sealed class StubHandler(Func<HttpRequestMessage, HttpResponseMessage> responder) : HttpMessageHandler
    {
        public int Calls;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Interlocked.Increment(ref Calls);
            return Task.FromResult(responder(request));
        }
    }

    private sealed class BlockingHandler : HttpMessageHandler
    {
        public int Calls;
        public CancellationToken RequestCancellationToken;

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Interlocked.Increment(ref Calls);
            RequestCancellationToken = ct;
            await Task.Delay(Timeout.InfiniteTimeSpan, ct);
            throw new InvalidOperationException("The cancellation token should stop this request.");
        }
    }

    private static SearchService CreateService(StubHandler handler)
        => new(new HttpClient(handler) { BaseAddress = new Uri("https://api.start.gg/gql/alpha"), Timeout = TimeSpan.FromSeconds(10) },
               Microsoft.Extensions.Logging.Abstractions.NullLogger<SearchService>.Instance);

    private static SearchService CreateService(BlockingHandler handler)
        => new(new HttpClient(handler) { BaseAddress = new Uri("https://api.start.gg/gql/alpha"), Timeout = TimeSpan.FromSeconds(10) },
               Microsoft.Extensions.Logging.Abstractions.NullLogger<SearchService>.Instance);

    private static HttpResponseMessage Json(int status, string body)
        => new((System.Net.HttpStatusCode)status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    [Fact]
    public async Task AuthFailure_ThrowsUnavailable_NotEmptyList()
    {
        var svc = CreateService(new StubHandler(_ =>
            Json(400, """{"success":false,"message":"Invalid authentication token"}""")));

        var ex = await Assert.ThrowsAsync<StartGgUnavailableException>(() => svc.SearchAsync("bc954a2e"));
        Assert.Contains("STARTGG_APIKEY", ex.Message);
    }

    [Fact]
    public async Task Unauthorized_ThrowsUnavailable()
    {
        var svc = CreateService(new StubHandler(_ => Json(401, """{"success":false}""")));
        await Assert.ThrowsAsync<StartGgUnavailableException>(() => svc.SearchAsync("MkLeo"));
    }

    [Fact]
    public async Task RateLimitOnEveryAttempt_ThrowsRateLimit()
    {
        var svc = CreateService(new StubHandler(_ => Json(429, """{"success":false}""")));
        var ex = await Assert.ThrowsAsync<StartGgUnavailableException>(() => svc.SearchAsync("MkLeo"));
        Assert.True(ex.IsRateLimit);
    }

    [Fact]
    public async Task GraphQLErrorsWithHttp200_ReturnsNoResults_ButDoesNotThrow()
    {
        // HTTP 200 with data:null + errors[] is a per-query failure, not an outage —
        // must be logged and handled without crashing the endpoint.
        var svc = CreateService(new StubHandler(_ =>
            Json(200, """{"data":null,"errors":[{"message":"something failed"}]}""")));
        var results = await svc.SearchAsync("bc954a2e");
        Assert.Empty(results);
    }

    [Fact]
    public async Task DirectSlugHit_SingleRequest_ReturnsPlayer()
    {
        // Regression guard for the ?slug=bc954a2e contract: a valid direct user lookup
        // returns that player without fanning out to majors/recent searches.
        var handler = new StubHandler(_ => Json(200,
            """{"data":{"user":{"id":123456,"slug":"user/bc954a2e","player":{"gamerTag":"TestPlayer","prefix":"TST"}}}}"""));

        var results = await CreateService(handler).SearchAsync("bc954a2e");

        var player = Assert.Single(results);
        Assert.Equal("bc954a2e", player.Slug);
        Assert.Equal("TestPlayer", player.GamerTag);
        Assert.Equal("TST", player.Prefix);
        Assert.Equal(123456, player.UserId);
        Assert.Equal(1, handler.Calls); // direct hit must not fan out
    }

    [Fact]
    public async Task TransportFailure_ThenSuccess_Recovers()
    {
        var failedOnce = false;
        var handler = new StubHandler(_ =>
        {
            if (!failedOnce)
            {
                failedOnce = true;
                throw new HttpRequestException("boom");
            }
            return Json(200,
                """{"data":{"user":{"id":42,"slug":"user/bc954a2e","player":{"gamerTag":"RecoveringPlayer"}}}}""");
        });

        var results = await CreateService(handler).SearchAsync("bc954a2e");

        var player = Assert.Single(results);
        Assert.Equal("RecoveringPlayer", player.GamerTag);
    }

    [Fact]
    public async Task Cancellation_AbortsTheInFlightUpstreamRequest()
    {
        var handler = new BlockingHandler();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(1));

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            CreateService(handler).SearchAsync("bc954a2e", cts.Token));

        Assert.Equal(1, handler.Calls);
        Assert.True(handler.RequestCancellationToken.CanBeCanceled);
        Assert.True(handler.RequestCancellationToken.IsCancellationRequested);
    }
}
