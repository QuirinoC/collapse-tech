using System.Text;
using CoachGG.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace CoachGG.Tests;

public class StartGGServiceTests
{
    private sealed class StubHandler(Func<HttpRequestMessage, HttpResponseMessage> responder) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
            => Task.FromResult(responder(request));
    }

    private static StartGGService CreateService(StubHandler handler)
        => new(new HttpClient(handler) { BaseAddress = new Uri("https://api.start.gg/gql/alpha"), Timeout = TimeSpan.FromSeconds(10) },
               NullLogger<StartGGService>.Instance);

    private static HttpResponseMessage Json(int status, string body)
        => new((System.Net.HttpStatusCode)status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

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
        var svc = CreateService(new StubHandler(_ =>
        {
            Interlocked.Increment(ref calls);
            return Json(401, """{"success":false,"message":"Invalid authentication token"}""");
        }));

        await Assert.ThrowsAsync<Exception>(() => svc.GetGamesMetadataAsync("bc954a2e"));
        Assert.Equal(1, calls);
    }
}
