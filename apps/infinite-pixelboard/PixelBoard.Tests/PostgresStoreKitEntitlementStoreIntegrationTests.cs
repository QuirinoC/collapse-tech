using Npgsql;
using PixelBoard.Application;
using PixelBoard.Contracts.V1;
using PixelBoard.Infrastructure.Postgres;
using PixelBoard.Infrastructure.StoreKit;

namespace PixelBoard.Tests;

public sealed class PostgresStoreKitEntitlementStoreIntegrationTests
{
    [PostgresFact]
    [Trait("Category", "Integration")]
    public async Task StoreKitTransactionsAreAccountBoundAndAppliedInSignedOrder()
    {
        var connectionString = Environment.GetEnvironmentVariable(
            "PIXELBOARD_TEST_POSTGRES")!;
        await using var dataSource = NpgsqlDataSource.Create(connectionString);
        var store = new PostgresStoreKitEntitlementStore(dataSource);
        var entitlementService =
            (IEntitlementService)new PostgresAccountStateService(dataSource);
        var account = new AccountId($"storekit-{Guid.NewGuid():N}");
        var otherAccount = new AccountId($"storekit-{Guid.NewGuid():N}");
        var token = AssertToken(await store.GetOrCreateAccountTokenAsync(account));
        var sameToken = AssertToken(await store.GetOrCreateAccountTokenAsync(account));
        var otherToken = AssertToken(await store.GetOrCreateAccountTokenAsync(otherAccount));
        var originalTransactionId = $"original-{Guid.NewGuid():N}";
        var now = DateTimeOffset.UtcNow;

        Assert.Equal(token, sameToken);
        Assert.True(await store.ApplyAsync(
            account,
            Transaction(
                originalTransactionId,
                token,
                now,
                now.AddMonths(1))));
        Assert.Equal(AccountTier.Pro, (await entitlementService.GetAsync(account)).Tier);

        Assert.False(await store.ApplyAsync(
            otherAccount,
            Transaction(
                originalTransactionId,
                otherToken,
                now.AddMinutes(1),
                now.AddMonths(1))));
        Assert.Equal(AccountTier.Free, (await entitlementService.GetAsync(otherAccount)).Tier);

        Assert.True(await store.ApplyAsync(
            account,
            Transaction(
                originalTransactionId,
                token,
                now.AddMinutes(2),
                now.AddMonths(1),
                now.AddMinutes(2))));
        Assert.Equal(AccountTier.Free, (await entitlementService.GetAsync(account)).Tier);

        Assert.True(await store.ApplyAsync(
            account,
            Transaction(
                originalTransactionId,
                token,
                now.AddMinutes(1),
                now.AddMonths(2))));
        Assert.Equal(AccountTier.Free, (await entitlementService.GetAsync(account)).Tier);

        await CleanupAsync(dataSource, account, otherAccount);
    }

    [PostgresFact]
    [Trait("Category", "Integration")]
    public async Task LaterStateForRecordedTransactionRevokesEntitlement()
    {
        var connectionString = Environment.GetEnvironmentVariable(
            "PIXELBOARD_TEST_POSTGRES")!;
        await using var dataSource = NpgsqlDataSource.Create(connectionString);
        var store = new PostgresStoreKitEntitlementStore(dataSource);
        var entitlementService =
            (IEntitlementService)new PostgresAccountStateService(dataSource);
        var account = new AccountId($"storekit-{Guid.NewGuid():N}");
        var token = AssertToken(await store.GetOrCreateAccountTokenAsync(account));
        var originalTransactionId = $"original-{Guid.NewGuid():N}";
        var transactionId = $"transaction-{Guid.NewGuid():N}";
        var now = DateTimeOffset.UtcNow;

        Assert.True(await store.ApplyAsync(
            account,
            Transaction(
                originalTransactionId,
                token,
                now,
                now.AddMonths(1),
                transactionId: transactionId)));
        Assert.Equal(AccountTier.Pro, (await entitlementService.GetAsync(account)).Tier);

        Assert.True(await store.ApplyNotificationAsync(
            Transaction(
                originalTransactionId,
                token,
                now.AddMinutes(1),
                now.AddMonths(1),
                now.AddMinutes(1),
                transactionId)));
        Assert.Equal(AccountTier.Free, (await entitlementService.GetAsync(account)).Tier);

        await CleanupAsync(dataSource, account);
    }

    private static AppAccountToken AssertToken(AppAccountToken? token)
    {
        Assert.True(token.HasValue);
        return token.Value;
    }

    private static VerifiedStoreKitTransaction Transaction(
        string originalTransactionId,
        AppAccountToken token,
        DateTimeOffset signedAt,
        DateTimeOffset expiresAt,
        DateTimeOffset? revokedAt = null,
        string? transactionId = null) =>
        new(
            transactionId ?? $"transaction-{Guid.NewGuid():N}",
            originalTransactionId,
            "pixelboard.pro.monthly",
            token,
            "Sandbox",
            signedAt,
            expiresAt,
            revokedAt);

    private static async Task CleanupAsync(
        NpgsqlDataSource dataSource,
        params AccountId[] accounts)
    {
        var accountIds = accounts.Select(account => account.Value).ToArray();
        string[] tables =
        [
            "storekit_transactions",
            "storekit_subscription_owners",
            "entitlements",
            "storekit_account_tokens"
        ];
        foreach (var table in tables)
        {
            await using var command = dataSource.CreateCommand(
                $"DELETE FROM pixelboard.{table} WHERE firebase_uid = ANY($1);");
            command.Parameters.AddWithValue(accountIds);
            await command.ExecuteNonQueryAsync();
        }
    }
}
