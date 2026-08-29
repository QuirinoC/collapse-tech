using System.Text;
using Microsoft.Extensions.Options;
using PixelBoard.Application;
using PixelBoard.Configuration;
using PixelBoard.Contracts.V1;
using PixelBoard.Infrastructure.Stripe;
using Stripe;

namespace PixelBoard.Api.V1;

public static class StripeApi
{
    public static IEndpointRouteBuilder MapStripeApiV1(this IEndpointRouteBuilder endpoints)
    {
        var api = endpoints.MapGroup("/api/v1/stripe");
        api.MapGet("/config", GetConfig);
        api.MapPost("/webhook", ProcessWebhookAsync);

        var authenticatedApi = endpoints
            .MapGroup("/api/v1/stripe")
            .RequireAuthorization();
        authenticatedApi.MapGet("/status", GetStatusAsync);
        authenticatedApi.MapPost("/checkout-session", CreateCheckoutSessionAsync);
        authenticatedApi.MapPost("/portal", CreatePortalSessionAsync);
        return endpoints;
    }

    public static IResult GetConfig(IOptions<StripeOptions> options) =>
        Results.Ok(new StripeConfigResponse(options.Value.Enabled));

    public static async Task<IResult> GetStatusAsync(
        IAccountIdentityAccessor identityAccessor,
        IServiceProvider services,
        CancellationToken cancellationToken)
    {
        var account = await identityAccessor.GetCurrentAsync(cancellationToken);
        if (account is null)
        {
            return AuthenticationRequired();
        }

        var store = services.GetService<IStripeBillingStore>();
        if (store is null)
        {
            return ServiceUnavailable();
        }

        if (await IsDeletedAsync(account.Id, services, cancellationToken))
        {
            return AccountDeleted();
        }

        return Results.Ok(
            new StripeStatusResponse(await store.HasCustomerAsync(account.Id, cancellationToken)));
    }

    public static async Task<IResult> CreateCheckoutSessionAsync(
        CreateStripeCheckoutSessionRequest request,
        HttpRequest httpRequest,
        IAccountIdentityAccessor identityAccessor,
        IOptions<StripeOptions> options,
        IServiceProvider services,
        CancellationToken cancellationToken)
    {
        var account = await identityAccessor.GetCurrentAsync(cancellationToken);
        if (account is null)
        {
            return AuthenticationRequired();
        }

        var gateway = services.GetService<IStripeBillingGateway>();
        var store = services.GetService<IStripeBillingStore>();
        if (gateway is null || store is null)
        {
            return ServiceUnavailable();
        }

        if (await IsDeletedAsync(account.Id, services, cancellationToken))
        {
            return AccountDeleted();
        }

        var priceId = StripeBilling.PriceId(request.Interval, options.Value);
        if (priceId is null)
        {
            return Results.BadRequest(new ApiError(
                ApiErrorCodes.InvalidStripeInterval,
                "Choose monthly or annual Pixelboard Pro."));
        }

        try
        {
            var customerId = await store.GetCustomerIdAsync(account.Id, cancellationToken);
            if (customerId is null)
            {
                var created = await gateway.CreateCustomerAsync(account.Id, cancellationToken);
                customerId = await store.SaveCustomerAsync(account.Id, created, cancellationToken);
                if (customerId is null)
                {
                    return await IsDeletedAsync(account.Id, services, cancellationToken)
                        ? AccountDeleted()
                        : ServiceUnavailable();
                }
            }

            var origin = PublicOrigin(httpRequest);
            var url = await gateway.CreateCheckoutSessionAsync(
                new StripeCheckoutSessionRequest(
                    account.Id,
                    customerId,
                    priceId,
                    $"{origin}/?billing=success",
                    $"{origin}/?billing=cancel"),
                cancellationToken);
            return Results.Ok(new StripeRedirectResponse(url));
        }
        catch (StripeException exception)
        {
            var logger = services.GetRequiredService<ILoggerFactory>()
                .CreateLogger(typeof(StripeApi));
            logger.LogWarning(exception, "Stripe Checkout session could not be created.");
            return ServiceUnavailable();
        }
    }

