using PixelBoard.Application;
using PixelBoard.Contracts.V1;
using PixelBoard.Infrastructure.StoreKit;

namespace PixelBoard.Api.V1;

public static class StoreKitApi
{
    public static IEndpointRouteBuilder MapStoreKitApiV1(this IEndpointRouteBuilder endpoints)
    {
        var api = endpoints.MapGroup("/api/v1/storekit");
        api.MapPost("/notifications", ProcessNotificationAsync);

        var authenticatedApi = endpoints
            .MapGroup("/api/v1/storekit")
            .RequireAuthorization();
        authenticatedApi.MapGet("/account-token", GetAccountTokenAsync);
        authenticatedApi.MapPost("/transactions", VerifyTransactionAsync);
        return endpoints;
    }

    public static async Task<IResult> GetAccountTokenAsync(
        IAccountIdentityAccessor identityAccessor,
        IServiceProvider services,
        CancellationToken cancellationToken)
    {
        var account = await identityAccessor.GetCurrentAsync(cancellationToken);
        if (account is null)
        {
            return AuthenticationRequired();
        }

        var store = services.GetService<IStoreKitEntitlementStore>();
        if (store is null)
        {
            return ServiceUnavailable();
        }

        if (await IsDeletedAsync(account.Id, services, cancellationToken))
        {
            return AccountDeleted();
        }

        var token = await store.GetOrCreateAccountTokenAsync(account.Id, cancellationToken);
        return token is { } accountToken
            ? Results.Ok(new StoreKitAccountTokenResponse(accountToken))
            : AccountDeleted();
    }

    public static async Task<IResult> VerifyTransactionAsync(
        VerifyStoreKitTransactionRequest request,
        IAccountIdentityAccessor identityAccessor,
        IServiceProvider services,
        CancellationToken cancellationToken)
    {
        var account = await identityAccessor.GetCurrentAsync(cancellationToken);
        if (account is null)
        {
            return AuthenticationRequired();
        }

        var verifier = services.GetService<IStoreKitTransactionVerifier>();
        var store = services.GetService<IStoreKitEntitlementStore>();
        var entitlements = services.GetService<IEntitlementService>();
        if (verifier is null || store is null || entitlements is null)
        {
            return ServiceUnavailable();
        }

        if (await IsDeletedAsync(account.Id, services, cancellationToken))
        {
            return AccountDeleted();
        }

        var verification = verifier.Verify(request.SignedTransactionInfo);
        if (!verification.IsValid)
        {
            return Results.BadRequest(new ApiError(
                ApiErrorCodes.InvalidStoreKitTransaction,
                verification.Error ?? "The StoreKit transaction is invalid."));
        }

        if (!await store.ApplyAsync(account.Id, verification.Transaction!, cancellationToken))
        {
            return Results.Json(
                new ApiError(
                    ApiErrorCodes.StoreKitAccountMismatch,
                    "This subscription belongs to another account."),
                statusCode: StatusCodes.Status403Forbidden);
        }

        var entitlement = await entitlements.GetAsync(account.Id, cancellationToken);
        return Results.Ok(new StoreKitEntitlementResponse(
            entitlement.Tier,
            entitlement.ExpiresAt));
    }

    public static async Task<IResult> ProcessNotificationAsync(
        StoreKitNotificationRequest request,
        IServiceProvider services,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        var verifier = services.GetService<IStoreKitTransactionVerifier>();
        var store = services.GetService<IStoreKitEntitlementStore>();
        if (verifier is null || store is null)
        {
            return ServiceUnavailable();
        }

        var notification = verifier.VerifyNotification(request.SignedPayload);
        if (!notification.IsValid)
        {
            return Results.BadRequest(new ApiError(
                ApiErrorCodes.InvalidStoreKitTransaction,
                notification.Error ?? "The StoreKit notification is invalid."));
        }

        var logger = loggerFactory.CreateLogger(typeof(StoreKitApi));
        if (notification.Transaction is null)
        {
            logger.LogDebug(
                "Processed StoreKit notification {NotificationId} of type {NotificationType} without transaction data.",
                notification.NotificationId,
                notification.NotificationType);
        }
        else if (!await store.ApplyNotificationAsync(
                     notification.Transaction,
                     cancellationToken))
        {
            logger.LogWarning(
                "Ignored StoreKit notification {NotificationId} because its app account token is unknown.",
                notification.NotificationId);
        }

        return Results.NoContent();
    }

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
                "StoreKit entitlement services are unavailable."),
            statusCode: StatusCodes.Status503ServiceUnavailable);
}
