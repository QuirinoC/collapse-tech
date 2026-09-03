using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using TrustApi.Application;
using TrustApi.Domain;
using TrustApi.Infrastructure;
using TrustApi.Infrastructure.Identity;

namespace TrustApi.Tests;

public sealed class TrustEngineTests
{
    [Fact]
    public async Task LookRequiresConfirmAndDoesNotLeakSealedCoordinates()
    {
        var engine = NewEngine(out var store);
        var you = await engine.SignInAsync("development", "you", "Sam", CancellationToken.None);
        await engine.EnsureReviewCircleAsync(you.Id, CancellationToken.None);
        var circle = await engine.GetCircleAsync(you.Id, CancellationToken.None);
        var alex = circle.Members.Single(member => member.Person.DisplayName == "Alex");
        var jordan = circle.Members.Single(member => member.Person.DisplayName == "Jordan");

        Assert.False(alex.InboundLive);
        Assert.Null(alex.Live);
        Assert.True(jordan.InboundLive);
        Assert.NotNull(jordan.Live);

        await Assert.ThrowsAsync<TrustException>(() =>
            engine.LookAsync(you.Id, alex.Person.Id, confirmed: false, CancellationToken.None));

        var lookResult = await engine.LookAsync(you.Id, alex.Person.Id, confirmed: true, CancellationToken.None);
        var session = lookResult.Session;
        Assert.Equal(2, session.Event.HistoryWindowHours);
        Assert.True(session.Event.IncludedLive);
        Assert.NotEmpty(session.Trail);
        Assert.All(session.Trail, point =>
        {
            Assert.InRange(point.Latitude, 37, 38);
            Assert.InRange(point.Longitude, -123, -122);
        });

        var after = await engine.GetCircleAsync(you.Id, CancellationToken.None);
        var alexAfter = after.Members.Single(member => member.Person.DisplayName == "Alex");
        Assert.True(alexAfter.InboundLive);
        Assert.NotNull(alexAfter.Live);
        Assert.Contains(after.LookLog, look => look.SubjectName == "Alex");
    }

    [Fact]
    public async Task TimedShareRevertsToPreviousResting()
    {
        var engine = NewEngine(out _);
        var you = await engine.SignInAsync("development", "you", "Sam", CancellationToken.None);
        await engine.EnsureReviewCircleAsync(you.Id, CancellationToken.None);
        var circle = await engine.GetCircleAsync(you.Id, CancellationToken.None);
        var alex = circle.Members.Single(member => member.Person.DisplayName == "Alex").Person.Id;

        await engine.SetShareAsync(you.Id, alex, ShareResting.Always, null, CancellationToken.None);
        await engine.SetShareAsync(you.Id, alex, null, TimedShareDuration.Hour, CancellationToken.None);
        var timed = await engine.GetCircleAsync(you.Id, CancellationToken.None);
        var share = timed.Members.Single(member => member.Person.Id == alex).OutboundShare;
        Assert.True(share.Presentation(DateTimeOffset.UtcNow) is SharePresentation.Timed);
        if (share.Presentation(DateTimeOffset.UtcNow) is SharePresentation.Timed overlay)
        {
            Assert.Equal(ShareResting.Always, overlay.RevertsTo);
        }
    }

    [Fact]
    public async Task InviteJoinsTwoRealAccounts()
    {
        var engine = NewEngine(out _);
        var sam = await engine.SignInAsync("development", "sam", "Sam", CancellationToken.None);
        var jordan = await engine.SignInAsync("development", "jordan", "Jordan", CancellationToken.None);
        var invite = await engine.CreateInviteAsync(sam.Id, CancellationToken.None);
        await engine.AcceptInviteAsync(jordan.Id, invite.Code, CancellationToken.None);
        var circle = await engine.GetCircleAsync(sam.Id, CancellationToken.None);
        Assert.Contains(circle.Members, member => member.Person.DisplayName == "Jordan");
        var jordanView = circle.Members.Single(member => member.Person.DisplayName == "Jordan");
        Assert.Null(jordanView.Live);
        Assert.False(jordanView.InboundLive);
    }

