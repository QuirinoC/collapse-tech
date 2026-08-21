using Microsoft.Extensions.Options;
using Microsoft.Extensions.DependencyInjection;
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

    [Fact]
    public async Task DecideAsync_SuppressesAdsWhenSafetyServiceIsUnavailable()
    {
        using var services = new ServiceCollection().BuildServiceProvider();
        var policy = new ConfiguredAdvertisingPolicy(
            Options.Create(new AdvertisingOptions
            {
                WebEnabled = true,
                ModerationOperationsEnabled = true
            }),
            services);

        var decision = await policy.DecideAsync(null, AccountTier.Free);

        Assert.False(decision.ShowAd);
    }

    [Fact]
    public async Task DecideAsync_SuppressesAdsDuringEmergencyShutdown()
    {
        var policy = CreatePolicy(
            webEnabled: true,
            moderationEnabled: true,
            adsDisabled: true);

        var decision = await policy.DecideAsync(null, AccountTier.Free);

        Assert.False(decision.ShowAd);
    }

    private static ConfiguredAdvertisingPolicy CreatePolicy(
        bool webEnabled,
        bool moderationEnabled,
        bool adsDisabled = false)
    {
        var services = new ServiceCollection()
            .AddSingleton<IPlatformSafetyService>(
                new StubSafetyService(adsDisabled))
            .BuildServiceProvider();
        return new ConfiguredAdvertisingPolicy(
            Options.Create(new AdvertisingOptions
            {
                WebEnabled = webEnabled,
                ModerationOperationsEnabled = moderationEnabled,
            }),
            services);
    }

    private sealed class StubSafetyService(bool adsDisabled) : IPlatformSafetyService
    {
        public ValueTask<PlatformSafetyState> GetStateAsync(
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult(new PlatformSafetyState(false, adsDisabled));
    }
}
