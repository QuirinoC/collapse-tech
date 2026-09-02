namespace TrustApi.Domain;

public static class TrustRules
{
    public const int FreeHistoryHours = 2;
    public const int ProHistoryHours = 24;
    public const int FreeSeats = 1;
    public const int ProSeats = 6;
    public const int FreeLookLogDays = 30;
    public const int ProLookLogDays = 365;
    /// Server GPS window: long enough for Circle's 24h Look extend, then pruned. Not a 30-day dossier.
    public static readonly TimeSpan LocationRetention = TimeSpan.FromHours(26);
    /// Open Looks expire so a killed client cannot leave a live pin forever.
    public static readonly TimeSpan ActiveLookTtl = TimeSpan.FromMinutes(30);
    /// If last home/away signal is older than this at a promise deadline, copy is "no signal".
    public static readonly TimeSpan PresenceSignalStale = TimeSpan.FromMinutes(30);
}

public enum HomePresenceState
{
    Unknown,
    Home,
    Away
}

public enum PromiseStatus
{
    Active,
    Resolved,
    Overdue,
    NoSignal
}

public sealed record PresenceGrant(
    Guid SubjectId,
    Guid TrusteeId,
    bool Enabled,
    DateTimeOffset UpdatedAt);

public sealed record HomePlace(
    Guid AccountId,
    Guid PlaceId,
    string Label,
    DateTimeOffset UpdatedAt);

public sealed record CurrentHomePresence(
    Guid AccountId,
    Guid? PlaceId,
    HomePresenceState State,
    DateTimeOffset LastChangedAt,
    DateTimeOffset? LastSignalAt);

public sealed record HomePromise(
    Guid Id,
    Guid SubjectId,
    Guid TrusteeId,
    Guid PlaceId,
    DateTimeOffset DeadlineAt,
    PromiseStatus Status,
    DateTimeOffset? ResolvedAt,
    DateTimeOffset CreatedAt);

public sealed record LookResult(LookSession Session, bool IsNew);

public static class AccountIdentity
{
    public const int DisplayNameMinLength = 2;
    public const int DisplayNameMaxLength = 40;

    public static bool IsChosenDisplayName(string? displayName)
    {
        var trimmed = displayName?.Trim() ?? "";
        return trimmed.Length >= DisplayNameMinLength
            && trimmed.Length <= DisplayNameMaxLength
            && !string.Equals(trimmed, "You", StringComparison.OrdinalIgnoreCase);
    }
}

public static class AccountHandle
{
    public const int MinLength = 3;
    public const int MaxLength = 20;

    private static readonly System.Text.RegularExpressions.Regex Pattern = new(
        "^[a-z][a-z0-9_]{2,19}$",
        System.Text.RegularExpressions.RegexOptions.Compiled | System.Text.RegularExpressions.RegexOptions.CultureInvariant);

    private static readonly HashSet<string> Reserved = new(StringComparer.Ordinal)
    {
        "about", "account", "admin", "administrator", "api", "apple",
        "bot", "circle", "collapse", "collapsetechnologies",
        "everyone", "google", "help", "here", "invite", "look",
        "login", "me", "mod", "moderator", "null", "official", "owner",
        "privacy", "root", "settings", "signin", "signout", "signup",
        "staff", "status", "support", "system", "terms", "trust",
        "trustcircle", "www", "you"
    };

    public static string Normalize(string? raw)
    {
        var value = (raw ?? "").Trim();
        if (value.StartsWith('@'))
        {
            value = value[1..].Trim();
        }

        return value.ToLowerInvariant();
    }

    public static bool TryValidate(string? raw, out string normalized, out string? errorCode)
    {
        normalized = Normalize(raw);
        if (!Pattern.IsMatch(normalized))
        {
            errorCode = "invalid_handle";
            return false;
        }

        if (Reserved.Contains(normalized))
        {
            errorCode = "reserved_handle";
            return false;
        }

        errorCode = null;
        return true;
    }

    public static bool IsChosen(string? handle) =>
        TryValidate(handle, out _, out _);
}

public sealed record Account(
    Guid Id,
    string Provider,
    string ProviderSubject,
    string DisplayName,
    bool HasCircle,
    string? CircleSource,
    DateTimeOffset CreatedAt,
    string? PhoneE164 = null,
    DateTimeOffset? PhoneVerifiedAt = null,
    string? Handle = null)
{
    public bool HasChosenDisplayName => AccountIdentity.IsChosenDisplayName(DisplayName);

    public bool HasVerifiedPhone =>
        !string.IsNullOrWhiteSpace(PhoneE164) && PhoneVerifiedAt is not null;

    public bool HasHandle => AccountHandle.IsChosen(Handle);

    public bool OnboardingComplete => HasHandle;

    public string PublicName => HasHandle ? $"@{Handle}" : DisplayName;
}