    [Fact]
    public async Task CircleSponsorCoversPlacePingAndHistory()
    {
        var engine = NewEngine(out _);
        var you = await engine.SignInAsync("development", "you", "Sam", CancellationToken.None);
        await engine.EnsureReviewCircleAsync(you.Id, CancellationToken.None);
        await engine.GrantCircleAsync(you.Id, "test", CancellationToken.None);
        var circle = await engine.GetCircleAsync(you.Id, CancellationToken.None);
        Assert.True(circle.Coverage.IsCovered);
        Assert.True(circle.Coverage.ActingIsSponsor);
        var alex = circle.Members.Single(member => member.Person.DisplayName == "Alex");
        var lookResult = await engine.LookAsync(you.Id, alex.Person.Id, true, CancellationToken.None);
        var session = lookResult.Session;
        Assert.Equal(2, session.Event.HistoryWindowHours);
        var extended = await engine.ExtendLookAsync(you.Id, alex.Person.Id, CancellationToken.None);
        Assert.Equal(24, extended.Event.HistoryWindowHours);
        await engine.PlacePingAsync(you.Id, CancellationToken.None);
    }

    [Fact]
    public async Task IngestIsIgnoredWhenNotSharing()
    {
        var engine = NewEngine(out var store);
        var you = await engine.SignInAsync("development", "you", "Sam", CancellationToken.None);
        await engine.IngestAsync(
            you.Id,
            new LocationFix(DateTimeOffset.UtcNow, 37.76, -122.42),
            80,
            false,
            CancellationToken.None);
        Assert.Null(await store.LatestLocationAsync(you.Id, CancellationToken.None));
    }

    [Fact]
    public async Task IngestStoresWhenSharing()
    {
        var engine = NewEngine(out var store);
        var sam = await engine.SignInAsync("development", "sam", "Sam", CancellationToken.None);
        var jordan = await engine.SignInAsync("development", "jordan", "Jordan", CancellationToken.None);
        var invite = await engine.CreateInviteAsync(sam.Id, CancellationToken.None);
        await engine.AcceptInviteAsync(jordan.Id, invite.Code, CancellationToken.None);
        var fix = new LocationFix(DateTimeOffset.UtcNow, 37.76, -122.42);
        await engine.IngestAsync(sam.Id, fix, 70, false, CancellationToken.None);
        var latest = await store.LatestLocationAsync(sam.Id, CancellationToken.None);
        Assert.NotNull(latest);
        Assert.Equal(37.76, latest!.Latitude);
        Assert.Equal(-122.42, latest.Longitude);
    }

    [Fact]
    public async Task LookReturnsStoredTrailNotOnlyLatest()
    {
        var time = new MutableTimeProvider { UtcNow = new DateTimeOffset(2026, 8, 30, 18, 0, 0, TimeSpan.Zero) };
        var engine = NewEngine(out _, time);
        var (sam, jordan) = await PairAsync(engine);
        for (var i = 0; i < 5; i++)
        {
            time.UtcNow = time.UtcNow.AddMinutes(20);
            await engine.IngestAsync(
                sam.Id,
                new LocationFix(time.UtcNow, 37.750 + (i * 0.001), -122.410),
                80,
                false,
                CancellationToken.None);
        }

        var sealedCircle = await engine.GetCircleAsync(jordan.Id, CancellationToken.None);
        var sealedSam = sealedCircle.Members.Single(member => member.Person.Id == sam.Id);
        Assert.False(sealedSam.InboundLive);
        Assert.Null(sealedSam.Live);

        var lookResult = await engine.LookAsync(jordan.Id, sam.Id, confirmed: true, CancellationToken.None);
        var session = lookResult.Session;
        Assert.Equal(2, session.Event.HistoryWindowHours);
        Assert.Equal(5, session.Trail.Count);
        Assert.Equal(37.750, session.Trail[0].Latitude, 3);
        Assert.Equal(37.754, session.Trail[^1].Latitude, 3);
        Assert.Equal(session.Trail[^1].Latitude, session.Live.Latitude);

        var after = await engine.GetCircleAsync(jordan.Id, CancellationToken.None);
        Assert.NotNull(after.Members.Single(member => member.Person.Id == sam.Id).Live);
        Assert.Equal(5, after.ActiveSession?.Trail.Count);
        Assert.Contains(after.LookLog, look => look.SubjectId == sam.Id && look.IncludedLive);
    }

