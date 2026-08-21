using Microsoft.Extensions.Options;
using PixelBoard.Configuration;

namespace PixelBoard.Api;

public static class AdvertisingMetadataApi
{
    private const string GoogleCertificationAuthorityId = "f08c47fec0942fa0";

    public static IEndpointRouteBuilder MapAdvertisingMetadata(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet(
                "/ads.txt",
                (IOptions<AdvertisingOptions> options) =>
                    CreateRecord(options.Value, mobile: false))
            .ExcludeFromDescription();
        endpoints.MapGet(
                "/app-ads.txt",
                (IOptions<AdvertisingOptions> options) =>
                    CreateRecord(options.Value, mobile: true))
            .ExcludeFromDescription();
        return endpoints;
    }

    private static IResult CreateRecord(AdvertisingOptions options, bool mobile)
    {
        var enabled = options.ModerationOperationsEnabled
            && (mobile ? options.MobileEnabled : options.WebEnabled);
        if (!enabled)
        {
            return Results.NotFound();
        }

        var publisherId = mobile
            ? options.AdMobApplicationId.Split('~', 2)[0].Replace("ca-app-pub-", "pub-")
            : options.AdSensePublisherId.Replace("ca-pub-", "pub-");
        return Results.Text(
            $"google.com, {publisherId}, DIRECT, {GoogleCertificationAuthorityId}\n",
            "text/plain");
    }
}
