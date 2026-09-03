using System.Text.Json.Serialization;
using TrustApi.Domain;

namespace TrustApi.Contracts.V1;

public sealed record SessionRequest(
    string? IdentityToken,
    string? IdToken,
    string? DisplayName,
    string? Provider,
    string? DeviceId);

public sealed record SessionResponse(string Token, PersonDto You);

public sealed record PersonDto(
    Guid Id,
    string DisplayName,
    bool HasCircle,
    bool OnboardingComplete,
    bool PhoneVerified,
    string? Handle);

public sealed record PresenceDto(
    DateTimeOffset LastActiveAt,
    int BatteryPercent,
    bool IsCharging,
    DateTimeOffset? GotHomeAt,
    DateTimeOffset? CheckedInAt);

public sealed record HomePresenceDto(
    string State,
    DateTimeOffset ChangedAt,
    string? PlaceLabel);

public sealed record PromiseDto(
    Guid Id,
    Guid SubjectId,
    Guid TrusteeId,
    string PlaceLabel,
    DateTimeOffset DeadlineAt,
    string Status,
    DateTimeOffset? ResolvedAt,
    bool YouAreSubject);

public sealed record HomePlaceDto(Guid PlaceId, string Label);

public sealed record YourHomeDto(
    HomePlaceDto? Place,
    string? State,
    DateTimeOffset? ChangedAt);

public sealed record LocationDto(
    DateTimeOffset Timestamp,
    double Latitude,
    double Longitude);

public sealed record ShareDto(
    string Resting,
    DateTimeOffset? TimedUntil,
    string Presentation,
    DateTimeOffset? TimedEnds,
    string? RevertsTo);

public sealed record MemberDto(
    PersonDto Person,
    PresenceDto? Presence,
    ShareDto Share,
    bool InboundLive,
    LocationDto? Live,
    bool OutboundPresenceGranted,
    bool InboundPresenceGranted,
    HomePresenceDto? HomePresence,
    PromiseDto? Promise);

public sealed record CoverageDto(
    bool IsCovered,
    string? SponsorName,
    bool ActingIsSponsor,
    int SeatLimit,
    int LookLogDays,
    bool HasPlacePings,
    bool CanExtendHistory,
    bool CanExportLookLog,
    string? Banner);

public sealed record LookEventDto(
    Guid Id,
    Guid ViewerId,
    string ViewerName,
    Guid SubjectId,
    string SubjectName,
    DateTimeOffset At,
    int HistoryWindowHours,
    bool IncludedLive);

public sealed record LookSessionDto(
    LookEventDto Event,
    LocationDto Live,
    IReadOnlyList<LocationDto> Trail);

public sealed record CircleResponse(
    PersonDto You,
    IReadOnlyList<MemberDto> Members,
    CoverageDto Coverage,
    string? PendingInviteCode,
    LookSessionDto? ActiveSession,
    LookEventDto? BeingWatched,
    IReadOnlyList<LookEventDto> LookLog,
    int RetainedLookLogCount,
    bool AllowsDevelopmentSignIn,
    bool AllowsReviewUnlock,
    YourHomeDto? YourHome);

public sealed record LocationIngestRequest(
    DateTimeOffset Timestamp,
    double Latitude,
    double Longitude,
    int? BatteryPercent,
    bool? IsCharging,
    IReadOnlyList<LocationDto>? Points);

public sealed record LookRequest(Guid SubjectId, bool Confirmed);

public sealed record ShareRequest(string? Resting, string? Timed);

public sealed record PresenceGrantRequest(bool Enabled);

public sealed record SetHomePlaceRequest(Guid PlaceId, string? Label);

public sealed record HomePresenceRequest(string State, DateTimeOffset? SignaledAt);

public sealed record CreatePromiseRequest(Guid TrusteeId, DateTimeOffset DeadlineAt);

public sealed record InviteAcceptRequest(string Code);

public sealed record RenameRequest(string DisplayName);

public sealed record SetHandleRequest(string Handle);

public sealed record HandleAvailabilityResponse(
    string Handle,
    bool Available,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    string? Code);

public sealed record SendPhoneCodeRequest(string Phone);

public sealed record VerifyPhoneCodeRequest(string Phone, string Code);

public sealed record SendPhoneCodeResponse(
    DateTimeOffset ExpiresAt,
    int ResendAfterSeconds,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    string? DevelopmentCode);

public sealed record EntitlementRequest(string? ProductId, bool ReviewUnlock, string? SignedTransactionInfo);

public sealed record StoreKitAccountTokenResponse(Guid AppAccountToken);

public sealed record VerifyStoreKitTransactionRequest(string SignedTransactionInfo);

public sealed record StoreKitNotificationRequest(string SignedPayload);

public sealed record PushDeviceRequest(
    Guid InstallationId,
    string Token,
    string Environment,
    string BundleId);

public sealed record CheckoutRequest(string Interval);

public sealed record CheckoutResponse(string Url);

public sealed record ApiError(string Code, string Message);

public static class ContractMap
{
    public static PersonDto Person(Account account) =>
        new(account.Id, account.DisplayName, account.HasCircle, account.OnboardingComplete, account.HasVerifiedPhone, account.Handle);

    public static PresenceDto? Presence(Presence? presence) =>
        presence is null
            ? null
            : new(
                presence.LastActiveAt,
                presence.BatteryPercent,
                presence.IsCharging,
                presence.GotHomeAt,
                presence.CheckedInAt);