    public static async Task<IResult> CreatePortalSessionAsync(
        HttpRequest httpRequest,
        IAccountIdentityAccessor identityAccessor,
        IServiceProvider services,
        CancellationToken cancellationToken)
    {
        var account = await identityAccessor.GetCurrentAsync(cancellationToken);
        if (account is null)
        {
            return AuthenticationRequired();
        }

        var gateway = services.GetService<IStripeBillingGateway>();
        var store = services.GetService<IStripeBillingStore>();
        if (gateway is null || store is null)
        {
            return ServiceUnavailable();
        }

        if (await IsDeletedAsync(account.Id, services, cancellationToken))
        {
            return AccountDeleted();
        }

        var customerId = await store.GetCustomerIdAsync(account.Id, cancellationToken);
        if (customerId is null)
        {
            return Results.BadRequest(new ApiError(
                ApiErrorCodes.StripeCustomerMissing,
                "No website subscription to manage. iPhone Pro is managed in Apple subscriptions."));
        }

        try
        {
            var url = await gateway.CreatePortalSessionAsync(
                customerId,
                $"{PublicOrigin(httpRequest)}/?billing=manage",
                cancellationToken);
            return Results.Ok(new StripeRedirectResponse(url));
        }
        catch (StripeException exception)
        {
            var logger = services.GetRequiredService<ILoggerFactory>()
                .CreateLogger(typeof(StripeApi));
            logger.LogWarning(exception, "Stripe Customer Portal session could not be created.");
            return ServiceUnavailable();
        }
    }

    public static async Task<IResult> ProcessWebhookAsync(
        HttpRequest request,
        IServiceProvider services,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        var gateway = services.GetService<IStripeBillingGateway>();
        var store = services.GetService<IStripeBillingStore>();
        if (gateway is null || store is null)
        {
            return ServiceUnavailable();
        }

        using var reader = new StreamReader(request.Body, Encoding.UTF8);
        var payload = await reader.ReadToEndAsync(cancellationToken);
        var parsed = gateway.ParseWebhook(
            payload,
            request.Headers["Stripe-Signature"].ToString());
        if (!parsed.IsValid)
        {
            return Results.BadRequest(new ApiError(
                ApiErrorCodes.InvalidStripeWebhook,
                parsed.Error ?? "The Stripe webhook is invalid."));
        }

        if (!StripeBilling.ShouldApply(parsed.EventType)
            || string.IsNullOrWhiteSpace(parsed.SubscriptionId))
        {
            return Results.NoContent();
        }

        var snapshot = await gateway.GetSubscriptionAsync(
            parsed.SubscriptionId,
            cancellationToken);
        if (snapshot is null)
        {
            loggerFactory.CreateLogger(typeof(StripeApi)).LogWarning(
                "Stripe webhook {EventType} referenced unknown subscription {SubscriptionId}.",
                parsed.EventType,
                parsed.SubscriptionId);
            return Results.NoContent();
        }

        var firebaseUid = FirstNonEmpty(parsed.FirebaseUid, snapshot.FirebaseUid);
        if (string.IsNullOrWhiteSpace(firebaseUid)
            && !string.IsNullOrWhiteSpace(snapshot.CustomerId))
        {
            firebaseUid = await store.FindFirebaseUidByCustomerAsync(
                snapshot.CustomerId,
                cancellationToken);
        }

        if (string.IsNullOrWhiteSpace(firebaseUid))
        {
            loggerFactory.CreateLogger(typeof(StripeApi)).LogWarning(
                "Stripe webhook {EventType} for subscription {SubscriptionId} had no account mapping.",
                parsed.EventType,
                parsed.SubscriptionId);
            return Results.NoContent();
        }

        var applied = await store.ApplyAsync(
            new StripeSubscriptionUpdate(
                new AccountId(firebaseUid),
                snapshot.CustomerId,
                snapshot.SubscriptionId,
                snapshot.Status,
                snapshot.PriceId,
                snapshot.CurrentPeriodEnd,
                parsed.EventAt),
            cancellationToken);
        if (!applied)
        {
            loggerFactory.CreateLogger(typeof(StripeApi)).LogWarning(
                "Ignored Stripe webhook {EventType} for account {AccountId}.",
                parsed.EventType,
                firebaseUid);
        }

        return Results.NoContent();
    }

    private static string PublicOrigin(HttpRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Host.Value))
        {
            return "https://pixelboard.collapsetechnologies.com";
        }

        return $"{request.Scheme}://{request.Host.Value}";
    }

    private static string? FirstNonEmpty(params string?[] values) =>
        values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value));

    private static IResult AuthenticationRequired() =>
        Results.Json(
            new ApiError(
                ApiErrorCodes.AuthenticationRequired,
                "Authenticate before managing a subscription."),
            statusCode: StatusCodes.Status401Unauthorized);

    private static async ValueTask<bool> IsDeletedAsync(
        AccountId accountId,
        IServiceProvider services,
        CancellationToken cancellationToken)
    {
        var deletion = services.GetService<IAccountDeletionService>();
        return deletion is not null
            && await deletion.IsDeletedAsync(accountId, cancellationToken);
    }

    private static IResult AccountDeleted() =>
        Results.Json(
            new ApiError(
                ApiErrorCodes.AccountDeleted,
                "This account has been deleted."),
            statusCode: StatusCodes.Status410Gone);

    private static IResult ServiceUnavailable() =>
        Results.Json(
            new ApiError(
                ApiErrorCodes.ServiceUnavailable,
                "Website billing is unavailable."),
            statusCode: StatusCodes.Status503ServiceUnavailable);
}
