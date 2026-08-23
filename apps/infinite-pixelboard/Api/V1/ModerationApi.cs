using System.Text.Json;
using PixelBoard.Application;
using PixelBoard.Contracts.V1;
using PixelBoard.Infrastructure.Moderation;
using PixelBoard.Infrastructure.Identity;

namespace PixelBoard.Api.V1;

public sealed record ModerationActionRequest(
    string ActionType,
    string Reason,
    string IdempotencyKey,
    ReportId? ReportId,
    string? TargetAccountId,
    IReadOnlyList<PlacementId>? PlacementIds,
    DateTimeOffset? ExpiresAt);

public sealed record SafetyStateRequest(
    bool PlacementsFrozen,
    bool AdsDisabled,
    string Reason,
    string IdempotencyKey);

public sealed record PrivateModerationReportResponse(
    ReportId ReportId,
    ReportStatus Status,
    ReportRegion Region,
    ReportReason Reason,
    string? Note,
    JsonElement Snapshot,
    string EvidenceHash,
    DateTimeOffset SubmittedAt);

public static class ModerationApi
{
    private static readonly HashSet<string> ActionTypes =
        ["dismiss", "quarantine", "rollback", "warn", "suspend", "ban"];

    public static IEndpointRouteBuilder MapModerationApiV1(
        this IEndpointRouteBuilder endpoints)
    {
        var api = endpoints
            .MapGroup("/api/v1/moderation")
            .RequireAuthorization(FirebaseAuthenticationExtensions.ModeratorPolicy);
        api.MapGet("/reports", ListReportsAsync);
        api.MapGet("/reports/{reportId:guid}", GetReportAsync);
        api.MapPost("/actions", ExecuteActionAsync);
        api.MapGet("/safety", GetSafetyStateAsync);
        api.MapPost("/safety", SetSafetyStateAsync);
        return endpoints;
    }

    public static async Task<IResult> ListReportsAsync(
        int? limit,
        IServiceProvider services,
        CancellationToken cancellationToken)
    {
        var moderation = services.GetService<IModerationService>();
        if (moderation is null)
        {
            return ServiceUnavailable();
        }

        var reports = await moderation.ListReportsAsync(limit ?? 50, cancellationToken);
        return Results.Ok(reports.Select(ToPrivateResponse));
    }

    public static async Task<IResult> GetReportAsync(
        Guid reportId,
        IServiceProvider services,
        CancellationToken cancellationToken)
    {
        var moderation = services.GetService<IModerationService>();
        if (moderation is null)
        {
            return ServiceUnavailable();
        }

        var report = await moderation.GetReportAsync(
            ReportId.From(reportId),
            cancellationToken);
        return report is null
            ? Results.NotFound()
            : Results.Ok(ToPrivateResponse(report));
    }

    public static async Task<IResult> ExecuteActionAsync(
        ModerationActionRequest? request,
        IAccountIdentityAccessor identityAccessor,
        TimeProvider timeProvider,
        IServiceProvider services,
        CancellationToken cancellationToken)
    {
        var moderation = services.GetService<IModerationService>();
        var actor = await identityAccessor.GetCurrentAsync(cancellationToken);
        if (moderation is null || actor is null)
        {
            return ServiceUnavailable();
        }

        var validation = ValidateAction(request, timeProvider.GetUtcNow());
        if (validation is not null)
        {
            return Results.BadRequest(validation);
        }

        var command = new ModerationActionCommand(
            ModerationActionId.New(),
            request!.IdempotencyKey,
            actor.Id,
            request.ActionType,
            request.Reason.Trim(),
            request.ReportId,
            string.IsNullOrWhiteSpace(request.TargetAccountId)
                ? null
                : new AccountId(request.TargetAccountId.Trim()),
            request.PlacementIds ?? [],
            request.ExpiresAt,
            timeProvider.GetUtcNow());
        try
        {
            return Results.Ok(await moderation.ExecuteAsync(command, cancellationToken));
        }
        catch (ModerationConflictException exception)
        {
            return Results.Conflict(
                new ApiError(ApiErrorCodes.ModerationConflict, exception.Message));
        }
    }