public sealed record HandleAvailability(string Handle, bool Available, string? Code);

public sealed record PhoneChallenge(
    Guid AccountId,
    string PhoneE164,
    string CodeHash,
    DateTimeOffset ExpiresAt,
    int Attempts,
    DateTimeOffset SentAt,
    int SendCount,
    DateTimeOffset WindowStartedAt);

public sealed record Presence(
    DateTimeOffset LastActiveAt,
    int BatteryPercent,
    bool IsCharging,
    DateTimeOffset? GotHomeAt,
    DateTimeOffset? CheckedInAt);

public sealed record LocationFix(
    DateTimeOffset Timestamp,
    double Latitude,
    double Longitude);

public enum ShareResting
{
    UntilTheyLook,
    Always
}

public sealed record ShareState(ShareResting Resting, DateTimeOffset? TimedUntil)
{
    public static ShareState Default { get; } = new(ShareResting.UntilTheyLook, null);

    public SharePresentation Presentation(DateTimeOffset now)
    {
        if (TimedUntil is { } until && until > now)
        {
            return new SharePresentation.Timed(until, Resting);
        }

        return Resting == ShareResting.Always
            ? SharePresentation.Always.Instance
            : SharePresentation.UntilTheyLook.Instance;
    }

    public bool RevealsLive(DateTimeOffset now) =>
        Presentation(now) is SharePresentation.Always or SharePresentation.Timed;
}

public abstract record SharePresentation
{
    public sealed record UntilTheyLook : SharePresentation
    {
        public static UntilTheyLook Instance { get; } = new();
    }

    public sealed record Always : SharePresentation
    {
        public static Always Instance { get; } = new();
    }

    public sealed record Timed(DateTimeOffset Ends, ShareResting RevertsTo) : SharePresentation;
}

public sealed record Invite(
    Guid Id,
    string Code,
    Guid CreatorId,
    string Status,
    DateTimeOffset CreatedAt);

public sealed record LookEvent(
    Guid Id,
    Guid ViewerId,
    string ViewerName,
    Guid SubjectId,
    string SubjectName,
    DateTimeOffset At,
    int HistoryWindowHours,
    bool IncludedLive);

public sealed record ActiveLook(
    Guid LookId,
    Guid ViewerId,
    Guid SubjectId,
    int HistoryWindowHours,
    DateTimeOffset OpenedAt);

public sealed record LookSession(
    LookEvent Event,
    LocationFix Live,
    IReadOnlyList<LocationFix> Trail);

public sealed record VisibleHomePresence(
    HomePresenceState State,
    DateTimeOffset ChangedAt,
    string? PlaceLabel);

public sealed record PromiseView(
    Guid Id,
    Guid SubjectId,
    Guid TrusteeId,
    string PlaceLabel,
    DateTimeOffset DeadlineAt,
    PromiseStatus Status,
    DateTimeOffset? ResolvedAt,
    bool YouAreSubject);

public sealed record CircleMember(
    Account Person,
    Presence? Presence,
    ShareState OutboundShare,
    bool InboundLive,
    LocationFix? Live,
    bool OutboundPresenceGranted,
    bool InboundPresenceGranted,
    VisibleHomePresence? HomePresence,
    PromiseView? Promise);

public sealed record CircleSnapshot(
    Account You,
    IReadOnlyList<CircleMember> Members,
    CircleCoverage Coverage,
    Invite? PendingInvite,
    LookSession? ActiveSession,
    LookEvent? BeingWatched,
    IReadOnlyList<LookEvent> LookLog,
    int RetainedLookLogCount,
    HomePlace? YourHomePlace,
    CurrentHomePresence? YourHomePresence);

public sealed record CircleCoverage(
    bool IsCovered,
    string? SponsorName,
    bool ActingIsSponsor)
{
    public int SeatLimit => IsCovered ? TrustRules.ProSeats : TrustRules.FreeSeats;
    public int LookLogDays => IsCovered ? TrustRules.ProLookLogDays : TrustRules.FreeLookLogDays;
    public bool HasPlacePings => IsCovered;
    public bool CanExtendHistory => IsCovered;
    public bool CanExportLookLog => IsCovered;

    public string? Banner
    {
        get
        {
            if (!IsCovered || string.IsNullOrWhiteSpace(SponsorName))
            {
                return null;
            }

            return ActingIsSponsor
                ? "Your Circle covers this pair"
                : $"{SponsorName}’s Pro covers this circle";
        }
    }
}

public enum TimedShareDuration
{
    Hour,
    Tonight,
    Home
}