    [Fact]
    public async Task LookWindowExcludesPointsOlderThanTwoHours()
    {
        var time = new MutableTimeProvider { UtcNow = new DateTimeOffset(2026, 8, 30, 18, 0, 0, TimeSpan.Zero) };
        var engine = NewEngine(out var store, time);
        var (sam, jordan) = await PairAsync(engine);
        await engine.IngestAsync(
            sam.Id,
            new LocationFix(time.UtcNow.AddHours(-3), 37.70, -122.40),
            80,
            false,
            CancellationToken.None);
        await engine.IngestAsync(
            sam.Id,
            new LocationFix(time.UtcNow.AddMinutes(-30), 37.76, -122.42),
            80,
            false,
            CancellationToken.None);

        var lookResult = await engine.LookAsync(jordan.Id, sam.Id, true, CancellationToken.None);
        var session = lookResult.Session;
        Assert.Single(session.Trail);
        Assert.Equal(37.76, session.Trail[0].Latitude);
        var stored = await store.UnlockLocationsAsync(
            sam.Id,
            time.UtcNow.AddHours(-26),
            time.UtcNow,
            CancellationToken.None);
        Assert.Equal(2, stored.Count);
    }

    [Fact]
    public async Task IngestPrunesPointsOlderThanRetention()
    {
        var start = new DateTimeOffset(2026, 8, 30, 12, 0, 0, TimeSpan.Zero);
        var time = new MutableTimeProvider { UtcNow = start };
        var engine = NewEngine(out var store, time);
        var (sam, _) = await PairAsync(engine);
        await engine.IngestAsync(
            sam.Id,
            new LocationFix(start, 37.75, -122.41),
            80,
            false,
            CancellationToken.None);
        time.UtcNow = start.AddHours(27);
        await engine.IngestAsync(
            sam.Id,
            new LocationFix(time.UtcNow, 37.76, -122.42),
            80,
            false,
            CancellationToken.None);
        var kept = await store.UnlockLocationsAsync(
            sam.Id,
            start.AddDays(-2),
            time.UtcNow.AddMinutes(1),
            CancellationToken.None);
        Assert.Single(kept);
        Assert.Equal(37.76, kept[0].Latitude);
    }

    [Fact]
    public async Task CircleExtendReleasesTwentyFourHoursFromStore()
    {
        var time = new MutableTimeProvider { UtcNow = new DateTimeOffset(2026, 8, 30, 18, 0, 0, TimeSpan.Zero) };
        var engine = NewEngine(out _, time);
        var (sam, jordan) = await PairAsync(engine);
        await engine.GrantCircleAsync(jordan.Id, "test", CancellationToken.None);
        for (var hour = 10; hour >= 0; hour--)
        {
            await engine.IngestAsync(
                sam.Id,
                new LocationFix(time.UtcNow.AddHours(-hour), 37.70 + (hour * 0.001), -122.40),
                80,
                false,
                CancellationToken.None);
        }

        var lookResult = await engine.LookAsync(jordan.Id, sam.Id, true, CancellationToken.None);
        var look = lookResult.Session;
        Assert.Equal(2, look.Event.HistoryWindowHours);
        Assert.True(look.Trail.Count is >= 2 and <= 3);
        var extended = await engine.ExtendLookAsync(jordan.Id, sam.Id, CancellationToken.None);
        Assert.Equal(24, extended.Event.HistoryWindowHours);
        Assert.Equal(11, extended.Trail.Count);
    }

    [Fact]
    public async Task RevokeClearsLocationWhenCircleIsEmpty()
    {
        var engine = NewEngine(out var store);
        var (sam, jordan) = await PairAsync(engine);
        await engine.IngestAsync(
            sam.Id,
            new LocationFix(DateTimeOffset.UtcNow, 37.76, -122.42),
            70,
            false,
            CancellationToken.None);
        Assert.NotNull(await store.LatestLocationAsync(sam.Id, CancellationToken.None));
        await engine.RevokeAsync(sam.Id, jordan.Id, CancellationToken.None);
        Assert.Null(await store.LatestLocationAsync(sam.Id, CancellationToken.None));
        Assert.Null(await store.LatestLocationAsync(jordan.Id, CancellationToken.None));
    }