    public static async Task<IResult> GetSafetyStateAsync(
        IServiceProvider services,
        CancellationToken cancellationToken)
    {
        var safety = services.GetService<IPlatformSafetyService>();
        return safety is null
            ? ServiceUnavailable()
            : Results.Ok(await safety.GetStateAsync(cancellationToken));
    }

    public static async Task<IResult> SetSafetyStateAsync(
        SafetyStateRequest? request,
        IAccountIdentityAccessor identityAccessor,
        TimeProvider timeProvider,
        IServiceProvider services,
        CancellationToken cancellationToken)
    {
        var moderation = services.GetService<IModerationService>();
        var actor = await identityAccessor.GetCurrentAsync(cancellationToken);
        if (moderation is null || actor is null)
        {
            return ServiceUnavailable();
        }

        if (request is null
            || !ValidReason(request.Reason)
            || !ValidIdempotencyKey(request.IdempotencyKey))
        {
            return Results.BadRequest(
                new ApiError(
                    ApiErrorCodes.InvalidModerationAction,
                    "A reason and valid idempotency key are required."));
        }

        var now = timeProvider.GetUtcNow();
        var command = new ModerationActionCommand(
            ModerationActionId.New(),
            request.IdempotencyKey,
            actor.Id,
            "safety_update",
            request.Reason.Trim(),
            null,
            null,
            [],
            null,
            now);
        try
        {
            return Results.Ok(await moderation.SetSafetyStateAsync(
                command,
                new PlatformSafetyState(request.PlacementsFrozen, request.AdsDisabled),
                cancellationToken));
        }
        catch (ModerationConflictException exception)
        {
            return Results.Conflict(
                new ApiError(ApiErrorCodes.ModerationConflict, exception.Message));
        }
    }

    private static ApiError? ValidateAction(
        ModerationActionRequest? request,
        DateTimeOffset now)
    {
        if (request is null
            || !ActionTypes.Contains(request.ActionType)
            || !ValidReason(request.Reason)
            || !ValidIdempotencyKey(request.IdempotencyKey))
        {
            return new ApiError(
                ApiErrorCodes.InvalidModerationAction,
                "The moderation action, reason, or idempotency key is invalid.");
        }

        if (request.ActionType is "dismiss" or "quarantine"
            && request.ReportId is null)
        {
            return new ApiError(
                ApiErrorCodes.InvalidModerationAction,
                "This action requires a report.");
        }

        if (request.ActionType is "warn" or "suspend" or "ban"
            && string.IsNullOrWhiteSpace(request.TargetAccountId))
        {
            return new ApiError(
                ApiErrorCodes.InvalidModerationAction,
                "This action requires a target account.");
        }

        if (request.ActionType == "suspend"
            && (request.ExpiresAt is null || request.ExpiresAt <= now))
        {
            return new ApiError(
                ApiErrorCodes.InvalidModerationAction,
                "A suspension requires a future expiry.");
        }

        if (request.ActionType == "rollback"
            && (request.PlacementIds is null
                || request.PlacementIds.Count is < 1 or > 4096))
        {
            return new ApiError(
                ApiErrorCodes.InvalidModerationAction,
                "Rollback requires between 1 and 4096 placements.");
        }

        return null;
    }

    private static bool ValidReason(string? reason) =>
        !string.IsNullOrWhiteSpace(reason)
        && reason.Trim().Length <= 500;

    private static bool ValidIdempotencyKey(string? key) =>
        !string.IsNullOrWhiteSpace(key)
        && key.Length is >= 16 and <= 128
        && key.All(character =>
            char.IsAsciiLetterOrDigit(character) || character is '-' or '_');

    private static PrivateModerationReportResponse ToPrivateResponse(
        ModerationReport report)
    {
        using var document = JsonDocument.Parse(report.SnapshotJson);
        return new PrivateModerationReportResponse(
            report.ReportId,
            report.Status,
            report.Region,
            report.Reason,
            report.Note,
            document.RootElement.Clone(),
            Convert.ToHexStringLower(report.EvidenceHash),
            report.SubmittedAt);
    }

    private static IResult ServiceUnavailable() =>
        Results.Json(
            new ApiError(
                ApiErrorCodes.ServiceUnavailable,
                "Moderation operations are unavailable."),
            statusCode: StatusCodes.Status503ServiceUnavailable);
}
