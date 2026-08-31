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
    bool PhoneVerified);

public sealed record PresenceDto(
    DateTimeOffset LastActiveAt,
    int BatteryPercent,
    bool IsCharging,
    DateTimeOffset? GotHomeAt,
    DateTimeOffset? CheckedInAt);

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
    PresenceDto Presence,
    ShareDto Share,
    bool InboundLive,
    LocationDto? Live);

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
    bool AllowsReviewUnlock);

public sealed record LocationIngestRequest(
    DateTimeOffset Timestamp,
    double Latitude,
    double Longitude,
    int? BatteryPercent,
    bool? IsCharging,
    IReadOnlyList<LocationDto>? Points);

public sealed record LookRequest(Guid SubjectId, bool Confirmed);

public sealed record ShareRequest(string? Resting, string? Timed);

public sealed record InviteAcceptRequest(string Code);

public sealed record RenameRequest(string DisplayName);

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
        new(account.Id, account.DisplayName, account.HasCircle, account.OnboardingComplete, account.HasVerifiedPhone);

    public static PresenceDto Presence(Presence presence) =>
        new(
            presence.LastActiveAt,
            presence.BatteryPercent,
            presence.IsCharging,
            presence.GotHomeAt,
            presence.CheckedInAt);

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
                Location(member.Live))).ToList(),
            Coverage(snapshot.Coverage),
            snapshot.PendingInvite?.Code,
            snapshot.ActiveSession is null ? null : Session(snapshot.ActiveSession),
            snapshot.BeingWatched is null ? null : Look(snapshot.BeingWatched),
            snapshot.LookLog.Select(Look).ToList(),
            snapshot.RetainedLookLogCount,
            allowsDevelopmentSignIn,
            allowsReviewUnlock);

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

    private static string RestingName(ShareResting resting) =>
        resting == ShareResting.Always ? "always" : "untilTheyLook";
}
