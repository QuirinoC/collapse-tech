using Microsoft.Extensions.Options;
using PixelBoard.Application;
using PixelBoard.Configuration;
using PixelBoard.Contracts.V1;

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
        endpoints.MapGet("/api/v1/advertising", DecideAsync)
            .ExcludeFromDescription();
        return endpoints;
    }

    public static async Task<IResult> DecideAsync(
        IAccountIdentityAccessor identityAccessor,
        IAdvertisingPolicy policy,
        IServiceProvider services,
        CancellationToken cancellationToken)
    {
        var account = await identityAccessor.GetCurrentAsync(cancellationToken);
        var tier = AccountTier.Free;
        if (account is not null)
        {
            var entitlements = services.GetService<IEntitlementService>();
            if (entitlements is null)
            {
                return Results.Json(
                    new ApiError(
                        ApiErrorCodes.ServiceUnavailable,
                        "Advertising policy is unavailable."),
                    statusCode: StatusCodes.Status503ServiceUnavailable);
            }
            tier = (await entitlements.GetAsync(account.Id, cancellationToken)).Tier;
        }

        return Results.Ok(await policy.DecideAsync(account?.Id, tier, cancellationToken));
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