public static class TimedShare
{
    public static DateTimeOffset EndAt(
        TimedShareDuration duration,
        DateTimeOffset now,
        TimeZoneInfo? zone = null)
    {
        zone ??= TimeZoneInfo.Utc;
        return duration switch
        {
            TimedShareDuration.Hour => now.AddHours(1),
            TimedShareDuration.Tonight => Tonight(now, zone),
            // Product copy is "For 4 hours" — still a fixed window until home-transition end exists.
            TimedShareDuration.Home => now.AddHours(4),
            _ => now.AddHours(1)
        };
    }

    private static DateTimeOffset Tonight(DateTimeOffset now, TimeZoneInfo zone)
    {
        var local = TimeZoneInfo.ConvertTime(now, zone);
        var endLocal = new DateTimeOffset(
            local.Year,
            local.Month,
            local.Day,
            23,
            59,
            0,
            local.Offset);
        return endLocal > now ? endLocal : now.AddHours(6);
    }

    public static string AfterPhrase(TimedShareDuration duration) => duration switch
    {
        TimedShareDuration.Hour => "After 1 hour",
        TimedShareDuration.Tonight => "After tonight",
        TimedShareDuration.Home => "After 4 hours",
        _ => "After 1 hour"
    };
}

public static class ActiveLookRules
{
    public static bool IsExpired(ActiveLook look, DateTimeOffset now) =>
        now - look.OpenedAt >= TrustRules.ActiveLookTtl;
}

public sealed class TrustException : Exception
{
    public string Code { get; }

    public TrustException(string code, string message) : base(message)
    {
        Code = code;
    }

    public static TrustException ConfirmationRequired() =>
        new("confirmation_required", "Looking requires an explicit confirm.");

    public static TrustException NotConnected() =>
        new("not_connected", "This person is not in your circle.");

    public static TrustException PairInactive() =>
        new("pair_inactive", "This pair is no longer active.");

    public static TrustException InvalidCode() =>
        new("invalid_code", "That invite code does not match.");

    public static TrustException SeatLimit() =>
        new("seat_limit", "Free includes one trusted person. Circle adds seats.");

    public static TrustException ProRequired() =>
        new("pro_required", "Circle is required for this.");

    public static TrustException NoLocation() =>
        new("no_location", "There is no location in escrow yet.");

    public static TrustException Unauthorized() =>
        new("unauthorized", "Sign in is required.");

    public static TrustException InvalidPhone() =>
        new("invalid_phone", "Enter a valid phone number, including country code.");

    public static TrustException OtpNotConfigured() =>
        new("otp_not_configured", "Phone verification is not configured on this server.");

    public static TrustException OtpCooldown() =>
        new("otp_cooldown", "Wait a moment before requesting another code.");

    public static TrustException OtpExpired() =>
        new("otp_expired", "That code expired. Request a new one.");

    public static TrustException OtpInvalid() =>
        new("otp_invalid", "That code does not match.");

    public static TrustException OtpExhausted() =>
        new("otp_exhausted", "Too many attempts. Request a new code.");

    public static TrustException OtpSendFailed() =>
        new("otp_send_failed", "Trust could not send a text. Try again.");

    public static TrustException PhoneInUse() =>
        new("phone_in_use", "That phone is already on another Trust account.");

    public static TrustException InvalidHandle() =>
        new("invalid_handle", "That handle isn’t valid.");

    public static TrustException ReservedHandle() =>
        new("reserved_handle", "That handle is reserved.");

    public static TrustException HandleInUse() =>
        new("handle_in_use", "That handle is taken.");
}