    [Fact]
    public async Task DeleteAccountRemovesLocationAndLooks()
    {
        var engine = NewEngine(out var store);
        var you = await engine.SignInAsync("development", "you", "Sam", CancellationToken.None);
        await engine.EnsureReviewCircleAsync(you.Id, CancellationToken.None);
        var circle = await engine.GetCircleAsync(you.Id, CancellationToken.None);
        var alex = circle.Members.Single(member => member.Person.DisplayName == "Alex");
        await engine.LookAsync(you.Id, alex.Person.Id, true, CancellationToken.None);
        await engine.DeleteAccountAsync(you.Id, CancellationToken.None);
        Assert.Null(await store.FindAccountAsync(you.Id, CancellationToken.None));
    }

    [Fact]
    public async Task SealedMemberDoesNotLeakPresenceWithoutGrant()
    {
        var engine = NewEngine(out _);
        var (sam, jordan) = await PairAsync(engine);
        await engine.IngestAsync(
            sam.Id,
            new LocationFix(DateTimeOffset.UtcNow, 37.76, -122.42),
            42,
            true,
            CancellationToken.None);
        var jordanView = await engine.GetCircleAsync(jordan.Id, CancellationToken.None);
        var sealedSam = jordanView.Members.Single(member => member.Person.Id == sam.Id);
        Assert.False(sealedSam.InboundLive);
        Assert.Null(sealedSam.Presence);
        Assert.Null(sealedSam.HomePresence);
        Assert.False(sealedSam.InboundPresenceGranted);
    }

    [Fact]
    public async Task PresenceGrantShowsHomeAwayWithoutCoordinates()
    {
        var engine = NewEngine(out _);
        var (sam, jordan) = await PairAsync(engine);
        var placeId = Guid.NewGuid();
        await engine.SetHomePlaceAsync(sam.Id, placeId, "Home", CancellationToken.None);
        await engine.SetPresenceGrantAsync(sam.Id, jordan.Id, true, CancellationToken.None);
        await engine.PostHomePresenceAsync(sam.Id, HomePresenceState.Away, null, CancellationToken.None);

        var jordanView = await engine.GetCircleAsync(jordan.Id, CancellationToken.None);
        var samMember = jordanView.Members.Single(member => member.Person.Id == sam.Id);
        Assert.False(samMember.InboundLive);
        Assert.Null(samMember.Presence);
        Assert.Null(samMember.Live);
        Assert.True(samMember.InboundPresenceGranted);
        Assert.NotNull(samMember.HomePresence);
        Assert.Equal(HomePresenceState.Away, samMember.HomePresence!.State);
        Assert.Equal("Home", samMember.HomePresence.PlaceLabel);

        await engine.PostHomePresenceAsync(sam.Id, HomePresenceState.Home, null, CancellationToken.None);
        jordanView = await engine.GetCircleAsync(jordan.Id, CancellationToken.None);
        samMember = jordanView.Members.Single(member => member.Person.Id == sam.Id);
        Assert.Equal(HomePresenceState.Home, samMember.HomePresence!.State);
    }

    [Fact]
    public async Task ActiveLookExpiresAfterTtl()
    {
        var time = new MutableTimeProvider { UtcNow = new DateTimeOffset(2026, 9, 2, 12, 0, 0, TimeSpan.Zero) };
        var engine = NewEngine(out var store, time);
        var (sam, jordan) = await PairAsync(engine);
        await engine.IngestAsync(
            sam.Id,
            new LocationFix(time.UtcNow, 37.76, -122.42),
            80,
            false,
            CancellationToken.None);
        var opened = await engine.LookAsync(jordan.Id, sam.Id, true, CancellationToken.None);
        Assert.True(opened.IsNew);
        var live = await engine.GetCircleAsync(jordan.Id, CancellationToken.None);
        Assert.True(live.Members.Single(member => member.Person.Id == sam.Id).InboundLive);

        time.UtcNow = time.UtcNow.Add(TrustRules.ActiveLookTtl).AddMinutes(1);
        var expired = await engine.GetCircleAsync(jordan.Id, CancellationToken.None);
        Assert.False(expired.Members.Single(member => member.Person.Id == sam.Id).InboundLive);
        Assert.Null(expired.ActiveSession);
        Assert.Null(await store.GetActiveLookAsync(jordan.Id, sam.Id, CancellationToken.None));
    }

