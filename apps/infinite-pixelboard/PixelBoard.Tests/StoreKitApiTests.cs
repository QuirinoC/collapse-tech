using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using PixelBoard.Api.V1;
using PixelBoard.Application;
using PixelBoard.Contracts.V1;
using PixelBoard.Infrastructure.StoreKit;

namespace PixelBoard.Tests;

public sealed class StoreKitApiTests
{
    [Fact]
    public async Task LinkedSubscriptionIsRejectedWithSupportOnlyTransferInstructions()
    {
        var transaction = new VerifiedStoreKitTransaction(
            "transaction-1",
            "original-1",
            "pixelboard.pro.monthly",
            AppAccountToken.New(),
            "Production",
            DateTimeOffset.UtcNow,
            DateTimeOffset.UtcNow.AddMonths(1),
            null);
        await using var services = new ServiceCollection()
            .AddLogging()
            .AddSingleton<IStoreKitTransactionVerifier>(
                new Verifier(new StoreKitVerificationResult(transaction, null)))
            .AddSingleton<IStoreKitEntitlementStore>(
                new Store(StoreKitApplyOutcome.LinkedToAnotherAccount))
            .AddSingleton<IEntitlementService>(
                new Entitlements(new EntitlementState(AccountTier.Free, null)))
            .BuildServiceProvider();

        var result = await StoreKitApi.VerifyTransactionAsync(
            new VerifyStoreKitTransactionRequest("signed"),
            new IdentityAccessor(),
            services,
            CancellationToken.None);
        var response = await ExecuteAsync<ApiError>(result, services);

        Assert.Equal(StatusCodes.Status403Forbidden, response.StatusCode);
        Assert.Equal(ApiErrorCodes.StoreKitAccountMismatch, response.Body.Code);
        Assert.Contains("was not transferred", response.Body.Message);
        Assert.Contains("remove Pro access", response.Body.Message);
        Assert.Contains("hello@collapsetechnologies.com", response.Body.Message);
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
                new AuthenticatedAccount(new AccountId("current"), false, true));
    }

    private sealed class Verifier(StoreKitVerificationResult result)
        : IStoreKitTransactionVerifier
    {
        public StoreKitVerificationResult Verify(string signedTransaction) => result;

        public StoreKitNotificationVerificationResult VerifyNotification(
            string signedPayload) =>
            throw new NotSupportedException();
    }

    private sealed class Store(StoreKitApplyOutcome outcome)
        : IStoreKitEntitlementStore
    {
        public ValueTask<AppAccountToken?> GetOrCreateAccountTokenAsync(
            AccountId accountId,
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult<AppAccountToken?>(AppAccountToken.New());

        public ValueTask<StoreKitApplyOutcome> ApplyAsync(
            AccountId accountId,
            VerifiedStoreKitTransaction transaction,
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult(outcome);

        public ValueTask<bool> ApplyNotificationAsync(
            VerifiedStoreKitTransaction transaction,
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult(false);
    }

    private sealed class Entitlements(EntitlementState state) : IEntitlementService
    {
        public ValueTask<EntitlementState> GetAsync(
            AccountId accountId,
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult(state);
    }
}
