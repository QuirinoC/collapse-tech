using PixelBoard.Contracts.V1;

namespace PixelBoard.Application;

public static class PlacementCooldown
{
    public const int FreeSeconds = 5;
    public const int ProSeconds = 1;
    public const int RefereeSeconds = 2;
    public const int ReferrerSeconds = 3;
    public const int BoostDurationHours = 4;
    public const int MaxBoostBankHours = 24;
    public const int DailyReferralCap = 10;

    public static int SecondsForTier(AccountTier tier) =>
        tier == AccountTier.Pro ? ProSeconds : FreeSeconds;

    public static int Resolve(
        AccountTier tier,
        PaintBoostState? boost,
        DateTimeOffset now)
    {
        var baseline = SecondsForTier(tier);
        return boost is { } active && active.ExpiresAt > now
            ? Math.Min(baseline, active.CooldownSeconds)
            : baseline;
    }

    public static DateTimeOffset ExtendExpiry(
        DateTimeOffset? existingExpiry,
        DateTimeOffset now,
        TimeSpan duration)
    {
        var start = existingExpiry is { } expiry && expiry > now ? expiry : now;
        var uncapped = start + duration;
        var cap = now + TimeSpan.FromHours(MaxBoostBankHours);
        return uncapped <= cap ? uncapped : cap;
    }
}
