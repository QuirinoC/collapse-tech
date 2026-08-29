using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using PixelBoard.Api.V1;
using PixelBoard.Application;
using PixelBoard.Contracts.V1;
using PixelBoard.Infrastructure.Ledger;

namespace PixelBoard.Tests;

public sealed class BoardApiReferralTests
{
    [Fact]
    public async Task GrantedClaimReturnsNoContent()
    {
        await using var services = CreateServices(ReferralClaimOutcome.Granted);
        var result = await BoardApi.ClaimReferralAsync(
            new ClaimReferralRequest("ABCD2345"),
            new IdentityAccessor(),
            services,
            CancellationToken.None);

        Assert.Equal(StatusCodes.Status204NoContent, await StatusOf(result, services));
    }

    [Theory]
    [InlineData(ReferralClaimOutcome.InvalidCode, 400, ApiErrorCodes.InvalidReferralCode)]
    [InlineData(ReferralClaimOutcome.AlreadyClaimed, 409, ApiErrorCodes.ReferralAlreadyClaimed)]
    [InlineData(ReferralClaimOutcome.OwnCode, 400, ApiErrorCodes.ReferralOwnCode)]
    [InlineData(ReferralClaimOutcome.LimitReached, 429, ApiErrorCodes.ReferralLimitReached)]
    [InlineData(ReferralClaimOutcome.CommunityStandardsRequired, 403, ApiErrorCodes.CommunityStandardsRequired)]
    [InlineData(ReferralClaimOutcome.AccountDeleted, 410, ApiErrorCodes.AccountDeleted)]
    public async Task ClaimFailuresUseStructuredErrors(
        ReferralClaimOutcome outcome,
        int status,
        string code)
    {
        await using var services = CreateServices(outcome);
        var result = await BoardApi.ClaimReferralAsync(
            new ClaimReferralRequest("ABCD2345"),
            new IdentityAccessor(),
            services,
            CancellationToken.None);
        var response = await ExecuteAsync<ApiError>(result, services);

        Assert.Equal(status, response.StatusCode);
        Assert.Equal(code, response.Body.Code);
    }

    [Fact]
    public async Task AccountIncludesInviteCodeAndBoostedCooldown()
    {
        var now = new DateTimeOffset(2026, 8, 28, 18, 0, 0, TimeSpan.Zero);
        await using var services = new ServiceCollection()
            .AddLogging()
            .AddSingleton<IAccountPolicyService>(
                new PolicyService(new AccountPolicyState(false, true)))
            .AddSingleton<IEntitlementService>(
                new EntitlementService(new EntitlementState(AccountTier.Free, null)))
            .AddSingleton<IAtomicPlacementStore>(new PlacementStore())
            .AddSingleton<IReferralService>(new ReferralService(ReferralClaimOutcome.Granted))
            .AddSingleton<IPaintBoostService>(
                new BoostService(new PaintBoostState(3, now.AddHours(4))))
            .BuildServiceProvider();

        var result = await BoardApi.GetAccountAsync(
            new IdentityAccessor(),
            new FixedTimeProvider(now),
            services,
            CancellationToken.None);
        var response = await ExecuteAsync<AccountStateResponse>(result, services);

        Assert.Equal(StatusCodes.Status200OK, response.StatusCode);
        Assert.Equal("ABCD2345", response.Body.ReferralCode);
        Assert.Equal(3, response.Body.Cooldown.CooldownSeconds);
        Assert.Equal(3, response.Body.PaintBoost?.CooldownSeconds);
    }

    private static ServiceProvider CreateServices(ReferralClaimOutcome outcome) =>
        new ServiceCollection()
            .AddLogging()
            .AddSingleton<IReferralService>(new ReferralService(outcome))
            .BuildServiceProvider();

    private static async Task<int> StatusOf(IResult result, IServiceProvider services)
    {
        var context = new DefaultHttpContext { RequestServices = services };
        await result.ExecuteAsync(context);
        return context.Response.StatusCode;
    }

    private static async Task<(int StatusCode, T Body)> ExecuteAsync<T>(
        IResult result,
        IServiceProvider services)
    {
        var context = new DefaultHttpContext
        {
            RequestServices = services,
            Response = { Body = new MemoryStream() }
        };
        await result.ExecuteAsync(context);
        context.Response.Body.Position = 0;
        var body = await JsonSerializer.DeserializeAsync<T>(
            context.Response.Body,
            new JsonSerializerOptions(JsonSerializerDefaults.Web));
        return (context.Response.StatusCode, Assert.IsType<T>(body));
    }

    private sealed class IdentityAccessor : IAccountIdentityAccessor
    {
        public ValueTask<AuthenticatedAccount?> GetCurrentAsync(
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult<AuthenticatedAccount?>(
                new AuthenticatedAccount(new AccountId("account"), false, true));
    }

    private sealed class PolicyService(AccountPolicyState state) : IAccountPolicyService
    {
        public ValueTask<AccountPolicyState> GetAsync(
            AccountId accountId,
            string requiredCommunityStandardsVersion,
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult(state);

        public ValueTask AcceptCommunityStandardsAsync(
            AccountId accountId,
            string version,
            CancellationToken cancellationToken = default) =>
            ValueTask.CompletedTask;
    }

    private sealed class EntitlementService(EntitlementState state) : IEntitlementService
    {
        public ValueTask<EntitlementState> GetAsync(
            AccountId accountId,
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult(state);
    }

    private sealed class PlacementStore : IAtomicPlacementStore
    {
        public ValueTask<TimeSpan> GetRemainingCooldownAsync(
            AccountId accountId,
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult(TimeSpan.Zero);

        public ValueTask<AtomicPlacementResult> PlaceAsync(
            PlacementLedgerEvent placement,
            TimeSpan cooldown,
            CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();
    }

    private sealed class ReferralService(ReferralClaimOutcome outcome) : IReferralService
    {
        public ValueTask<string?> GetOrCreateCodeAsync(
            AccountId accountId,
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult<string?>("ABCD2345");

        public ValueTask<ReferralClaimOutcome> ClaimAsync(
            AccountId refereeAccountId,
            string? code,
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult(outcome);
    }

    private sealed class BoostService(PaintBoostState? state) : IPaintBoostService
    {
        public ValueTask<PaintBoostState?> GetAsync(
            AccountId accountId,
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult(state);
    }

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }
}