    public static HomePresenceDto? HomePresence(VisibleHomePresence? presence) =>
        presence is null
            ? null
            : new(HomeStateName(presence.State), presence.ChangedAt, presence.PlaceLabel);

    public static PromiseDto? Promise(PromiseView? promise) =>
        promise is null
            ? null
            : new(
                promise.Id,
                promise.SubjectId,
                promise.TrusteeId,
                promise.PlaceLabel,
                promise.DeadlineAt,
                PromiseStatusName(promise.Status),
                promise.ResolvedAt,
                promise.YouAreSubject);

    public static YourHomeDto YourHome(HomePlace? place, CurrentHomePresence? presence) =>
        new(
            place is null ? null : new HomePlaceDto(place.PlaceId, place.Label),
            presence is null ? null : HomeStateName(presence.State),
            presence?.LastChangedAt);

    public static LocationDto? Location(LocationFix? fix) =>
        fix is null ? null : new LocationDto(fix.Timestamp, fix.Latitude, fix.Longitude);

    public static LocationDto LocationRequired(LocationFix fix) =>
        new(fix.Timestamp, fix.Latitude, fix.Longitude);

    public static IReadOnlyList<LocationFix> IngestFixes(LocationIngestRequest request)
    {
        if (request.Points is { Count: > 0 })
        {
            return request.Points
                .Select(point => new LocationFix(point.Timestamp, point.Latitude, point.Longitude))
                .ToList();
        }

        return [new LocationFix(request.Timestamp, request.Latitude, request.Longitude)];
    }

    public static ShareDto Share(ShareState state, DateTimeOffset now)
    {
        var presentation = state.Presentation(now);
        return presentation switch
        {
            SharePresentation.Always => new ShareDto("always", state.TimedUntil, "always", null, null),
            SharePresentation.Timed timed => new ShareDto(
                RestingName(timed.RevertsTo),
                timed.Ends,
                "timed",
                timed.Ends,
                RestingName(timed.RevertsTo)),
            _ => new ShareDto("untilTheyLook", state.TimedUntil, "untilTheyLook", null, null)
        };
    }

    public static LookEventDto Look(LookEvent look) =>
        new(
            look.Id,
            look.ViewerId,
            look.ViewerName,
            look.SubjectId,
            look.SubjectName,
            look.At,
            look.HistoryWindowHours,
            look.IncludedLive);

    public static LookSessionDto Session(LookSession session) =>
        new(
            Look(session.Event),
            LocationRequired(session.Live),
            session.Trail.Select(LocationRequired).ToList());

    public static CoverageDto Coverage(CircleCoverage coverage) =>
        new(
            coverage.IsCovered,
            coverage.SponsorName,
            coverage.ActingIsSponsor,
            coverage.SeatLimit,
            coverage.LookLogDays,
            coverage.HasPlacePings,
            coverage.CanExtendHistory,
            coverage.CanExportLookLog,
            coverage.Banner);

    public static CircleResponse Circle(
        CircleSnapshot snapshot,
        bool allowsDevelopmentSignIn,
        bool allowsReviewUnlock,
        DateTimeOffset now) =>
        new(
            Person(snapshot.You),
            snapshot.Members.Select(member => new MemberDto(
                Person(member.Person),
                Presence(member.Presence),
                Share(member.OutboundShare, now),
                member.InboundLive,
                Location(member.Live),
                member.OutboundPresenceGranted,
                member.InboundPresenceGranted,
                HomePresence(member.HomePresence),
                Promise(member.Promise))).ToList(),
            Coverage(snapshot.Coverage),
            snapshot.PendingInvite?.Code,
            snapshot.ActiveSession is null ? null : Session(snapshot.ActiveSession),
            snapshot.BeingWatched is null ? null : Look(snapshot.BeingWatched),
            snapshot.LookLog.Select(Look).ToList(),
            snapshot.RetainedLookLogCount,
            allowsDevelopmentSignIn,
            allowsReviewUnlock,
            YourHome(snapshot.YourHomePlace, snapshot.YourHomePresence));

    public static ShareResting? ParseResting(string? value) => value?.Trim().ToLowerInvariant() switch
    {
        "always" => ShareResting.Always,
        "untiltheylook" or "until_they_look" => ShareResting.UntilTheyLook,
        null or "" => null,
        _ => null
    };

    public static TimedShareDuration? ParseTimed(string? value) => value?.Trim().ToLowerInvariant() switch
    {
        "hour" or "1hour" or "1 hour" => TimedShareDuration.Hour,
        "tonight" => TimedShareDuration.Tonight,
        "home" => TimedShareDuration.Home,
        null or "" => null,
        _ => null
    };

    public static HomePresenceState? ParseHomeState(string? value) => value?.Trim().ToLowerInvariant() switch
    {
        "home" => HomePresenceState.Home,
        "away" => HomePresenceState.Away,
        "unknown" => HomePresenceState.Unknown,
        null or "" => null,
        _ => null
    };

    private static string RestingName(ShareResting resting) =>
        resting == ShareResting.Always ? "always" : "untilTheyLook";

    private static string HomeStateName(HomePresenceState state) => state switch
    {
        HomePresenceState.Home => "home",
        HomePresenceState.Away => "away",
        _ => "unknown"
    };

    private static string PromiseStatusName(PromiseStatus status) => status switch
    {
        PromiseStatus.Resolved => "resolved",
        PromiseStatus.Overdue => "overdue",
        PromiseStatus.NoSignal => "no_signal",
        _ => "active"
    };
}