    [Fact]
    public async Task ExtendLookUpdatesLookLogHours()
    {
        var engine = NewEngine(out var store);
        var (sam, jordan) = await PairAsync(engine);
        await engine.GrantCircleAsync(jordan.Id, "test", CancellationToken.None);
        await engine.IngestAsync(
            sam.Id,
            new LocationFix(DateTimeOffset.UtcNow, 37.76, -122.42),
            80,
            false,
            CancellationToken.None);
        var opened = await engine.LookAsync(jordan.Id, sam.Id, true, CancellationToken.None);
        Assert.Equal(2, opened.Session.Event.HistoryWindowHours);
        await engine.ExtendLookAsync(jordan.Id, sam.Id, CancellationToken.None);
        var log = await store.ListLooksAsync(sam.Id, DateTimeOffset.MinValue, CancellationToken.None);
        Assert.Contains(log, look => look.Id == opened.Session.Event.Id && look.HistoryWindowHours == 24);
    }

    [Fact]
    public async Task ReopeningActiveLookIsNotNew()
    {
        var engine = NewEngine(out _);
        var (sam, jordan) = await PairAsync(engine);
        await engine.IngestAsync(
            sam.Id,
            new LocationFix(DateTimeOffset.UtcNow, 37.76, -122.42),
            80,
            false,
            CancellationToken.None);
        var first = await engine.LookAsync(jordan.Id, sam.Id, true, CancellationToken.None);
        var second = await engine.LookAsync(jordan.Id, sam.Id, true, CancellationToken.None);
        Assert.True(first.IsNew);
        Assert.False(second.IsNew);
        Assert.Equal(first.Session.Event.Id, second.Session.Event.Id);
    }

    private static TrustEngine NewEngine(out MemoryTrustStore store, TimeProvider? time = null)
    {
        store = new MemoryTrustStore();
        return new TrustEngine(store, time ?? TimeProvider.System);
    }

    private static async Task<(Account Sam, Account Jordan)> PairAsync(TrustEngine engine)
    {
        var sam = await engine.SignInAsync("development", $"sam-{Guid.NewGuid():N}", "Sam", CancellationToken.None);
        var jordan = await engine.SignInAsync("development", $"jordan-{Guid.NewGuid():N}", "Jordan", CancellationToken.None);
        var invite = await engine.CreateInviteAsync(sam.Id, CancellationToken.None);
        await engine.AcceptInviteAsync(jordan.Id, invite.Code, CancellationToken.None);
        return (sam, jordan);
    }
}

internal sealed class MutableTimeProvider : TimeProvider
{
    public DateTimeOffset UtcNow { get; set; } = DateTimeOffset.UtcNow;

    public override DateTimeOffset GetUtcNow() => UtcNow;
}

public sealed class TrustApiFactory : WebApplicationFactory<Program>
{
    public TrustApiFactory()
    {
        Environment.SetEnvironmentVariable("Trust__Store", "memory");
        Environment.SetEnvironmentVariable("Trust__SeedReviewCircle", "true");
        Environment.SetEnvironmentVariable("Auth__SigningKey", "development-signing-key-32bytes-min!!");
        Environment.SetEnvironmentVariable("Auth__AllowDevelopmentSignIn", "true");
        Environment.SetEnvironmentVariable("StoreKit__AllowReviewUnlock", "true");
    }
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.UseSetting("Trust:Store", "memory");
        builder.UseSetting("Trust:SeedReviewCircle", "true");
        builder.UseSetting("Auth:SigningKey", "development-signing-key-32bytes-min!!");
        builder.UseSetting("Auth:AllowDevelopmentSignIn", "true");
        builder.UseSetting("StoreKit:AllowReviewUnlock", "true");
        builder.ConfigureAppConfiguration((_, config) =>
        {
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Trust:Store"] = "memory",
                ["Trust:SeedReviewCircle"] = "true",
                ["Auth:SigningKey"] = "development-signing-key-32bytes-min!!",
                ["Auth:AllowDevelopmentSignIn"] = "true",
                ["StoreKit:AllowReviewUnlock"] = "true"
            });
        });
    }
}

