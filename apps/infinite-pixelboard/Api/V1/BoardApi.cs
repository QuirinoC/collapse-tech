using Microsoft.Extensions.Options;
using PixelBoard.Application;
using PixelBoard.Configuration;
using PixelBoard.Contracts.V1;
using PixelBoard.Domain;
using PixelBoard.Infrastructure.Board;
using PixelBoard.Infrastructure.Ledger;
using PixelBoard.Infrastructure.Realtime;

namespace PixelBoard.Api.V1;

public static class BoardApi
{
    public const string CurrentCommunityStandardsVersion = "2026-08-21";

    public static IEndpointRouteBuilder MapBoardApiV1(this IEndpointRouteBuilder endpoints)
    {
        var api = endpoints.MapGroup("/api/v1");

        api.MapGet("/board", GetMetadataAsync);
        api.MapGet("/tiles/{tileRow:int}/{tileColumn:int}", GetTileAsync);
        api.MapGet("/account", GetAccountAsync).RequireAuthorization();
        api.MapDelete("/account", DeleteAccountAsync).RequireAuthorization();
        api.MapPost(
                "/account/community-standards",
                AcceptCommunityStandardsAsync)
            .RequireAuthorization();
        api.MapPost("/account/referral", ClaimReferralAsync).RequireAuthorization();
        api.MapPost("/placements", PlaceAsync).RequireAuthorization();
        api.MapPost("/reports", ReportAsync).RequireAuthorization();

        return endpoints;
    }

    public static async Task<BoardMetadataResponse> GetMetadataAsync(
        IServiceProvider services,
        CancellationToken cancellationToken)
    {
        var frozen = false;
        var safety = services.GetService<IPlatformSafetyService>();
        if (safety is not null)
        {
            frozen = (await safety.GetStateAsync(cancellationToken)).PlacementsFrozen;
        }

        var board = services.GetService<IOptions<BoardClientOptions>>()?.Value;
        var status = board?.StatusMessage;
        if (frozen)
        {
            status = string.IsNullOrWhiteSpace(status) ? "Painting is paused." : status;
        }

        return new BoardMetadataResponse(
            ApiVersions.V1,
            PixelBoardConstants.TileRows,
            PixelBoardConstants.TileCols,
            PixelBoardConstants.DefaultColor,
            "row-column",
            frozen ? BoardAccessMode.ReadOnly : BoardAccessMode.Open,
            status,
            string.IsNullOrWhiteSpace(board?.MinimumIosVersion)
                ? null
                : board.MinimumIosVersion);
    }

    public static async ValueTask<TileSnapshotResponse> GetTileAsync(
        int tileRow,
        int tileColumn,
        IBoardStore boardStore,
        TimeProvider timeProvider,
        IServiceProvider services,
        CancellationToken cancellationToken)
    {
        var tile = new TileAddress(tileRow, tileColumn);
        var pixels = await boardStore.GetTileAsync(
            tile,
            cancellationToken);
        var visibilityFilter = services.GetService<IBoardVisibilityFilter>();
        if (visibilityFilter is not null)
        {
            await visibilityFilter.ApplyAsync(tile, pixels, cancellationToken);
        }

        return new TileSnapshotResponse(
            ApiVersions.V1,
            tileRow,
            tileColumn,
            pixels,
            timeProvider.GetUtcNow());
    }

    public static async Task<IResult> GetAccountAsync(
        IAccountIdentityAccessor identityAccessor,
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
        var entitlement = await entitlementService.GetAsync(account.Id, cancellationToken);
        var remainingCooldown = await placementStore.GetRemainingCooldownAsync(
            account.Id,
            cancellationToken);
        var now = timeProvider.GetUtcNow();
        var (cooldownSeconds, paintBoost) = await ResolveCooldownAsync(
            services,
            account.Id,
            entitlement.Tier,
            now,
            cancellationToken);
        string? referralCode = null;
        var referralService = services.GetService<IReferralService>();
        if (policy.CommunityStandardsAccepted && referralService is not null)
        {
            referralCode = await referralService.GetOrCreateCodeAsync(
                account.Id,
                cancellationToken);
        }

        return Results.Ok(new AccountStateResponse(
            entitlement.Tier,
            !policy.IsBanned && policy.CommunityStandardsAccepted,
            policy.CommunityStandardsAccepted,
            new CooldownState(
                remainingCooldown > TimeSpan.Zero
                    ? now.Add(remainingCooldown)
                    : null,
                cooldownSeconds),
            referralCode,
            paintBoost,
            policy.IsBanned));
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

        try
        {
            await policyService.AcceptCommunityStandardsAsync(
                account.Id,
                CurrentCommunityStandardsVersion,
                cancellationToken);
        }
        catch (AccountDeletedException)
        {
            return Results.Json(
                new ApiError(ApiErrorCodes.AccountDeleted, "This account has been deleted."),
                statusCode: StatusCodes.Status410Gone);
        }
        return Results.NoContent();
    }

