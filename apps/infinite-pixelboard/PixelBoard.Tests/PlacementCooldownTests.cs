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
