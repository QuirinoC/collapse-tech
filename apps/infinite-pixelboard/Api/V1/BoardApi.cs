using PixelBoard.Application;
using PixelBoard.Contracts.V1;
using PixelBoard.Domain;
using PixelBoard.Infrastructure.Board;
using PixelBoard.Infrastructure.Ledger;

namespace PixelBoard.Api.V1;

public static class BoardApi
{
    public const string CurrentCommunityStandardsVersion = "2026-08-21";

    public static IEndpointRouteBuilder MapBoardApiV1(this IEndpointRouteBuilder endpoints)
    {
        var api = endpoints.MapGroup("/api/v1");

        api.MapGet("/board", GetMetadata);
        api.MapGet("/tiles/{tileRow:int}/{tileColumn:int}", GetTileAsync);
        api.MapGet("/account", GetAccountAsync).RequireAuthorization();
        api.MapPost(
                "/account/community-standards",
                AcceptCommunityStandardsAsync)
            .RequireAuthorization();
        api.MapPost("/placements", PlaceAsync).RequireAuthorization();
        api.MapPost("/reports", ReportAsync).RequireAuthorization();

        return endpoints;
    }

    public static BoardMetadataResponse GetMetadata()
    {
        return new BoardMetadataResponse(
            ApiVersions.V1,
            PixelBoardConstants.TileRows,
            PixelBoardConstants.TileCols,
            PixelBoardConstants.DefaultColor,
            "row-column",
            BoardAccessMode.Open);
    }

    public static async ValueTask<TileSnapshotResponse> GetTileAsync(
        int tileRow,
        int tileColumn,
        IBoardStore boardStore,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        var pixels = await boardStore.GetTileAsync(
            new TileAddress(tileRow, tileColumn),
            cancellationToken);
        return new TileSnapshotResponse(
            ApiVersions.V1,
            tileRow,
            tileColumn,
            pixels,
            timeProvider.GetUtcNow());
    }

    public static async Task<IResult> GetAccountAsync(
        IAccountIdentityAccessor identityAccessor,
        IServiceProvider services,
        CancellationToken cancellationToken)
    {
        var account = await identityAccessor.GetCurrentAsync(cancellationToken);
        if (account is null)
        {
            return AuthenticationRequired();
        }

        var policyService = services.GetService<IAccountPolicyService>();
        var entitlementService = services.GetService<IEntitlementService>();
        if (policyService is null || entitlementService is null)
        {
            return ServiceUnavailable();
        }

        var policy = await policyService.GetAsync(
            account.Id,
            CurrentCommunityStandardsVersion,
            cancellationToken);
        var entitlement = await entitlementService.GetAsync(account.Id, cancellationToken);
        return Results.Ok(new AccountStateResponse(
            entitlement.Tier,
            !policy.IsBanned && policy.CommunityStandardsAccepted,
            policy.CommunityStandardsAccepted,
            new CooldownState(null, CooldownSeconds(entitlement.Tier))));
    }

    public static async Task<IResult> AcceptCommunityStandardsAsync(
        IAccountIdentityAccessor identityAccessor,
        IServiceProvider services,
        CancellationToken cancellationToken)
    {
        var account = await identityAccessor.GetCurrentAsync(cancellationToken);
        if (account is null)
        {
            return AuthenticationRequired();
        }

        var policyService = services.GetService<IAccountPolicyService>();
        if (policyService is null)
        {
            return ServiceUnavailable();
        }

        await policyService.AcceptCommunityStandardsAsync(
            account.Id,
            CurrentCommunityStandardsVersion,
            cancellationToken);
        return Results.NoContent();
    }

