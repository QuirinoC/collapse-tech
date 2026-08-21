using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using Npgsql;
using PixelBoard.Application;
using PixelBoard.Configuration;
using PixelBoard.Infrastructure.Postgres;
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
        var reportId = Guid.NewGuid();
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

        await service.DeleteAsync(accountId);
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
        Assert.False(await ExistsAsync(
            dataSource,
            "SELECT EXISTS (SELECT 1 FROM pixelboard.accounts WHERE firebase_uid = $1);",
            accountId.Value));
        Assert.False(await ExistsAsync(
            dataSource,
            "SELECT EXISTS (SELECT 1 FROM pixelboard.entitlements WHERE firebase_uid = $1);",
            accountId.Value));
        Assert.True((await new PostgresAccountStateService(dataSource).GetAsync(
            accountId,
            "2026-08-21")).IsBanned);
        Assert.False(await redis.GetDatabase().KeyExistsAsync(
            $"{instanceName}PlacementCooldown:{Convert.ToHexStringLower(accountHash)}"));

        await ExecuteAsync(
            dataSource,
            "DELETE FROM pixelboard.reports WHERE report_id = $1;",
            reportId);
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
