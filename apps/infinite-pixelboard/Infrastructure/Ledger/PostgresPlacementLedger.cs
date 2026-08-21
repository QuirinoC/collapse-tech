using Npgsql;

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
                @firebase_uid,
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
                board_row,
                board_column,
                stream_timestamp_ms,
                stream_sequence
        )
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
        );
        """;

    public async ValueTask IngestAsync(
        PlacementLedgerEvent placement,
        string streamEntryId,
        CancellationToken cancellationToken = default)
    {
        var (streamTimestampMs, streamSequence) = ParseStreamEntryId(streamEntryId);
        await using var command = dataSource.CreateCommand(IngestSql);
        command.Parameters.AddWithValue("placement_id", placement.PlacementId.Value);
        command.Parameters.AddWithValue("firebase_uid", placement.FirebaseUid);
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