    public static async Task<IResult> ClaimReferralAsync(
        ClaimReferralRequest? request,
        IAccountIdentityAccessor identityAccessor,
        IServiceProvider services,
        CancellationToken cancellationToken)
    {
        var account = await identityAccessor.GetCurrentAsync(cancellationToken);
        if (account is null)
        {
            return AuthenticationRequired();
        }

        var referralService = services.GetService<IReferralService>();
        if (referralService is null)
        {
            return ServiceUnavailable("Invites are not configured.");
        }

        var outcome = await referralService.ClaimAsync(
            account.Id,
            request?.Code,
            cancellationToken);
        return outcome switch
        {
            ReferralClaimOutcome.Granted => Results.NoContent(),
            ReferralClaimOutcome.InvalidCode => Results.Json(
                new ApiError(
                    ApiErrorCodes.InvalidReferralCode,
                    "That invite code is not valid."),
                statusCode: StatusCodes.Status400BadRequest),
            ReferralClaimOutcome.AlreadyClaimed => Results.Json(
                new ApiError(
                    ApiErrorCodes.ReferralAlreadyClaimed,
                    "This account already used an invite."),
                statusCode: StatusCodes.Status409Conflict),
            ReferralClaimOutcome.OwnCode => Results.Json(
                new ApiError(
                    ApiErrorCodes.ReferralOwnCode,
                    "You cannot use your own invite code."),
                statusCode: StatusCodes.Status400BadRequest),
            ReferralClaimOutcome.LimitReached => Results.Json(
                new ApiError(
                    ApiErrorCodes.ReferralLimitReached,
                    "This invite has reached its daily limit. Try again tomorrow."),
                statusCode: StatusCodes.Status429TooManyRequests),
            ReferralClaimOutcome.CommunityStandardsRequired => Results.Json(
                new ApiError(
                    ApiErrorCodes.CommunityStandardsRequired,
                    "Accept the current community standards before using an invite."),
                statusCode: StatusCodes.Status403Forbidden),
            ReferralClaimOutcome.AccountDeleted => Results.Json(
                new ApiError(ApiErrorCodes.AccountDeleted, "This account has been deleted."),
                statusCode: StatusCodes.Status410Gone),
            _ => ServiceUnavailable("Invites are not configured.")
        };
    }

    public static async Task<IResult> DeleteAccountAsync(
        IAccountIdentityAccessor identityAccessor,
        IServiceProvider services,
        CancellationToken cancellationToken)
    {
        var account = await identityAccessor.GetCurrentAsync(cancellationToken);
        if (account is null)
        {
            return AuthenticationRequired();
        }

        var deletionService = services.GetService<IAccountDeletionService>();
        if (deletionService is null)
        {
            return ServiceUnavailable("Account deletion is not configured.");
        }

        await deletionService.DeleteAsync(account.Id, cancellationToken);
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
        var accountOperationGuard = services.GetService<IAccountOperationGuard>();
        var safetyService = services.GetService<IPlatformSafetyService>();
        var realtimePublisher = services.GetService<IRealtimeEventPublisher>();
        if (policyService is null
            || entitlementService is null
            || placementStore is null
            || accountOperationGuard is null
            || safetyService is null
            || realtimePublisher is null)
        {
            return ServiceUnavailable();
        }

        var safety = await safetyService.GetStateAsync(cancellationToken);
        if (safety.PlacementsFrozen)
        {
            return Results.Json(
                new ApiError(
                    ApiErrorCodes.BoardReadOnly,
                    "Pixel placement is temporarily paused."),
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        await using var accountOperation = await accountOperationGuard.AcquireIfActiveAsync(
            [account.Id],
            cancellationToken);
        if (accountOperation is null)
        {
            return Results.Json(
                new ApiError(ApiErrorCodes.AccountDeleted, "This account has been deleted."),
                statusCode: StatusCodes.Status410Gone);
        }

        var policy = await policyService.GetAsync(
            account.Id,
            CurrentCommunityStandardsVersion,
            cancellationToken);
        if (policy.IsBanned)
        {
            return Results.Json(
                new ApiError(ApiErrorCodes.AccountBanned, "This account is banned from placing pixels."),
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

        var rateLimiter = services.GetService<IPlacementRateLimiter>();
        if (rateLimiter is not null)
        {
            var clientIp = ClientNetwork.RateLimitBucket(
                services.GetService<IHttpContextAccessor>()?.HttpContext?.Connection.RemoteIpAddress);
            if (!await rateLimiter.TryAcquireAsync(account.Id, clientIp, cancellationToken))
            {
                return Results.Json(
                    new ApiError(
                        ApiErrorCodes.PlacementRateLimited,
                        "Too many pixels from this network. Wait a minute and try again."),
                    statusCode: StatusCodes.Status429TooManyRequests);
            }
        }

        var entitlement = await entitlementService.GetAsync(account.Id, cancellationToken);
        var (cooldownSeconds, _) = await ResolveCooldownAsync(
            services,
            account.Id,
            entitlement.Tier,
            timeProvider.GetUtcNow(),
            cancellationToken);
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

        if (!result.IsDuplicate)
        {
            await realtimePublisher.PublishAcceptedAsync(
                result.StreamEntryId,
                new AcceptedPixelEventData(
                    result.PlacementId!.Value,
                    result.Pixel!));
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
                    "This account is banned from submitting reports."),
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
            if (!await reportStore.SaveAsync(command, evidence, cancellationToken))
            {
                await rateLimiter.ReleaseAsync(command, CancellationToken.None);
                return Results.Json(
                    new ApiError(
                        ApiErrorCodes.AccountDeleted,
                        "This account has been deleted."),
                    statusCode: StatusCodes.Status410Gone);
            }
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

    private static async ValueTask<(int Seconds, PaintBoostResponse? Boost)> ResolveCooldownAsync(
        IServiceProvider services,
        AccountId accountId,
        AccountTier tier,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var boostService = services.GetService<IPaintBoostService>();
        var boost = boostService is null
            ? null
            : await boostService.GetAsync(accountId, cancellationToken);
        return (
            PlacementCooldown.Resolve(tier, boost, now),
            boost is { } active
                ? new PaintBoostResponse(active.CooldownSeconds, active.ExpiresAt)
                : null);
    }

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
