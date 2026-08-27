using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using PixelBoard.Api;
using PixelBoard.Application;
using PixelBoard.Contracts.V1;

namespace PixelBoard.Tests;

public sealed class AdvertisingDecisionApiTests
{
    [Fact]
    public async Task AnonymousDecisionUsesRuntimeSafetyPolicy()
    {
        var policy = new RecordingPolicy(new AdvertisingDecision(false, "board"));
        await using var services = new ServiceCollection()
            .AddLogging()
            .BuildServiceProvider();

        var result = await AdvertisingMetadataApi.DecideAsync(
            new AnonymousIdentity(),
            policy,
            services,
            CancellationToken.None);
        var response = await ExecuteAsync<AdvertisingDecision>(result, services);

        Assert.Equal(StatusCodes.Status200OK, response.StatusCode);
        Assert.False(response.Body.ShowAd);
        Assert.Null(policy.AccountId);
        Assert.Equal(AccountTier.Free, policy.Tier);
    }

    [Fact]
    public async Task AuthenticatedDecisionUsesCurrentEntitlement()
    {
        var accountId = new AccountId("account");
        var policy = new RecordingPolicy(new AdvertisingDecision(false, "board"));
        await using var services = new ServiceCollection()
            .AddLogging()
            .AddSingleton<IEntitlementService>(
                new EntitlementService(new EntitlementState(AccountTier.Pro, null)))
            .BuildServiceProvider();

        var result = await AdvertisingMetadataApi.DecideAsync(
            new AuthenticatedIdentity(accountId),
            policy,
            services,
            CancellationToken.None);
        var response = await ExecuteAsync<AdvertisingDecision>(result, services);

        Assert.Equal(StatusCodes.Status200OK, response.StatusCode);
        Assert.False(response.Body.ShowAd);
        Assert.Equal(accountId, policy.AccountId);
        Assert.Equal(AccountTier.Pro, policy.Tier);
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

    private sealed class AnonymousIdentity : IAccountIdentityAccessor
    {
        public ValueTask<AuthenticatedAccount?> GetCurrentAsync(
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult<AuthenticatedAccount?>(null);
    }

    private sealed class AuthenticatedIdentity(AccountId accountId) : IAccountIdentityAccessor
    {
        public ValueTask<AuthenticatedAccount?> GetCurrentAsync(
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult<AuthenticatedAccount?>(
                new AuthenticatedAccount(accountId, false, true));
    }

    private sealed class EntitlementService(EntitlementState state) : IEntitlementService
    {
        public ValueTask<EntitlementState> GetAsync(
            AccountId accountId,
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult(state);
    }

    private sealed class RecordingPolicy(AdvertisingDecision decision) : IAdvertisingPolicy
    {
        public AccountId? AccountId { get; private set; }
        public AccountTier Tier { get; private set; }

        public ValueTask<AdvertisingDecision> DecideAsync(
            AccountId? accountId,
            AccountTier tier,
            CancellationToken cancellationToken = default)
        {
            AccountId = accountId;
            Tier = tier;
            return ValueTask.FromResult(decision);
        }
    }
}
