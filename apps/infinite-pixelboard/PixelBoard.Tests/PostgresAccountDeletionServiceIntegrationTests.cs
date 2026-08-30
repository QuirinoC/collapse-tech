using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Npgsql;
using PixelBoard.Application;
using PixelBoard.Configuration;
using PixelBoard.Contracts.V1;
using PixelBoard.Infrastructure.Moderation;
using PixelBoard.Infrastructure.Ledger;
using PixelBoard.Infrastructure.Postgres;
using PixelBoard.Infrastructure.StoreKit;
using StackExchange.Redis;

namespace PixelBoard.Tests;

public sealed class PostgresAccountDeletionServiceIntegrationTests
{
    [PostgresRedisFact]
    [Trait("Category", "Integration")]
    public async Task DeletionAnonymizesRetainedEvidenceAndRemovesAccountState()
    {
        var postgresConnection = Environment.GetEnvironmentVariable(
            "PIXELBOARD_TEST_POSTGRES")!;
        var redisConnection = Environment.GetEnvironmentVariable(
            "PIXELBOARD_TEST_REDIS")!;
        await using var dataSource = NpgsqlDataSource.Create(postgresConnection);
        await using var redis = await ConnectionMultiplexer.ConnectAsync(redisConnection);
        var instanceName = $"PixelBoardDeleteTest_{Guid.NewGuid():N}_";
        var service = new PostgresAccountDeletionService(
            dataSource,
            redis,
            Options.Create(new RedisOptions
            {
                ConnectionString = redisConnection,
                InstanceName = instanceName
            }));
        var accountId = new AccountId($"firebase-delete-{Guid.NewGuid():N}");
        var storeKit = new PostgresStoreKitEntitlementStore(dataSource);
        var storeKitToken = await storeKit.GetOrCreateAccountTokenAsync(accountId);
        Assert.True(storeKitToken.HasValue);
        var reportId = Guid.NewGuid();
        var pendingPlacementId = PlacementId.New();
        var snapshot = $$"""{"recentAttributedPlacements":[{"firebaseUid":"{{accountId.Value}}"}]}""";

        await ExecuteAsync(
            dataSource,
            """
            INSERT INTO pixelboard.accounts (
                firebase_uid, community_standards_version,
                community_standards_accepted_at, updated_at)
            VALUES ($1, '2026-08-21', now(), now());
            """,
            accountId.Value);
        await ExecuteAsync(
            dataSource,
            """
            INSERT INTO pixelboard.entitlements (
                firebase_uid, tier, source, updated_at)
            VALUES ($1, 'pro', 'test', now());
            """,
            accountId.Value);
        var stripeCustomerId = $"cus_{Guid.NewGuid():N}";
        await ExecuteAsync(
            dataSource,
            """
            INSERT INTO pixelboard.stripe_customers (
                firebase_uid, stripe_customer_id, created_at)
            VALUES ($1, $2, now());
            """,
            accountId.Value,
            stripeCustomerId);
        await ExecuteAsync(
            dataSource,
            """
            INSERT INTO pixelboard.stripe_subscriptions (
                stripe_subscription_id, firebase_uid, stripe_customer_id,
                status, price_id, current_period_end, event_at, updated_at)
            VALUES ($2, $1, $3, 'active', 'price_test', now() + interval '30 days', now(), now());
            """,
            accountId.Value,
            $"sub_{Guid.NewGuid():N}",
            stripeCustomerId);
        var trialClaimedAt = DateTimeOffset.UtcNow;
        await ExecuteAsync(
            dataSource,
            """
            INSERT INTO pixelboard.stripe_trial_claims (firebase_uid, claimed_at)
            VALUES ($1, $2);
            """,
            accountId.Value,
            trialClaimedAt);
        var campaignId = Guid.NewGuid();
        await ExecuteAsync(
            dataSource,
            """
            INSERT INTO pixelboard.notification_campaigns (
                campaign_id, created_by, title, body, expires_at,
                recipient_count, created_at)
            VALUES ($1, $2, 'Test campaign', 'Test body', NULL, 1, now());
            """,
            campaignId,
            accountId.Value);
        await ExecuteAsync(
            dataSource,
            """
            INSERT INTO pixelboard.notification_digest_counters (
                firebase_uid, event_day, event_count)
            VALUES ($1, CURRENT_DATE, 3);
            """,
            accountId.Value);
        await ExecuteAsync(
            dataSource,
            """
            INSERT INTO pixelboard.reports (
                report_id, reporter_firebase_uid, region_top, region_left,
                region_width, region_height, reason, note, status, snapshot,
                evidence_hash, submitted_at, updated_at, client_platform, client_version)
            VALUES ($2, $1, 0, 0, 1, 1, 'other', NULL, 'received', $3::jsonb,
                $4, now(), now(), 'test', '1');
            """,
            accountId.Value,
            reportId,
            snapshot,
            SHA256.HashData(Encoding.UTF8.GetBytes(snapshot)));
        var accountHash = SHA256.HashData(Encoding.UTF8.GetBytes(accountId.Value));
        await redis.GetDatabase().StringSetAsync(
            $"{instanceName}PlacementCooldown:{Convert.ToHexStringLower(accountHash)}",
            "1");
        var pendingPlacement = new PlacementLedgerEvent(
            pendingPlacementId,
            accountId.Value,
            4_000_000,
            4_000_000,
            "#112233",
            DateTimeOffset.UtcNow,
            "test",
            "1",
            $"delete-outbox-{Guid.NewGuid():N}",
            null,
            "#FFFFFF",
            null,
            null);
        var outboxKey = $"{instanceName}{RedisAtomicPlacementStore.OutboxKey}";
        var producerGuard = await new PostgresAccountOperationGuard(dataSource)
            .AcquireIfActiveAsync([accountId]);
        Assert.NotNull(producerGuard);
        Task deletionTask;
        await using (producerGuard)
        {
            deletionTask = service.DeleteAsync(accountId).AsTask();
            await Task.Delay(50);
            Assert.False(deletionTask.IsCompleted);
            await redis.GetDatabase().StreamAddAsync(
                outboxKey,
                "payload",
                JsonSerializer.Serialize(
                    pendingPlacement,
                    new JsonSerializerOptions(JsonSerializerDefaults.Web)));
        }
        await deletionTask;
        await service.DeleteAsync(accountId);
        Assert.True(await service.IsDeletedAsync(accountId));

        await using var retained = await QuerySingleAsync(
            dataSource,
            """
            SELECT reporter_firebase_uid, snapshot::text, evidence_hash
            FROM pixelboard.reports
            WHERE report_id = $1;
            """,
            reportId);
        Assert.StartsWith("deleted:", retained.GetString(0), StringComparison.Ordinal);
        Assert.DoesNotContain(accountId.Value, retained.GetString(1), StringComparison.Ordinal);
        Assert.Equal(
            SHA256.HashData(Encoding.UTF8.GetBytes(retained.GetString(1))),
            retained.GetFieldValue<byte[]>(2));
        var accountState = new PostgresAccountStateService(dataSource);
        Assert.False(await ExistsAsync(
            dataSource,
            "SELECT EXISTS (SELECT 1 FROM pixelboard.accounts WHERE firebase_uid = $1);",
            accountId.Value));
        Assert.False(await ExistsAsync(
            dataSource,
            "SELECT EXISTS (SELECT 1 FROM pixelboard.entitlements WHERE firebase_uid = $1);",
            accountId.Value));
        Assert.False(await ExistsAsync(
            dataSource,
            "SELECT EXISTS (SELECT 1 FROM pixelboard.stripe_customers WHERE firebase_uid = $1);",
            accountId.Value));
        Assert.False(await ExistsAsync(
            dataSource,
            "SELECT EXISTS (SELECT 1 FROM pixelboard.stripe_subscriptions WHERE firebase_uid = $1);",
            accountId.Value));
        string anonymizedId;
        await using (var trialClaim = await QuerySingleAsync(
                         dataSource,
                         """
                         SELECT firebase_uid
                         FROM pixelboard.stripe_trial_claims
                         WHERE claimed_at = $1;
                         """,
                         trialClaimedAt))
        {
            anonymizedId = trialClaim.GetString(0);
            Assert.StartsWith("deleted:", anonymizedId, StringComparison.Ordinal);
        }
        await using (var campaign = await QuerySingleAsync(
                         dataSource,
                         """
                         SELECT created_by
                         FROM pixelboard.notification_campaigns
                         WHERE campaign_id = $1;
                         """,
                         campaignId))
        {
            Assert.StartsWith("deleted:", campaign.GetString(0), StringComparison.Ordinal);
            Assert.Equal(anonymizedId, campaign.GetString(0));
        }
        Assert.False(await ExistsAsync(
            dataSource,
            """
            SELECT EXISTS (
                SELECT 1
                FROM pixelboard.notification_digest_counters
                WHERE firebase_uid = $1);
            """,
            accountId.Value));
        Assert.True((await accountState.GetAsync(
            accountId,
            "2026-08-21")).IsBanned);
        await Assert.ThrowsAsync<AccountDeletedException>(
            async () => await accountState.AcceptCommunityStandardsAsync(
                accountId,
                "2026-08-21"));
        Assert.False(await ExistsAsync(
            dataSource,
            "SELECT EXISTS (SELECT 1 FROM pixelboard.accounts WHERE firebase_uid = $1);",
            accountId.Value));
        Assert.False(await redis.GetDatabase().KeyExistsAsync(
            $"{instanceName}PlacementCooldown:{Convert.ToHexStringLower(accountHash)}"));
        Assert.Equal(0, await redis.GetDatabase().StreamLengthAsync(outboxKey));
        await using (var retainedPlacement = await QuerySingleAsync(
                         dataSource,
                         """
                         SELECT firebase_uid
                         FROM pixelboard.placements
                         WHERE placement_id = $1;
                         """,
                         pendingPlacementId.Value))
        {
            Assert.StartsWith(
                "deleted:",
                retainedPlacement.GetString(0),
                StringComparison.Ordinal);
        }
        Assert.False(await new PostgresReportStore(dataSource).SaveAsync(
            new ReportCommand(
                ReportId.New(),
                accountId,
                new ReportRegion(0, 0, 1, 1),
                ReportReason.Other,
                null,
                new ClientContext("test", "1"),
                DateTimeOffset.UtcNow),
            new ReportEvidence("{}", SHA256.HashData("{}"u8.ToArray()))));
        Assert.Null(await storeKit.GetOrCreateAccountTokenAsync(accountId));
        Assert.Equal(StoreKitApplyOutcome.NotApplied, await storeKit.ApplyAsync(
            accountId,
            new VerifiedStoreKitTransaction(
                $"transaction-{Guid.NewGuid():N}",
                $"original-{Guid.NewGuid():N}",
                "pixelboard.pro.monthly",
                storeKitToken.Value,
                "Sandbox",
                DateTimeOffset.UtcNow,
                DateTimeOffset.UtcNow.AddMonths(1),
                null)));
        var moderation = new PostgresModerationService(
            dataSource,
            redis,
            Options.Create(new RedisOptions
            {
                ConnectionString = redisConnection,
                InstanceName = instanceName
            }));
        await Assert.ThrowsAsync<ModerationAccountDeletedException>(
            async () => await moderation.SetSafetyStateAsync(
                new ModerationActionCommand(
                    ModerationActionId.New(),
                    $"deleted-moderator-{Guid.NewGuid():N}",
                    accountId,
                    "safety_update",
                    "Deleted moderator test",
                    null,
                    null,
                    [],
                    null,
                    DateTimeOffset.UtcNow),
                new PlatformSafetyState(false, false)));

        var attributedReportId = ReportId.New();
        var reporter = new AccountId($"firebase-reporter-{Guid.NewGuid():N}");
        var attributedSnapshot =
            $$"""{"recentAttributedPlacements":[{"firebaseUid":"{{accountId.Value}}"}]}""";
        Assert.True(await new PostgresReportStore(dataSource).SaveAsync(
            new ReportCommand(
                attributedReportId,
                reporter,
                new ReportRegion(0, 0, 1, 1),
                ReportReason.Other,
                null,
                new ClientContext("test", "1"),
                DateTimeOffset.UtcNow),
            new ReportEvidence(
                attributedSnapshot,
                SHA256.HashData(Encoding.UTF8.GetBytes(attributedSnapshot)))));
        await using var attributedReport = await QuerySingleAsync(
            dataSource,
            """
            SELECT snapshot::text
            FROM pixelboard.reports
            WHERE report_id = $1;
            """,
            attributedReportId.Value);
        Assert.DoesNotContain(accountId.Value, attributedReport.GetString(0), StringComparison.Ordinal);

        await ExecuteAsync(
            dataSource,
            """
            DELETE FROM pixelboard.current_pixels
            WHERE placement_id = $1;
            """,
            pendingPlacementId.Value);
        await ExecuteAsync(
            dataSource,
            """
            DELETE FROM pixelboard.placements
            WHERE placement_id = $1;
            """,
            pendingPlacementId.Value);
        await ExecuteAsync(
            dataSource,
            "DELETE FROM pixelboard.reports WHERE report_id = ANY($1);",
            new[] { reportId, attributedReportId.Value });
        await ExecuteAsync(
            dataSource,
            "DELETE FROM pixelboard.notification_campaigns WHERE campaign_id = $1;",
            campaignId);
        await ExecuteAsync(
            dataSource,
            """
            DELETE FROM pixelboard.stripe_trial_claims
            WHERE firebase_uid = $1;
            """,
            anonymizedId);

        await ExecuteAsync(
            dataSource,
            "DELETE FROM pixelboard.deleted_accounts WHERE account_hash = $1;",
            accountHash);
    }

    private static async Task ExecuteAsync(
        NpgsqlDataSource dataSource,
        string sql,
        params object[] values)
    {
        await using var command = dataSource.CreateCommand(sql);
        foreach (var value in values)
        {
            command.Parameters.AddWithValue(value);
        }
        await command.ExecuteNonQueryAsync();
    }

    private static async Task<NpgsqlDataReader> QuerySingleAsync(
        NpgsqlDataSource dataSource,
        string sql,
        object value)
    {
        var command = dataSource.CreateCommand(sql);
        command.Parameters.AddWithValue(value);
        var reader = await command.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        return reader;
    }

    private static async Task<bool> ExistsAsync(
        NpgsqlDataSource dataSource,
        string sql,
        object value)
    {
        await using var command = dataSource.CreateCommand(sql);
        command.Parameters.AddWithValue(value);
        return (bool)(await command.ExecuteScalarAsync() ?? false);
    }
}
