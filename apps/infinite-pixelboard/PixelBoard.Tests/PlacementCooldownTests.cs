using PixelBoard.Application;
using PixelBoard.Contracts.V1;

namespace PixelBoard.Tests;

public sealed class PlacementCooldownTests
{
    private static readonly DateTimeOffset Now =
        new(2026, 8, 28, 20, 0, 0, TimeSpan.Zero);

    [Theory]
    [InlineData(AccountTier.Free, 5)]
    [InlineData(AccountTier.Pro, 1)]
    public void BaselineFollowsEntitlement(AccountTier tier, int expected)
    {
        Assert.Equal(expected, PlacementCooldown.Resolve(tier, null, Now));
    }

    [Fact]
    public void ActiveBoostSpeedsFreeCooldownButNeverBeatsPro()
    {
        var boost = new PaintBoostState(PlacementCooldown.RefereeSeconds, Now.AddHours(2));
        Assert.Equal(PlacementCooldown.RefereeSeconds, PlacementCooldown.Resolve(AccountTier.Free, boost, Now));
        Assert.Equal(PlacementCooldown.ProSeconds, PlacementCooldown.Resolve(AccountTier.Pro, boost, Now));
    }

    [Fact]
    public void ExpiredBoostIsIgnored()
    {
        var boost = new PaintBoostState(PlacementCooldown.RefereeSeconds, Now.AddMinutes(-1));
        Assert.Equal(5, PlacementCooldown.Resolve(AccountTier.Free, boost, Now));
    }

    [Fact]
    public void ZeroSecondBoostGrantsUnlimitedPlacing()
    {
        var boost = new PaintBoostState(0, Now.AddHours(2));
        Assert.Equal(0, PlacementCooldown.Resolve(AccountTier.Free, boost, Now));
        Assert.Equal(0, PlacementCooldown.Resolve(AccountTier.Pro, boost, Now));
        Assert.Equal(
            PlacementCooldown.FreeSeconds,
            PlacementCooldown.Resolve(AccountTier.Free, boost, Now.AddHours(3)));
    }

    [Fact]
    public void SpecialBenefitExpiryTakesEarlierOfDurationAndAbsolute()
    {
        var fromDuration = PlacementCooldown.ResolveSpecialBenefitExpiry(
            Now,
            benefitDurationSeconds: 3600,
            benefitExpiresAt: Now.AddHours(3));
        Assert.Equal(Now.AddHours(1), fromDuration);

        var fromAbsolute = PlacementCooldown.ResolveSpecialBenefitExpiry(
            Now,
            benefitDurationSeconds: 10_800,
            benefitExpiresAt: Now.AddMinutes(30));
        Assert.Equal(Now.AddMinutes(30), fromAbsolute);
    }

    [Fact]
    public void BoostDurationStacksUntilTheDailyCap()
    {
        var first = PlacementCooldown.ExtendExpiry(
            null,
            Now,
            TimeSpan.FromHours(PlacementCooldown.BoostDurationHours));
        Assert.Equal(Now.AddHours(4), first);

        var stacked = PlacementCooldown.ExtendExpiry(
            first,
            Now,
            TimeSpan.FromHours(PlacementCooldown.BoostDurationHours));
        Assert.Equal(Now.AddHours(8), stacked);

        var capped = PlacementCooldown.ExtendExpiry(
            Now.AddHours(22),
            Now,
            TimeSpan.FromHours(PlacementCooldown.BoostDurationHours));
        Assert.Equal(Now.AddHours(24), capped);
    }
}
