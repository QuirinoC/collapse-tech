using Microsoft.Extensions.Options;
using PixelBoard.Configuration;
using PixelBoard.Contracts.V1;

namespace PixelBoard.Application;

public sealed class ConfiguredAdvertisingPolicy(
    IOptions<AdvertisingOptions> options,
    IServiceProvider services)
    : IAdvertisingPolicy
{
    public ValueTask<AdvertisingDecision> DecideAsync(
        AccountId? accountId,
        AccountTier tier,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var safetyService = services.GetService<IPlatformSafetyService>();
        if (safetyService is null)
        {
            return ValueTask.FromResult(
                new AdvertisingDecision(false, "pixelboard-board-banner"));
        }

        return DecideWithSafetyAsync(
            safetyService,
            tier,
            cancellationToken);
    }

    private async ValueTask<AdvertisingDecision> DecideWithSafetyAsync(
        IPlatformSafetyService safetyService,
        AccountTier tier,
        CancellationToken cancellationToken)
    {
        var safety = await safetyService.GetStateAsync(cancellationToken);
        var advertising = options.Value;
        var showAd = advertising.ModerationOperationsEnabled
            && (advertising.WebEnabled || advertising.MobileEnabled)
            && !safety.AdsDisabled
            && tier != AccountTier.Pro;
        return new AdvertisingDecision(showAd, "pixelboard-board-banner");
    }
}
