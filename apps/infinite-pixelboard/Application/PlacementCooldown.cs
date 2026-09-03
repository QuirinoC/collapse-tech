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
        if (boost is not { } active || active.ExpiresAt <= now)
        {
            return baseline;
        }

        // Zero means unlimited placing for the boost window (special codes).
        return Math.Min(baseline, Math.Max(0, active.CooldownSeconds));
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

    public static DateTimeOffset ResolveSpecialBenefitExpiry(
        DateTimeOffset now,
        int? benefitDurationSeconds,
        DateTimeOffset? benefitExpiresAt)
    {
        DateTimeOffset? fromDuration = benefitDurationSeconds is { } seconds
            ? now.AddSeconds(seconds)
            : null;
        if (fromDuration is null)
        {
            return benefitExpiresAt
                ?? throw new ArgumentException("A special-code benefit expiry is required.");
        }

        if (benefitExpiresAt is null)
        {
            return fromDuration.Value;
        }

        return fromDuration.Value <= benefitExpiresAt.Value
            ? fromDuration.Value
            : benefitExpiresAt.Value;
    }
}