public interface ITrustStore
{
    Task<Account?> FindAccountAsync(Guid id, CancellationToken cancellationToken);
    Task<Account?> FindByProviderAsync(string provider, string subject, CancellationToken cancellationToken);
    Task<Account> UpsertAccountAsync(Account account, CancellationToken cancellationToken);
    Task UpdateAccountAsync(Account account, CancellationToken cancellationToken);
    Task<IReadOnlyList<Account>> ListConnectedAsync(Guid accountId, CancellationToken cancellationToken);
    Task<int> ActiveMembershipCountAsync(Guid accountId, CancellationToken cancellationToken);
    Task<bool> AreConnectedAsync(Guid a, Guid b, CancellationToken cancellationToken);
    Task InsertMembershipAsync(Guid a, Guid b, CancellationToken cancellationToken);
    Task RevokeMembershipAsync(Guid a, Guid b, CancellationToken cancellationToken);
    Task<ShareState> GetShareAsync(Guid grantor, Guid grantee, CancellationToken cancellationToken);
    Task UpsertShareAsync(Guid grantor, Guid grantee, ShareState state, CancellationToken cancellationToken);
    Task<Presence> GetPresenceAsync(Guid accountId, DateTimeOffset fallbackNow, CancellationToken cancellationToken);
    Task UpsertPresenceAsync(Guid accountId, Presence presence, CancellationToken cancellationToken);
    Task IngestLocationAsync(Guid accountId, LocationFix fix, CancellationToken cancellationToken);
    Task PruneLocationsAsync(Guid accountId, DateTimeOffset olderThan, CancellationToken cancellationToken);
    Task ClearLocationsAsync(Guid accountId, CancellationToken cancellationToken);
    Task<IReadOnlyList<LocationFix>> UnlockLocationsAsync(
        Guid accountId,
        DateTimeOffset from,
        DateTimeOffset to,
        CancellationToken cancellationToken);
    Task<LocationFix?> LatestLocationAsync(Guid accountId, CancellationToken cancellationToken);
    Task InsertLookEventAsync(LookEvent look, CancellationToken cancellationToken);
    Task UpdateLookEventHistoryHoursAsync(Guid lookId, int historyWindowHours, CancellationToken cancellationToken);
    Task<IReadOnlyList<LookEvent>> ListLooksAsync(
        Guid accountId,
        DateTimeOffset since,
        CancellationToken cancellationToken);
    Task<int> LooksTodayAsync(Guid viewerId, DateTimeOffset startOfDay, CancellationToken cancellationToken);
    Task SetActiveLookAsync(ActiveLook look, CancellationToken cancellationToken);
    Task<ActiveLook?> GetActiveLookAsync(Guid viewerId, Guid subjectId, CancellationToken cancellationToken);
    Task<ActiveLook?> GetLookAtMeAsync(Guid subjectId, CancellationToken cancellationToken);
    Task ClearActiveLookAsync(Guid viewerId, Guid? subjectId, CancellationToken cancellationToken);
    Task<IReadOnlyList<ActiveLook>> ListExpiredActiveLooksAsync(DateTimeOffset olderThan, CancellationToken cancellationToken);
    Task PruneAllLocationsAsync(DateTimeOffset olderThan, CancellationToken cancellationToken);
    Task<Invite?> FindInviteByCodeAsync(string code, CancellationToken cancellationToken);
    Task<Invite?> FindPendingInviteAsync(Guid creatorId, CancellationToken cancellationToken);
    Task InsertInviteAsync(Invite invite, CancellationToken cancellationToken);
    Task MarkInviteConsumedAsync(Guid inviteId, CancellationToken cancellationToken);
    Task DeleteAccountAsync(Guid accountId, CancellationToken cancellationToken);
    Task<Account?> FindByVerifiedPhoneAsync(string phoneE164, CancellationToken cancellationToken);
    Task SetVerifiedPhoneAsync(Guid accountId, string phoneE164, DateTimeOffset verifiedAt, CancellationToken cancellationToken);
    Task<Account?> FindByHandleAsync(string handle, CancellationToken cancellationToken);
    Task SetHandleAsync(Guid accountId, string handle, string displayName, CancellationToken cancellationToken);
    Task<PhoneChallenge?> GetPhoneChallengeAsync(Guid accountId, CancellationToken cancellationToken);
    Task UpsertPhoneChallengeAsync(PhoneChallenge challenge, CancellationToken cancellationToken);
    Task ClearPhoneChallengeAsync(Guid accountId, CancellationToken cancellationToken);

    Task SetPresenceGrantAsync(Guid subjectId, Guid trusteeId, bool enabled, DateTimeOffset updatedAt, CancellationToken cancellationToken);
    Task<PresenceGrant?> GetPresenceGrantAsync(Guid subjectId, Guid trusteeId, CancellationToken cancellationToken);
    Task UpsertHomePlaceAsync(HomePlace place, CancellationToken cancellationToken);
    Task<HomePlace?> GetHomePlaceAsync(Guid accountId, CancellationToken cancellationToken);
    Task UpsertCurrentHomePresenceAsync(CurrentHomePresence presence, CancellationToken cancellationToken);
    Task<CurrentHomePresence?> GetCurrentHomePresenceAsync(Guid accountId, CancellationToken cancellationToken);
    Task InsertPromiseAsync(HomePromise promise, CancellationToken cancellationToken);
    Task UpdatePromiseAsync(HomePromise promise, CancellationToken cancellationToken);
    Task<HomePromise?> GetPromiseAsync(Guid promiseId, CancellationToken cancellationToken);
    Task<HomePromise?> GetActivePromiseAsync(Guid subjectId, Guid trusteeId, CancellationToken cancellationToken);
    Task<IReadOnlyList<HomePromise>> ListPromisesForPairAsync(Guid a, Guid b, CancellationToken cancellationToken);
    Task<IReadOnlyList<HomePromise>> ListDuePromisesAsync(DateTimeOffset now, CancellationToken cancellationToken);
}