public sealed class TrustApiTests : IClassFixture<TrustApiFactory>
{
    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private readonly HttpClient _client;

    public TrustApiTests(TrustApiFactory factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task DevelopmentSessionSeedsCircleWithoutLeakingSealedGps()
    {
        var session = await _client.PostAsJsonAsync(
            "/api/v1/session/development",
            new { displayName = "Sam", provider = "development" });
        session.EnsureSuccessStatusCode();
        var payload = await session.Content.ReadFromJsonAsync<SessionWire>(Json);
        Assert.False(string.IsNullOrWhiteSpace(payload?.Token));

        using var circleRequest = new HttpRequestMessage(HttpMethod.Get, "/api/v1/circle");
        circleRequest.Headers.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", payload!.Token);
        var circleResponse = await _client.SendAsync(circleRequest);
        circleResponse.EnsureSuccessStatusCode();
        var circle = await circleResponse.Content.ReadFromJsonAsync<CircleWire>(Json);
        Assert.NotNull(circle);
        Assert.Equal(3, circle!.Members.Count);
        var alex = circle.Members.Single(member => member.Person.DisplayName == "Alex");
        var jordan = circle.Members.Single(member => member.Person.DisplayName == "Jordan");
        Assert.False(alex.InboundLive);
        Assert.Null(alex.Live);
        Assert.True(jordan.InboundLive);
        Assert.NotNull(jordan.Live);

        using var lookRequest = new HttpRequestMessage(HttpMethod.Post, "/api/v1/looks");
        lookRequest.Headers.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", payload.Token);
        lookRequest.Content = JsonContent.Create(new { subjectId = alex.Person.Id, confirmed = true });
        var lookResponse = await _client.SendAsync(lookRequest);
        lookResponse.EnsureSuccessStatusCode();
        var look = await lookResponse.Content.ReadFromJsonAsync<LookWire>(Json);
        Assert.NotNull(look?.Live);
        Assert.NotEmpty(look!.Trail);
        Assert.Equal(2, look.Event.HistoryWindowHours);
        Assert.True(look.Trail.Count >= 2);
    }

    [Fact]
    public async Task IngestAppendsHistoryReleasedOnLook()
    {
        using var factory = new TrustApiFactory();
        using var client = factory.WithWebHostBuilder(builder =>
        {
            builder.UseSetting("Trust:SeedReviewCircle", "false");
            builder.ConfigureAppConfiguration((_, config) =>
            {
                config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["Trust:SeedReviewCircle"] = "false"
                });
            });
        }).CreateClient();

        var samSession = await client.PostAsJsonAsync(
            "/api/v1/session/development",
            new { displayName = "Sam", provider = "development", deviceId = Guid.NewGuid().ToString("N") });
        samSession.EnsureSuccessStatusCode();
        var sam = await samSession.Content.ReadFromJsonAsync<SessionWire>(Json);
        var jordanSession = await client.PostAsJsonAsync(
            "/api/v1/session/development",
            new { displayName = "Jordan", provider = "development", deviceId = Guid.NewGuid().ToString("N") });
        jordanSession.EnsureSuccessStatusCode();
        var jordan = await jordanSession.Content.ReadFromJsonAsync<SessionWire>(Json);

        using var inviteRequest = new HttpRequestMessage(HttpMethod.Post, "/api/v1/invites");
        inviteRequest.Headers.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", sam!.Token);
        var inviteResponse = await client.SendAsync(inviteRequest);
        inviteResponse.EnsureSuccessStatusCode();
        var invite = await inviteResponse.Content.ReadFromJsonAsync<InviteWire>(Json);

        using var accept = new HttpRequestMessage(HttpMethod.Post, "/api/v1/invites/accept");
        accept.Headers.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", jordan!.Token);
        accept.Content = JsonContent.Create(new { code = invite!.Code });
        (await client.SendAsync(accept)).EnsureSuccessStatusCode();

