using Microsoft.Extensions.Options;
using PixelBoard.Configuration;
using PixelBoard.Contracts.V1;

namespace PixelBoard.Application;

public sealed class ConfiguredAdvertisingPolicy(IOptions<AdvertisingOptions> options)
    : IAdvertisingPolicy
{
    public ValueTask<AdvertisingDecision> DecideAsync(
        AccountId? accountId,
        AccountTier tier,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var advertising = options.Value;
        var showAd = advertising.ModerationOperationsEnabled
            && (advertising.WebEnabled || advertising.MobileEnabled)
            && tier != AccountTier.Pro;
        return ValueTask.FromResult(
            new AdvertisingDecision(showAd, "pixelboard-board-banner"));
    }
}
