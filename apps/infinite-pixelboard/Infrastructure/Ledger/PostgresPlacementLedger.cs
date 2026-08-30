using Npgsql;
using System.Security.Cryptography;
using System.Text;

namespace PixelBoard.Infrastructure.Ledger;

public sealed class PostgresPlacementLedger(NpgsqlDataSource dataSource) : IPlacementLedger
{
    private const string IngestSql =
        """
        WITH inserted AS (
            INSERT INTO pixelboard.placements (
                placement_id,
                firebase_uid,
                board_row,
                board_column,
                color,
                placed_at,
                client_platform,
                client_version,
                idempotency_key,
                prior_placement_id,
                prior_color,
                ip_hash,
                device_hash,
                redis_stream_id,
                stream_timestamp_ms,
                stream_sequence)
            VALUES (
                @placement_id,
                COALESCE((
                    SELECT anonymized_id
                    FROM pixelboard.deleted_accounts
                    WHERE account_hash = @account_hash
                ), @firebase_uid),
                @board_row,
                @board_column,
                @color,
                @placed_at,
                @client_platform,
                @client_version,
                @idempotency_key,
                @prior_placement_id,
                @prior_color,
                @ip_hash,
                @device_hash,
                @redis_stream_id,
                @stream_timestamp_ms,
                @stream_sequence)
            ON CONFLICT DO NOTHING
            RETURNING
                placement_id,
                firebase_uid,
                board_row,
                board_column,
                stream_timestamp_ms,
                stream_sequence,
                prior_placement_id,
                placed_at
        ),
        updated AS (
            INSERT INTO pixelboard.current_pixels (
            board_row,
            board_column,
            placement_id,
            stream_timestamp_ms,
            stream_sequence)
        SELECT
            board_row,
            board_column,
            placement_id,
            stream_timestamp_ms,
            stream_sequence
        FROM inserted
        ON CONFLICT (board_row, board_column)
        DO UPDATE SET
            placement_id = EXCLUDED.placement_id,
            stream_timestamp_ms = EXCLUDED.stream_timestamp_ms,
            stream_sequence = EXCLUDED.stream_sequence
        WHERE (
            pixelboard.current_pixels.stream_timestamp_ms,
            pixelboard.current_pixels.stream_sequence
        ) < (
            EXCLUDED.stream_timestamp_ms,
            EXCLUDED.stream_sequence
        )
        RETURNING placement_id
        ),
        digest_incremented AS (
            INSERT INTO pixelboard.notification_digest_counters (
                firebase_uid, event_day, event_count)
            SELECT
                prior.firebase_uid,
                (inserted.placed_at AT TIME ZONE 'UTC')::date,
                1
            FROM inserted
            JOIN updated
              ON updated.placement_id = inserted.placement_id
            JOIN pixelboard.placements prior
              ON prior.placement_id = inserted.prior_placement_id
            WHERE prior.firebase_uid <> inserted.firebase_uid
            ON CONFLICT (firebase_uid, event_day) DO UPDATE SET
                event_count = pixelboard.notification_digest_counters.event_count + 1
            RETURNING firebase_uid, event_day, event_count
        ),
        digest_ready AS (
            UPDATE pixelboard.notification_digest_counters counters
            SET digest_sent_at = now()
            FROM digest_incremented
            WHERE counters.firebase_uid = digest_incremented.firebase_uid
              AND counters.event_day = digest_incremented.event_day
              AND digest_incremented.event_count >= 10
              AND counters.digest_sent_at IS NULL
            RETURNING counters.firebase_uid, counters.event_day, counters.event_count
        )
        INSERT INTO pixelboard.notification_outbox (
            notification_id,
            recipient_firebase_uid,
            category,
            title,
            body,
            payload,
            dedupe_key,
            available_at,
            created_at)
        SELECT
            md5(
                digest_ready.firebase_uid || ':' ||
                digest_ready.event_day::text || ':board_activity_digest')::uuid,
            digest_ready.firebase_uid,
            'board_activity',
            'Your pixel activity digest',
            digest_ready.event_count || ' or more of your pixels were overwritten today. Open the board to see what changed.',
            jsonb_build_object(
                'kind', 'board_activity_digest',
                'eventCount', digest_ready.event_count),
            digest_ready.firebase_uid || ':' ||
                digest_ready.event_day::text || ':board_activity_digest',
            now(),
            now()
        FROM digest_ready
        ON CONFLICT (dedupe_key) DO NOTHING;
        """;

    public async ValueTask IngestAsync(
        PlacementLedgerEvent placement,
        string streamEntryId,
        CancellationToken cancellationToken = default)
    {
        var accountHash = SHA256.HashData(Encoding.UTF8.GetBytes(placement.FirebaseUid));
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        await PixelBoard.Infrastructure.Postgres.PostgresAccountLock.AcquireAsync(
            connection,
            transaction,
            accountHash,
            cancellationToken);
        await IngestAsync(
            connection,
            transaction,
            placement,
            streamEntryId,
            accountHash,
            cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }

    internal static async ValueTask IngestAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        PlacementLedgerEvent placement,
        string streamEntryId,
        byte[] accountHash,
        CancellationToken cancellationToken)
    {
        var (streamTimestampMs, streamSequence) = ParseStreamEntryId(streamEntryId);
        await using var command = new NpgsqlCommand(IngestSql, connection, transaction);
        command.Parameters.AddWithValue("placement_id", placement.PlacementId.Value);
        command.Parameters.AddWithValue("firebase_uid", placement.FirebaseUid);
        command.Parameters.AddWithValue("account_hash", accountHash);
        command.Parameters.AddWithValue("board_row", placement.Row);
        command.Parameters.AddWithValue("board_column", placement.Column);
        command.Parameters.AddWithValue("color", placement.Color);
        command.Parameters.AddWithValue("placed_at", placement.PlacedAt);
        command.Parameters.AddWithValue("client_platform", placement.ClientPlatform);
        command.Parameters.AddWithValue("client_version", placement.ClientVersion);
        command.Parameters.AddWithValue("idempotency_key", placement.IdempotencyKey);
        command.Parameters.AddWithValue(
            "prior_placement_id",
            placement.PriorPlacementId?.Value ?? (object)DBNull.Value);
        command.Parameters.AddWithValue(
            "prior_color",
            placement.PriorColor
                ?? throw new InvalidOperationException("The placement outbox event has no prior color."));
        command.Parameters.AddWithValue(
            "ip_hash",
            placement.IpHash ?? (object)DBNull.Value);
        command.Parameters.AddWithValue(
            "device_hash",
            placement.DeviceHash ?? (object)DBNull.Value);
        command.Parameters.AddWithValue("redis_stream_id", streamEntryId);
        command.Parameters.AddWithValue("stream_timestamp_ms", streamTimestampMs);
        command.Parameters.AddWithValue("stream_sequence", streamSequence);

        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static (long TimestampMs, long Sequence) ParseStreamEntryId(string streamEntryId)
    {
        var separator = streamEntryId.IndexOf('-');
        if (separator <= 0
            || !long.TryParse(streamEntryId.AsSpan(0, separator), out var timestampMs)
            || !long.TryParse(streamEntryId.AsSpan(separator + 1), out var sequence))
        {
            throw new InvalidOperationException(
                $"Redis stream entry ID '{streamEntryId}' is invalid.");
        }

        return (timestampMs, sequence);
    }
}