        var now = DateTimeOffset.UtcNow;
        for (var i = 0; i < 3; i++)
        {
            using var ingest = new HttpRequestMessage(HttpMethod.Post, "/api/v1/location");
            ingest.Headers.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", sam.Token);
            ingest.Content = JsonContent.Create(new
            {
                timestamp = now.AddMinutes(-40 + (i * 15)),
                latitude = 37.75 + (i * 0.002),
                longitude = -122.41
            });
            (await client.SendAsync(ingest)).EnsureSuccessStatusCode();
        }

        using var lookRequest = new HttpRequestMessage(HttpMethod.Post, "/api/v1/looks");
        lookRequest.Headers.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", jordan.Token);
        lookRequest.Content = JsonContent.Create(new { subjectId = sam.You.Id, confirmed = true });
        var lookResponse = await client.SendAsync(lookRequest);
        lookResponse.EnsureSuccessStatusCode();
        var look = await lookResponse.Content.ReadFromJsonAsync<LookWire>(Json);
        Assert.NotNull(look?.Live);
        Assert.Equal(3, look!.Trail.Count);
        Assert.Equal(2, look.Event.HistoryWindowHours);
    }

    [Fact]
    public async Task DeleteAccountRequiresAuthAndRemovesSessionSubject()
    {
        var session = await _client.PostAsJsonAsync(
            "/api/v1/session/development",
            new { displayName = "Sam", provider = "development" });
        session.EnsureSuccessStatusCode();
        var payload = await session.Content.ReadFromJsonAsync<SessionWire>(Json);

        using var delete = new HttpRequestMessage(HttpMethod.Delete, "/api/v1/account");
        delete.Headers.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", payload!.Token);
        var deleted = await _client.SendAsync(delete);
        deleted.EnsureSuccessStatusCode();

        using var circleRequest = new HttpRequestMessage(HttpMethod.Get, "/api/v1/circle");
        circleRequest.Headers.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", payload.Token);
        var circleResponse = await _client.SendAsync(circleRequest);
        Assert.Equal(System.Net.HttpStatusCode.Unauthorized, circleResponse.StatusCode);
    }

    [Fact]
    public async Task PrivacyAndSupportArePublic()
    {
        Assert.True((await _client.GetAsync("/Privacy")).IsSuccessStatusCode);
        Assert.True((await _client.GetAsync("/Terms")).IsSuccessStatusCode);
        Assert.True((await _client.GetAsync("/Support")).IsSuccessStatusCode);
    }

    [Fact]
    public async Task LiveHealthDoesNotRequireAuth()
    {
        var response = await _client.GetAsync("/health/live");
        response.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task AppleSessionMintsAccountWhenIdentityValidates()
    {
        using var factory = new TrustApiFactory();
        using var client = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureTestServices(services =>
            {
                services.AddSingleton<IAppleIdentityValidator>(new StubAppleValidator());
            });
        }).CreateClient();

        var response = await client.PostAsJsonAsync(
            "/api/v1/session/apple",
            new { identityToken = "verified", displayName = "Juan" });
        response.EnsureSuccessStatusCode();
        var payload = await response.Content.ReadFromJsonAsync<SessionWire>(Json);
        Assert.False(string.IsNullOrWhiteSpace(payload?.Token));
        Assert.Equal("Juan", payload!.You.DisplayName);
    }

    [Fact]
    public async Task AppleSessionFallsBackInDevelopmentWhenTokenIsUnverified()
    {
        var token = AppleShapedJwt.Sign("001234.unverified", "juan@privaterelay.appleid.com");
        var response = await _client.PostAsJsonAsync(
            "/api/v1/session/apple",
            new { identityToken = token, displayName = "Juan" });
        response.EnsureSuccessStatusCode();
        var payload = await response.Content.ReadFromJsonAsync<SessionWire>(Json);
        Assert.False(string.IsNullOrWhiteSpace(payload?.Token));
        Assert.Equal("Juan", payload!.You.DisplayName);
    }

    private sealed record SessionWire(string Token, PersonWire You);
    private sealed record PersonWire(Guid Id, string DisplayName, bool HasCircle);
    private sealed record LocationWire(DateTimeOffset Timestamp, double Latitude, double Longitude);
    private sealed record MemberWire(PersonWire Person, bool InboundLive, LocationWire? Live);
    private sealed record CircleWire(IReadOnlyList<MemberWire> Members);
    private sealed record LookEventWire(int HistoryWindowHours);
    private sealed record LookWire(LookEventWire Event, LocationWire Live, IReadOnlyList<LocationWire> Trail);
    private sealed record InviteWire(string Code);

    [Fact]
    public async Task AppleSessionReturnsUnavailableWhenAppleDirectoryTimesOut()
    {
        using var factory = new TrustApiFactory();
        using var client = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureTestServices(services =>
            {
                services.AddSingleton<IAppleIdentityValidator>(new CancelledAppleValidator());
            });
        }).CreateClient();

        var response = await client.PostAsJsonAsync(
            "/api/v1/session/apple",
            new { identityToken = "not-a-jwt", displayName = "Juan" });
        Assert.Equal(System.Net.HttpStatusCode.ServiceUnavailable, response.StatusCode);
    }

    private sealed class StubAppleValidator : IAppleIdentityValidator
    {
        public Task<ExternalIdentity> ValidateAsync(string identityToken, CancellationToken cancellationToken) =>
            Task.FromResult(new ExternalIdentity("apple", "apple-user-1", "Apple Name"));
    }

    private sealed class CancelledAppleValidator : IAppleIdentityValidator
    {
        public Task<ExternalIdentity> ValidateAsync(string identityToken, CancellationToken cancellationToken) =>
            Task.FromException<ExternalIdentity>(new TaskCanceledException("Apple JWKS timed out."));
    }
}

