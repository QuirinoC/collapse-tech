using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using PixelBoard.Api.V1;
using PixelBoard.Application;
using PixelBoard.Contracts.V1;
using PixelBoard.Infrastructure.Ledger;

namespace PixelBoard.Tests;

public sealed class BoardApiPlacementTests
{
    [Theory]
    [InlineData(AccountTier.Free, 10)]
    [InlineData(AccountTier.Pro, 1)]
    public async Task AcceptedPlacementUsesServerEntitlementCooldown(
        AccountTier tier,
        int expectedCooldownSeconds)
    {
        var accountId = new AccountId("firebase-test-user");
        var placementStore = new RecordingPlacementStore();
        await using var services = CreateServices(
            new StubPolicyService(new AccountPolicyState(false, true)),
            new StubEntitlementService(tier),
            placementStore);

        var result = await BoardApi.PlaceAsync(
            ValidRequest(),
            new StubIdentityAccessor(accountId),
            new PlacementValidator(),
            TimeProvider.System,
            services,
            CancellationToken.None);
        var response = await ExecuteAsync<PlacementResult>(result, services);

        Assert.Equal(StatusCodes.Status200OK, response.StatusCode);
        Assert.Equal(PlacementOutcome.Accepted, response.Body.Outcome);
        Assert.Equal(expectedCooldownSeconds, response.Body.Cooldown.CooldownSeconds);
        Assert.Equal(TimeSpan.FromSeconds(expectedCooldownSeconds), placementStore.Cooldown);
    }

    [Theory]
    [InlineData(true, true, ApiErrorCodes.AccountBanned)]
    [InlineData(false, false, ApiErrorCodes.CommunityStandardsRequired)]
    public async Task PolicyRejectionDoesNotCallPlacementStore(
        bool isBanned,
        bool standardsAccepted,
        string expectedErrorCode)
    {
        var placementStore = new RecordingPlacementStore();
        await using var services = CreateServices(
            new StubPolicyService(new AccountPolicyState(isBanned, standardsAccepted)),
            new StubEntitlementService(AccountTier.Free),
            placementStore);

        var result = await BoardApi.PlaceAsync(
            ValidRequest(),
            new StubIdentityAccessor(new AccountId("firebase-test-user")),
            new PlacementValidator(),
            TimeProvider.System,
            services,
            CancellationToken.None);
        var response = await ExecuteAsync<ApiError>(result, services);

        Assert.Equal(StatusCodes.Status403Forbidden, response.StatusCode);
        Assert.Equal(expectedErrorCode, response.Body.Code);
        Assert.Equal(0, placementStore.CallCount);
    }

    [Fact]
    public async Task MismatchedIdempotencyReuseReturnsConflict()
    {
        var placementStore = new RecordingPlacementStore
        {
            ResultFactory = _ => new AtomicPlacementResult(
                false,
                string.Empty,
                null,
                false,
                true,
                null,
                null,
                null,
                TimeSpan.Zero)
        };
        await using var services = CreateServices(
            new StubPolicyService(new AccountPolicyState(false, true)),
            new StubEntitlementService(AccountTier.Free),
            placementStore);

        var result = await BoardApi.PlaceAsync(
            ValidRequest(),
            new StubIdentityAccessor(new AccountId("firebase-test-user")),
            new PlacementValidator(),
            TimeProvider.System,
            services,
            CancellationToken.None);
        var response = await ExecuteAsync<PlacementResult>(result, services);

        Assert.Equal(StatusCodes.Status409Conflict, response.StatusCode);
        Assert.Equal(ApiErrorCodes.InvalidIdempotencyKey, response.Body.Error?.Code);
    }

    private static PlacementRequest ValidRequest() =>
        new(10, 20, "#abcdef", "request-1", new ClientContext("web", "1.0"));

    private static ServiceProvider CreateServices(
        IAccountPolicyService policy,
        IEntitlementService entitlement,
        IAtomicPlacementStore placementStore) =>
        new ServiceCollection()
            .AddLogging()
            .AddOptions()
            .AddSingleton(policy)
            .AddSingleton(entitlement)
            .AddSingleton(placementStore)
            .BuildServiceProvider();

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

    private sealed class StubIdentityAccessor(AccountId accountId) : IAccountIdentityAccessor
    {
        public ValueTask<AuthenticatedAccount?> GetCurrentAsync(
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult<AuthenticatedAccount?>(
                new AuthenticatedAccount(accountId, false, false));
    }

    private sealed class StubPolicyService(AccountPolicyState state) : IAccountPolicyService
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

    private sealed class StubEntitlementService(AccountTier tier) : IEntitlementService
    {
        public ValueTask<EntitlementState> GetAsync(
            AccountId accountId,
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult(new EntitlementState(tier, null));
    }

    private sealed class RecordingPlacementStore : IAtomicPlacementStore
    {
        public int CallCount { get; private set; }

        public TimeSpan Cooldown { get; private set; }

        public Func<PlacementLedgerEvent, AtomicPlacementResult>? ResultFactory { get; init; }

        public ValueTask<AtomicPlacementResult> PlaceAsync(
            PlacementLedgerEvent placement,
            TimeSpan cooldown,
            CancellationToken cancellationToken = default)
        {
            CallCount++;
            Cooldown = cooldown;
            return ValueTask.FromResult(
                ResultFactory?.Invoke(placement)
                ?? new AtomicPlacementResult(
                    true,
                    "1-0",
                    placement.PlacementId,
                    false,
                    false,
                    null,
                    "#FFFFFF",
                    new PixelState(
                        placement.Row,
                        placement.Column,
                        placement.Color,
                        placement.PlacedAt),
                    cooldown));
        }
    }
}
