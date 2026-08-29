using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Npgsql;
using Microsoft.Extensions.Options;
using PixelBoard.Application;
using PixelBoard.Configuration;
using PixelBoard.Infrastructure.Ledger;
using StackExchange.Redis;

namespace PixelBoard.Infrastructure.Postgres;

public sealed class PostgresAccountDeletionService(
    NpgsqlDataSource dataSource,
    IConnectionMultiplexer redis,
    IOptions<RedisOptions> redisOptions) : IAccountDeletionService
{
    private static readonly JsonSerializerOptions JsonOptions =
        new(JsonSerializerDefaults.Web);

    public async ValueTask<bool> IsDeletedAsync(
        AccountId accountId,
        CancellationToken cancellationToken = default)
    {
        const string sql =
            """
            SELECT EXISTS (
                SELECT 1
                FROM pixelboard.deleted_accounts
                WHERE account_hash = $1
            );
            """;
        await using var command = dataSource.CreateCommand(sql);
        command.Parameters.AddWithValue(
            SHA256.HashData(Encoding.UTF8.GetBytes(accountId.Value)));
        return (bool)(await command.ExecuteScalarAsync(cancellationToken) ?? false);
    }

    public async ValueTask DeleteAsync(
        AccountId accountId,
        CancellationToken cancellationToken = default)
    {
        var accountHash = SHA256.HashData(Encoding.UTF8.GetBytes(accountId.Value));
        var anonymizedId = $"deleted:{Guid.NewGuid():N}";

        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        await PostgresAccountLock.AcquireAsync(
            connection,
            transaction,
            accountHash,
            cancellationToken);
        var pendingOutbox = await FindPendingOutboxEntriesAsync(
            accountId.Value,
            cancellationToken);
        foreach (var entry in pendingOutbox)
        {
            if (entry.Placement is not null)
            {
                await PostgresPlacementLedger.IngestAsync(
                    connection,
                    transaction,
                    entry.Placement,
                    entry.Id,
                    accountHash,
                    cancellationToken);
            }
        }
        anonymizedId = await GetOrCreateTombstoneAsync(
            connection,
            transaction,
            accountHash,
            anonymizedId,
            cancellationToken);
        await AnonymizeRetainedRecordsAsync(
            connection,
            transaction,
            accountId.Value,
            anonymizedId,
            cancellationToken);
        await DeleteAccountRecordsAsync(
            connection,
            transaction,
            accountId.Value,
            cancellationToken);
        await RehashReportEvidenceAsync(
            connection,
            transaction,
            anonymizedId,
            cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        await DeleteOutboxEntriesAsync(pendingOutbox, cancellationToken);
        await DrainLateOutboxEntriesAsync(accountId.Value, cancellationToken);
        var redisHash = Convert.ToHexStringLower(accountHash);
        var prefix = redisOptions.Value.InstanceName;
        await redis.GetDatabase().KeyDeleteAsync(
        [
            $"{prefix}{Infrastructure.Ledger.RedisAtomicPlacementStore.CooldownKeyPrefix}:{redisHash}",
            $"{prefix}ReportRate:{redisHash}"
        ]);
    }

    private async Task<IReadOnlyList<PendingOutboxEntry>> FindPendingOutboxEntriesAsync(
        string firebaseUid,
        CancellationToken cancellationToken)
    {
        const int batchSize = 256;
        var matches = new List<PendingOutboxEntry>();
        var database = redis.GetDatabase();
        var streamKey =
            $"{redisOptions.Value.InstanceName}{RedisAtomicPlacementStore.OutboxKey}";
        RedisValue minimumId = "-";
        while (true)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var entries = await database.StreamRangeAsync(
                streamKey,
                minimumId,
                "+",
                batchSize,
                Order.Ascending);
            if (entries.Length == 0)
            {
                break;
            }

            foreach (var entry in entries)
            {
                var payload = entry.Values
                    .FirstOrDefault(value => value.Name == "payload")
                    .Value;
                if (payload.IsNull)
                {
                    continue;
                }

                PlacementLedgerEvent? placement = null;
                string? payloadUid = null;
                try
                {
                    placement = JsonSerializer.Deserialize<PlacementLedgerEvent>(
                        payload.ToString(),
                        JsonOptions);
                    payloadUid = placement?.FirebaseUid;
                }
                catch (JsonException)
                {
                    using var document = JsonDocument.Parse(payload.ToString());
                    if (document.RootElement.TryGetProperty("firebaseUid", out var uid)
                        && uid.ValueKind == JsonValueKind.String)
                    {
                        payloadUid = uid.GetString();
                    }
                }

                if (string.Equals(payloadUid, firebaseUid, StringComparison.Ordinal))
                {
                    matches.Add(new PendingOutboxEntry(entry.Id!, placement));
                }
            }

            if (entries.Length < batchSize)
            {
                break;
            }
            minimumId = $"({entries[^1].Id}";
        }

        return matches;
    }

    private async Task DrainLateOutboxEntriesAsync(
        string firebaseUid,
        CancellationToken cancellationToken)
    {
        var ledger = new PostgresPlacementLedger(dataSource);
        for (var attempt = 0; attempt < 3; attempt++)
        {
            var entries = await FindPendingOutboxEntriesAsync(firebaseUid, cancellationToken);
            if (entries.Count == 0)
            {
                return;
            }

            foreach (var entry in entries)
            {
                if (entry.Placement is not null)
                {
                    await ledger.IngestAsync(entry.Placement, entry.Id, cancellationToken);
                }
            }
            await DeleteOutboxEntriesAsync(entries, cancellationToken);
        }
    }

    private async Task DeleteOutboxEntriesAsync(
        IReadOnlyList<PendingOutboxEntry> entries,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (entries.Count == 0)
        {
            return;
        }

        var database = redis.GetDatabase();
        var streamKey =
            $"{redisOptions.Value.InstanceName}{RedisAtomicPlacementStore.OutboxKey}";
        foreach (var batch in entries.Chunk(1000))
        {
            await database.StreamDeleteAsync(
                streamKey,
                batch.Select(entry => (RedisValue)entry.Id).ToArray());
        }
    }

    private static async Task<string> GetOrCreateTombstoneAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        byte[] accountHash,
        string anonymizedId,
        CancellationToken cancellationToken)
    {
        const string sql =
            """
            INSERT INTO pixelboard.deleted_accounts (account_hash, anonymized_id, deleted_at)
            VALUES ($1, $2, now())
            ON CONFLICT (account_hash) DO UPDATE
            SET account_hash = EXCLUDED.account_hash
            RETURNING anonymized_id;
            """;
        await using var command = new NpgsqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue(accountHash);
        command.Parameters.AddWithValue(anonymizedId);
        return (string)(await command.ExecuteScalarAsync(cancellationToken)
            ?? throw new InvalidOperationException("Account tombstone was not returned."));
    }

    private static async Task AnonymizeRetainedRecordsAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        string firebaseUid,
        string anonymizedId,
        CancellationToken cancellationToken)
    {
        string[] commands =
        [
            """
            UPDATE pixelboard.placements
            SET firebase_uid = $2
            WHERE firebase_uid = $1;
            """,
            """
            UPDATE pixelboard.reports
            SET reporter_firebase_uid = CASE
                    WHEN reporter_firebase_uid = $1 THEN $2
                    ELSE reporter_firebase_uid
                END,
                snapshot = replace(snapshot::text, $1, $2)::jsonb
            WHERE reporter_firebase_uid = $1
               OR snapshot::text LIKE '%' || $1 || '%';
            """,
            """
            UPDATE pixelboard.account_bans
            SET firebase_uid = CASE WHEN firebase_uid = $1 THEN $2 ELSE firebase_uid END,
                created_by = CASE WHEN created_by = $1 THEN $2 ELSE created_by END
            WHERE firebase_uid = $1 OR created_by = $1;
            """,
            """
            UPDATE pixelboard.account_warnings
            SET firebase_uid = CASE WHEN firebase_uid = $1 THEN $2 ELSE firebase_uid END,
                created_by = CASE WHEN created_by = $1 THEN $2 ELSE created_by END
            WHERE firebase_uid = $1 OR created_by = $1;
            """,
            """
            UPDATE pixelboard.moderation_actions
            SET actor_firebase_uid = CASE
                    WHEN actor_firebase_uid = $1 THEN $2
                    ELSE actor_firebase_uid
                END,
                details = replace(details::text, $1, $2)::jsonb
            WHERE actor_firebase_uid = $1
               OR details::text LIKE '%' || $1 || '%';
            """,
            """
            UPDATE pixelboard.audit_events
            SET actor_firebase_uid = CASE
                    WHEN actor_firebase_uid = $1 THEN $2
                    ELSE actor_firebase_uid
                END,
                subject_id = CASE
                    WHEN subject_type = 'account' AND subject_id = $1 THEN $2
                    ELSE subject_id
                END,
                details = replace(details::text, $1, $2)::jsonb
            WHERE actor_firebase_uid = $1
               OR (subject_type = 'account' AND subject_id = $1)
               OR details::text LIKE '%' || $1 || '%';
            """,
            """
            UPDATE pixelboard.hidden_regions
            SET created_by = $2
            WHERE created_by = $1;
            """,
            """
            UPDATE pixelboard.platform_safety_state
            SET updated_by = $2
            WHERE updated_by = $1;
            """
        ];
        foreach (var sql in commands)
        {
            await using var command = new NpgsqlCommand(sql, connection, transaction);
            command.Parameters.AddWithValue(firebaseUid);
            command.Parameters.AddWithValue(anonymizedId);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }
    }

    private static async Task DeleteAccountRecordsAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        string firebaseUid,
        CancellationToken cancellationToken)
    {
        string[] commands =
        [
            """
            DELETE FROM pixelboard.storekit_transactions
            WHERE firebase_uid = $1;
            """,
            """
            DELETE FROM pixelboard.storekit_subscription_owners
            WHERE firebase_uid = $1;
            """,
            """
            DELETE FROM pixelboard.storekit_account_tokens
            WHERE firebase_uid = $1;
            """,
            """
            DELETE FROM pixelboard.stripe_subscriptions
            WHERE firebase_uid = $1;
            """,
            """
            DELETE FROM pixelboard.stripe_customers
            WHERE firebase_uid = $1;
            """,
            """
            DELETE FROM pixelboard.entitlements
            WHERE firebase_uid = $1;
            """,
            """
            DELETE FROM pixelboard.paint_boosts
            WHERE firebase_uid = $1;
            """,
            """
            DELETE FROM pixelboard.referral_attributions
            WHERE referee_firebase_uid = $1
               OR referrer_firebase_uid = $1;
            """,
            """
            DELETE FROM pixelboard.referral_codes
            WHERE firebase_uid = $1;
            """,
            """
            DELETE FROM pixelboard.accounts
            WHERE firebase_uid = $1;
            """
        ];
        foreach (var sql in commands)
        {
            await using var command = new NpgsqlCommand(sql, connection, transaction);
            command.Parameters.AddWithValue(firebaseUid);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }
    }

    private static async Task RehashReportEvidenceAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        string anonymizedId,
        CancellationToken cancellationToken)
    {
        const string selectSql =
            """
            SELECT report_id, snapshot::text
            FROM pixelboard.reports
            WHERE snapshot::text LIKE '%' || $1 || '%';
            """;
        var reports = new List<(Guid Id, byte[] Hash)>();
        await using (var select = new NpgsqlCommand(selectSql, connection, transaction))
        {
            select.Parameters.AddWithValue(anonymizedId);
            await using var reader = await select.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                reports.Add((
                    reader.GetGuid(0),
                    SHA256.HashData(Encoding.UTF8.GetBytes(reader.GetString(1)))));
            }
        }

        const string updateSql =
            "UPDATE pixelboard.reports SET evidence_hash = $2 WHERE report_id = $1;";
        foreach (var report in reports)
        {
            await using var update = new NpgsqlCommand(updateSql, connection, transaction);
            update.Parameters.AddWithValue(report.Id);
            update.Parameters.AddWithValue(report.Hash);
            await update.ExecuteNonQueryAsync(cancellationToken);
        }
    }

    private sealed record PendingOutboxEntry(string Id, PlacementLedgerEvent? Placement);
}
