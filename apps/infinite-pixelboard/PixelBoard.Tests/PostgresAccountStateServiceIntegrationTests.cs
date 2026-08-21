using Npgsql;
using PixelBoard.Application;
using PixelBoard.Contracts.V1;
using PixelBoard.Infrastructure.Postgres;

namespace PixelBoard.Tests;

public sealed class PostgresAccountStateServiceIntegrationTests
{
    private const string CurrentStandardsVersion = "2026-08-21";

    [PostgresFact]
    [Trait("Category", "Integration")]
    public async Task AccountPolicyAndEntitlementRespectCurrentServerState()
    {
        var connectionString = Environment.GetEnvironmentVariable(
            "PIXELBOARD_TEST_POSTGRES")!;
        await using var dataSource = NpgsqlDataSource.Create(connectionString);
        var service = new PostgresAccountStateService(dataSource);
        var policyService = (IAccountPolicyService)service;
        var entitlementService = (IEntitlementService)service;
        var accountId = new AccountId($"firebase-policy-{Guid.NewGuid():N}");

        var initial = await policyService.GetAsync(accountId, CurrentStandardsVersion);
        Assert.False(initial.IsBanned);
        Assert.False(initial.CommunityStandardsAccepted);
        Assert.Equal(AccountTier.Free, (await entitlementService.GetAsync(accountId)).Tier);

        await policyService.AcceptCommunityStandardsAsync(accountId, "older-version");
        Assert.False(
            (await policyService.GetAsync(accountId, CurrentStandardsVersion))
            .CommunityStandardsAccepted);

        await policyService.AcceptCommunityStandardsAsync(accountId, CurrentStandardsVersion);
        Assert.True(
            (await policyService.GetAsync(accountId, CurrentStandardsVersion))
            .CommunityStandardsAccepted);

        await ExecuteAsync(
            dataSource,
            """
            INSERT INTO pixelboard.account_bans (
                ban_id, firebase_uid, reason, starts_at, created_by, created_at)
            VALUES (gen_random_uuid(), $1, 'future', now() + interval '1 hour', 'test', now());
            """,
            accountId.Value);
        Assert.False(
            (await policyService.GetAsync(accountId, CurrentStandardsVersion)).IsBanned);

        await ExecuteAsync(
            dataSource,
            """
            UPDATE pixelboard.account_bans
            SET starts_at = now() - interval '1 minute'
            WHERE firebase_uid = $1;
            """,
            accountId.Value);
        Assert.True(
            (await policyService.GetAsync(accountId, CurrentStandardsVersion)).IsBanned);

        await ExecuteAsync(
            dataSource,
            """
            UPDATE pixelboard.account_bans
            SET revoked_at = now()
            WHERE firebase_uid = $1;
            """,
            accountId.Value);
        await ExecuteAsync(
            dataSource,
            """
            INSERT INTO pixelboard.entitlements (
                firebase_uid, tier, source, expires_at, updated_at)
            VALUES ($1, 'pro', 'test', now() + interval '1 hour', now());
            """,
            accountId.Value);
        Assert.False(
            (await policyService.GetAsync(accountId, CurrentStandardsVersion)).IsBanned);
        Assert.Equal(AccountTier.Pro, (await entitlementService.GetAsync(accountId)).Tier);

        await ExecuteAsync(
            dataSource,
            """
            UPDATE pixelboard.entitlements
            SET expires_at = now() - interval '1 minute'
            WHERE firebase_uid = $1;
            """,
            accountId.Value);
        Assert.Equal(AccountTier.Free, (await entitlementService.GetAsync(accountId)).Tier);

        await ExecuteAsync(
            dataSource,
            "DELETE FROM pixelboard.entitlements WHERE firebase_uid = $1;",
            accountId.Value);
        await ExecuteAsync(
            dataSource,
            "DELETE FROM pixelboard.account_bans WHERE firebase_uid = $1;",
            accountId.Value);
        await ExecuteAsync(
            dataSource,
            "DELETE FROM pixelboard.accounts WHERE firebase_uid = $1;",
            accountId.Value);
    }

    private static async Task ExecuteAsync(
        NpgsqlDataSource dataSource,
        string sql,
        string accountId)
    {
        await using var command = dataSource.CreateCommand(sql);
        command.Parameters.AddWithValue(accountId);
        await command.ExecuteNonQueryAsync();
    }
}
