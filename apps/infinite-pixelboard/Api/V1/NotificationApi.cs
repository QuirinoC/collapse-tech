using Microsoft.Extensions.Options;
using Npgsql;
using PixelBoard.Application;
using PixelBoard.Configuration;
using PixelBoard.Contracts.V1;
using PixelBoard.Infrastructure.Identity;
using PixelBoard.Infrastructure.Notifications;

namespace PixelBoard.Api.V1;

public sealed record PushDeviceRequest(
    string? InstallationId,
    string? Token,
    string? Environment,
    string? BundleId);

public static class NotificationApi
{
    private const int MaximumCampaignRecipients = 500;

    public static IEndpointRouteBuilder MapNotificationApiV1(
        this IEndpointRouteBuilder endpoints)
    {
        var authenticated = endpoints
            .MapGroup("/api/v1/notifications")
            .RequireAuthorization();
        authenticated.MapPost("/devices", RegisterDeviceAsync);
        authenticated.MapDelete("/devices/{installationId:guid}", RemoveDeviceAsync);

        var moderator = endpoints
            .MapGroup("/api/v1/moderation/notifications")
            .RequireAuthorization(FirebaseAuthenticationExtensions.ModeratorPolicy);
        moderator.MapPost("/campaigns", CreateCampaignAsync);
        return endpoints;
    }

    public static async Task<IResult> RegisterDeviceAsync(
        PushDeviceRequest? request,
        IAccountIdentityAccessor identityAccessor,
        IOptions<ApnsOptions> options,
        IServiceProvider services,
        CancellationToken cancellationToken)
    {
        var account = await identityAccessor.GetCurrentAsync(cancellationToken);
        var store = services.GetService<INotificationStore>();
        if (account is null)
        {
            return AuthenticationRequired();
        }

        if (store is null || !options.Value.Enabled)
        {
            return ServiceUnavailable();
        }

        if (!TryParseDevice(request, options.Value, out var registration, out var error))
        {
            return Results.BadRequest(new ApiError("invalid_notification_device", error!));
        }

        if (await IsDeletedAsync(account.Id, services, cancellationToken))
        {
            return AccountDeleted();
        }

        await store.RegisterDeviceAsync(account.Id, registration!, cancellationToken);
        return Results.NoContent();
    }

    public static async Task<IResult> RemoveDeviceAsync(
        Guid installationId,
        IAccountIdentityAccessor identityAccessor,
        IServiceProvider services,
        CancellationToken cancellationToken)
    {
        var account = await identityAccessor.GetCurrentAsync(cancellationToken);
        var store = services.GetService<INotificationStore>();
        if (account is null)
        {
            return AuthenticationRequired();
        }

        if (store is null)
        {
            return ServiceUnavailable();
        }

        await store.RemoveDeviceAsync(account.Id, installationId, cancellationToken);
        return Results.NoContent();
    }

    public static async Task<IResult> CreateCampaignAsync(
        NotificationCampaignRequest? request,
        IAccountIdentityAccessor identityAccessor,
        TimeProvider timeProvider,
        IServiceProvider services,
        CancellationToken cancellationToken)
    {
        var moderator = await identityAccessor.GetCurrentAsync(cancellationToken);
        var store = services.GetService<INotificationStore>();
        if (moderator is null)
        {
            return AuthenticationRequired();
        }

        if (store is null)
        {
            return ServiceUnavailable();
        }
        if (request is null)
        {
            return InvalidCampaign();
        }

        var now = timeProvider.GetUtcNow();
        var title = request.Title?.Trim();
        var body = request.Body?.Trim();
        var recipientValues = request.RecipientAccountIds?
            .Select(value => value?.Trim())
            .ToArray();
        if (title is null or { Length: < 1 or > 80 }
            || body is null or { Length: < 1 or > 240 }
            || recipientValues is null or { Length: < 1 or > MaximumCampaignRecipients }
            || recipientValues.Any(string.IsNullOrWhiteSpace)
            || request.ExpiresAt is { } expiresAt
                && (expiresAt <= now || expiresAt > now.AddDays(7)))
        {
            return InvalidCampaign();
        }
        var recipients = recipientValues
            .Select(value => new AccountId(value!))
            .Distinct()
            .ToArray();

        if (await IsDeletedAsync(moderator.Id, services, cancellationToken))
        {
            return AccountDeleted();
        }

        try
        {
            var campaign = await store.CreateCampaignAsync(
                moderator.Id,
                title!,
                body!,
                recipients,
                request.ExpiresAt,
                cancellationToken);
            return Results.Ok(campaign);
        }
        catch (NpgsqlException exception)
        {
            services.GetService<ILoggerFactory>()?.CreateLogger(nameof(NotificationApi)).LogError(
                exception,
                "Notification campaign persistence failed for moderator {ModeratorId}.",
                moderator.Id.Value);
            return ServiceUnavailable();
        }
    }

    private static bool TryParseDevice(
        PushDeviceRequest? request,
        ApnsOptions options,
        out PushDeviceRegistration? registration,
        out string? error)
    {
        registration = null;
        error = null;
        if (request is null
            || !Guid.TryParse(request.InstallationId, out var installationId)
            || string.IsNullOrWhiteSpace(request.Token)
            || request.Token.Length > 2048
            || request.Environment is not ("production" or "sandbox")
            || !string.Equals(request.Environment, options.Environment, StringComparison.Ordinal)
            || !string.Equals(request.BundleId, options.BundleId, StringComparison.Ordinal))
        {
            error = "A valid installation ID, APNs token, environment, and bundle ID are required.";
            return false;
        }

        registration = new PushDeviceRegistration(
            installationId,
            request.Token,
            request.Environment,
            request.BundleId!);
        return true;
    }

    private static IResult AuthenticationRequired() =>
        Results.Json(
            new ApiError(
                ApiErrorCodes.AuthenticationRequired,
                "Authenticate before managing notifications."),
            statusCode: StatusCodes.Status401Unauthorized);

    private static IResult ServiceUnavailable() =>
        Results.Json(
            new ApiError(
                ApiErrorCodes.ServiceUnavailable,
                "Notification service is temporarily unavailable."),
            statusCode: StatusCodes.Status503ServiceUnavailable);

    private static IResult AccountDeleted() =>
        Results.Json(
            new ApiError(
                ApiErrorCodes.AccountDeleted,
                "This account has been deleted."),
            statusCode: StatusCodes.Status410Gone);

    private static IResult InvalidCampaign() =>
        Results.BadRequest(new ApiError(
            "invalid_notification_campaign",
            "Provide a title, body, 1-500 recipients, and an expiry within seven days."));

    private static async ValueTask<bool> IsDeletedAsync(
        AccountId accountId,
        IServiceProvider services,
        CancellationToken cancellationToken)
    {
        var deletion = services.GetService<IAccountDeletionService>();
        return deletion is not null
            && await deletion.IsDeletedAsync(accountId, cancellationToken);
    }
}
