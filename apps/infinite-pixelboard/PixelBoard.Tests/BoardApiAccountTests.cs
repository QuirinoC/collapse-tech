using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using PixelBoard.Api.V1;
using PixelBoard.Application;
using PixelBoard.Contracts.V1;
using PixelBoard.Infrastructure.Ledger;

namespace PixelBoard.Tests;

public sealed class BoardApiAccountTests
{
    [Fact]
    public async Task AccountReturnsAuthoritativeRemainingCooldown()
    {
        var now = new DateTimeOffset(2026, 8, 27, 6, 0, 0, TimeSpan.Zero);
        var placementStore = new PlacementStore(TimeSpan.FromSeconds(7));
        await using var services = new ServiceCollection()
            .AddLogging()
            .AddSingleton<IAccountPolicyService>(
                new PolicyService(new AccountPolicyState(false, true)))
            .AddSingleton<IEntitlementService>(
                new EntitlementService(new EntitlementState(AccountTier.Free, null)))
            .AddSingleton<IAtomicPlacementStore>(placementStore)
            .BuildServiceProvider();

        var result = await BoardApi.GetAccountAsync(
            new IdentityAccessor(),
            new FixedTimeProvider(now),
            services,
            CancellationToken.None);
        var response = await ExecuteAsync<AccountStateResponse>(result, services);

        Assert.Equal(StatusCodes.Status200OK, response.StatusCode);
        Assert.Equal(now.AddSeconds(7), response.Body.Cooldown.NextPlacementAt);
        Assert.Equal(PlacementCooldown.FreeSeconds, response.Body.Cooldown.CooldownSeconds);
        Assert.False(response.Body.IsBanned);
    }

    [Fact]
    public async Task BannedAccountIsFlaggedAndCannotPlace()
    {
        var now = new DateTimeOffset(2026, 8, 27, 6, 0, 0, TimeSpan.Zero);
        await using var services = new ServiceCollection()
            .AddLogging()
            .AddSingleton<IAccountPolicyService>(
                new PolicyService(new AccountPolicyState(true, true)))
            .AddSingleton<IEntitlementService>(
                new EntitlementService(new EntitlementState(AccountTier.Free, null)))
            .AddSingleton<IAtomicPlacementStore>(new PlacementStore(TimeSpan.Zero))
            .BuildServiceProvider();

        var result = await BoardApi.GetAccountAsync(
            new IdentityAccessor(),
            new FixedTimeProvider(now),
            services,
            CancellationToken.None);
        var response = await ExecuteAsync<AccountStateResponse>(result, services);

        Assert.Equal(StatusCodes.Status200OK, response.StatusCode);
        Assert.True(response.Body.IsBanned);
        Assert.False(response.Body.CanPlace);
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

    private sealed class PlacementStore(TimeSpan remaining) : IAtomicPlacementStore
    {
        public ValueTask<TimeSpan> GetRemainingCooldownAsync(
            AccountId accountId,
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult(remaining);

        public ValueTask<AtomicPlacementResult> PlaceAsync(
            PlacementLedgerEvent placement,
            TimeSpan cooldown,
            CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();
    }

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }
}