    public static async Task<IResult> PlaceAsync(
        PlacementRequest request,
        IAccountIdentityAccessor identityAccessor,
        IPlacementValidator validator,
        TimeProvider timeProvider,
        IServiceProvider services,
        CancellationToken cancellationToken)
    {
        var account = await identityAccessor.GetCurrentAsync(cancellationToken);
        if (account is null)
        {
            return AuthenticationRequired();
        }

        var policyService = services.GetService<IAccountPolicyService>();
        var entitlementService = services.GetService<IEntitlementService>();
        var placementStore = services.GetService<IAtomicPlacementStore>();
        if (policyService is null || entitlementService is null || placementStore is null)
        {
            return ServiceUnavailable();
        }

        var policy = await policyService.GetAsync(
            account.Id,
            CurrentCommunityStandardsVersion,
            cancellationToken);
        if (policy.IsBanned)
        {
            return Results.Json(
                new ApiError(ApiErrorCodes.AccountBanned, "This account cannot place pixels."),
                statusCode: StatusCodes.Status403Forbidden);
        }

        if (!policy.CommunityStandardsAccepted)
        {
            return Results.Json(
                new ApiError(
                    ApiErrorCodes.CommunityStandardsRequired,
                    "Accept the current community standards before placing pixels."),
                statusCode: StatusCodes.Status403Forbidden);
        }

        var command = new PlacementCommand(
            account.Id,
            new BoardPosition(request.Row, request.Column),
            request.Color,
            request.IdempotencyKey,
            request.Client);
        var validation = validator.Validate(command);
        if (!validation.IsValid)
        {
            return Results.BadRequest(validation.Error);
        }

        var entitlement = await entitlementService.GetAsync(account.Id, cancellationToken);
        var cooldownSeconds = CooldownSeconds(entitlement.Tier);
        var cooldown = TimeSpan.FromSeconds(cooldownSeconds);
        var placedAt = timeProvider.GetUtcNow();
        var placement = new PlacementLedgerEvent(
            PlacementId.New(),
            account.Id.Value,
            request.Row,
            request.Column,
            request.Color.ToUpperInvariant(),
            placedAt,
            request.Client.Platform,
            request.Client.AppVersion,
            request.IdempotencyKey,
            null,
            null,
            null,
            null);
        var result = await placementStore.PlaceAsync(
            placement,
            cooldown,
            cancellationToken);
        if (result.IsIdempotencyConflict)
        {
            return Results.Json(
                new PlacementResult(
                    PlacementOutcome.Rejected,
                    null,
                    null,
                    new CooldownState(null, cooldownSeconds),
                    new ApiError(
                        ApiErrorCodes.InvalidIdempotencyKey,
                        "The idempotency key was already used for another request.")),
                statusCode: StatusCodes.Status409Conflict);
        }

        if (!result.IsAccepted)
        {
            return Results.Json(
                new PlacementResult(
                    PlacementOutcome.Rejected,
                    null,
                    null,
                    new CooldownState(
                        placedAt.Add(result.RemainingCooldown),
                        cooldownSeconds),
                    new ApiError(
                        ApiErrorCodes.CooldownActive,
                        "Wait for the placement cooldown to finish.")),
                statusCode: StatusCodes.Status429TooManyRequests);
        }

        return Results.Ok(
            new PlacementResult(
                PlacementOutcome.Accepted,
                result.PlacementId,
                result.Pixel,
                new CooldownState(
                    timeProvider.GetUtcNow().Add(result.RemainingCooldown),
                    cooldownSeconds),
                null));
    }

    public static async Task<IResult> ReportAsync(
        CreateReportRequest? request,
        IAccountIdentityAccessor identityAccessor,
        IReportValidator validator,
        TimeProvider timeProvider,
        IServiceProvider services,
        CancellationToken cancellationToken)
    {
        var account = await identityAccessor.GetCurrentAsync(cancellationToken);
        if (account is null)
        {
            return AuthenticationRequired();
        }

        var policyService = services.GetService<IAccountPolicyService>();
        var rateLimiter = services.GetService<IReportRateLimiter>();
        var evidenceCollector = services.GetService<IReportEvidenceCollector>();
        var reportStore = services.GetService<IReportStore>();
        if (policyService is null
            || rateLimiter is null
            || evidenceCollector is null
            || reportStore is null)
        {
            return ServiceUnavailable("Reporting is not configured.");
        }

        var policy = await policyService.GetAsync(
            account.Id,
            CurrentCommunityStandardsVersion,
            cancellationToken);
        if (policy.IsBanned)
        {
            return Results.Json(
                new ApiError(
                    ApiErrorCodes.AccountBanned,
                    "This account cannot submit reports."),
                statusCode: StatusCodes.Status403Forbidden);
        }

        var submittedAt = timeProvider.GetUtcNow();
        var validation = validator.Validate(
            request,
            account.Id,
            ReportId.New(),
            submittedAt);
        if (!validation.IsValid)
        {
            return Results.BadRequest(validation.Error);
        }

        var command = validation.Command!;
        var admission = await rateLimiter.TryAcquireAsync(command, cancellationToken);
        if (admission == ReportAdmissionOutcome.Duplicate)
        {
            return Results.Json(
                new ApiError(
                    ApiErrorCodes.DuplicateRequest,
                    "An equivalent report was submitted recently."),
                statusCode: StatusCodes.Status409Conflict);
        }

        if (admission == ReportAdmissionOutcome.RateLimited)
        {
            return Results.Json(
                new ApiError(
                    ApiErrorCodes.ReportRateLimited,
                    "Too many reports were submitted recently."),
                statusCode: StatusCodes.Status429TooManyRequests);
        }

        try
        {
            var evidence = await evidenceCollector.CollectAsync(command, cancellationToken);
            await reportStore.SaveAsync(command, evidence, cancellationToken);
        }
        catch (Exception) when (!cancellationToken.IsCancellationRequested)
        {
            await rateLimiter.ReleaseAsync(command, CancellationToken.None);
            throw;
        }

        return Results.Json(
            new ReportResponse(command.ReportId, ReportStatus.Received, submittedAt),
            statusCode: StatusCodes.Status201Created);
    }

    private static int CooldownSeconds(AccountTier tier) =>
        tier == AccountTier.Pro ? 1 : 10;

    private static IResult AuthenticationRequired() =>
        Results.Json(
            new ApiError(ApiErrorCodes.AuthenticationRequired, "Authentication is required."),
            statusCode: StatusCodes.Status401Unauthorized);

    private static IResult ServiceUnavailable(string? message = null) =>
        Results.Json(
            new ApiError(
                ApiErrorCodes.ServiceUnavailable,
                message ?? "Authenticated placement is not configured."),
            statusCode: StatusCodes.Status503ServiceUnavailable);
}
