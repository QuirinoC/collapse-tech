using Microsoft.Extensions.Options;
using PixelBoard.Application;
using PixelBoard.Configuration;
using PixelBoard.Contracts.V1;

namespace PixelBoard.Tests;

public sealed class ConfiguredAdvertisingPolicyTests
{
    [Theory]
    [InlineData(AccountTier.Free, true)]
    [InlineData(AccountTier.Pro, false)]
    public async Task DecideAsync_OnlyShowsAdsToFreeAccounts(AccountTier tier, bool expected)
    {
        var policy = CreatePolicy(webEnabled: true, moderationEnabled: true);

        var decision = await policy.DecideAsync(new AccountId("account"), tier);

        Assert.Equal(expected, decision.ShowAd);
        Assert.Equal("pixelboard-board-banner", decision.Placement);
    }

    [Fact]
    public async Task DecideAsync_RequiresModerationOperations()
    {
        var policy = CreatePolicy(webEnabled: true, moderationEnabled: false);

        var decision = await policy.DecideAsync(null, AccountTier.Free);

        Assert.False(decision.ShowAd);
    }

    private static ConfiguredAdvertisingPolicy CreatePolicy(
        bool webEnabled,
        bool moderationEnabled) =>
        new(Options.Create(new AdvertisingOptions
        {
            WebEnabled = webEnabled,
            ModerationOperationsEnabled = moderationEnabled,
        }));
}