public sealed class ExternalIdentityTokenTests
{
    [Fact]
    public void DefaultJwtHandlerHidesAppleSubClaim()
    {
        var (token, key) = AppleShapedJwt.SignWithKey("001234.abcdef", "juan@privaterelay.appleid.com");
        var parameters = AppleShapedJwt.Parameters(key);
        var mapped = new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler();
        var principal = mapped.ValidateToken(token, parameters, out _);
        Assert.True(mapped.MapInboundClaims);
        Assert.Null(principal.FindFirst("sub"));
        Assert.Equal(
            "001234.abcdef",
            principal.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value);
    }

    [Fact]
    public void ReadKeepsAppleSubjectWhenInboundClaimsWouldMapItAway()
    {
        var (token, key) = AppleShapedJwt.SignWithKey("001234.abcdef", "juan@privaterelay.appleid.com");
        var identity = ExternalIdentityTokens.Read(token, AppleShapedJwt.Parameters(key), "apple");
        Assert.Equal("001234.abcdef", identity.Subject);
        Assert.Equal("juan", identity.DisplayName);
        Assert.Equal("apple", identity.Provider);
    }
}

internal static class AppleShapedJwt
{
    public static string Sign(string subject, string email) => SignWithKey(subject, email).Token;

    public static (string Token, RsaSecurityKey Key) SignWithKey(string subject, string email)
    {
        var rsa = RSA.Create(2048);
        var key = new RsaSecurityKey(rsa) { KeyId = "test-apple" };
        var credentials = new SigningCredentials(key, SecurityAlgorithms.RsaSha256);
        var handler = new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler { MapInboundClaims = false };
        var token = handler.WriteToken(new System.IdentityModel.Tokens.Jwt.JwtSecurityToken(
            issuer: "https://appleid.apple.com",
            audience: "com.collapsetechnologies.trust",
            claims:
            [
                new System.Security.Claims.Claim("sub", subject),
                new System.Security.Claims.Claim("email", email)
            ],
            notBefore: DateTime.UtcNow.AddMinutes(-1),
            expires: DateTime.UtcNow.AddMinutes(10),
            signingCredentials: credentials));
        return (token, key);
    }

    public static TokenValidationParameters Parameters(RsaSecurityKey key) => new()
    {
        ValidIssuer = "https://appleid.apple.com",
        ValidAudience = "com.collapsetechnologies.trust",
        IssuerSigningKey = key,
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        NameClaimType = "sub",
        ClockSkew = TimeSpan.FromMinutes(5)
    };
}
