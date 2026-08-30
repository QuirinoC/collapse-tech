using Npgsql;
using PixelBoard.Contracts.V1;
using PixelBoard.Infrastructure.Ledger;

namespace PixelBoard.Tests;

public sealed class PostgresPlacementLedgerIntegrationTests
{
    [PostgresFact]
    [Trait("Category", "Integration")]
    public async Task IngestIsIdempotentAndUpdatesCurrentOwnership()
    {
        var connectionString = Environment.GetEnvironmentVariable(
            "PIXELBOARD_TEST_POSTGRES")!;

        await using var dataSource = NpgsqlDataSource.Create(connectionString);
        var ledger = new PostgresPlacementLedger(dataSource);
        var row = Random.Shared.Next(100_000, int.MaxValue);
        var column = Random.Shared.Next(100_000, int.MaxValue);
        var placementId = PlacementId.New();
        var placement = new PlacementLedgerEvent(
            placementId,
            $"firebase-test-{Guid.NewGuid():N}",
            row,
            column,
            "#ABCDEF",
            DateTimeOffset.UtcNow,
            "test",
            "1.0",
            $"request-{Guid.NewGuid():N}",
            null,
            "#FFFFFF",
            null,
            null);
        var streamId = $"{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}-0";

        await ledger.IngestAsync(placement, streamId);
        await ledger.IngestAsync(placement, streamId);

        await using var countCommand = dataSource.CreateCommand(
            """
            SELECT count(*)
            FROM pixelboard.placements
            WHERE placement_id = @placement_id;
            """);
        countCommand.Parameters.AddWithValue("placement_id", placementId.Value);
        var count = (long)(await countCommand.ExecuteScalarAsync() ?? 0L);

        await using var ownerCommand = dataSource.CreateCommand(
            """
            SELECT placement_id
            FROM pixelboard.current_pixels
            WHERE board_row = @board_row
              AND board_column = @board_column;
            """);
        ownerCommand.Parameters.AddWithValue("board_row", placement.Row);
        ownerCommand.Parameters.AddWithValue("board_column", placement.Column);
        var currentPlacementId = (Guid?)await ownerCommand.ExecuteScalarAsync();

        Assert.Equal(1, count);
        Assert.Equal(placementId.Value, currentPlacementId);

        await using var cleanup = dataSource.CreateCommand(
            """
            DELETE FROM pixelboard.current_pixels
            WHERE board_row = @board_row
              AND board_column = @board_column;
            DELETE FROM pixelboard.placements
            WHERE placement_id = @placement_id;
            """);
        cleanup.Parameters.AddWithValue("board_row", placement.Row);
        cleanup.Parameters.AddWithValue("board_column", placement.Column);
        cleanup.Parameters.AddWithValue("placement_id", placementId.Value);
        await cleanup.ExecuteNonQueryAsync();
    }

    [PostgresFact]
    [Trait("Category", "Integration")]
    public async Task OlderReclaimedEventCannotReplaceNewerCurrentPixel()
    {
        var connectionString = Environment.GetEnvironmentVariable(
            "PIXELBOARD_TEST_POSTGRES")!;

        await using var dataSource = NpgsqlDataSource.Create(connectionString);
        var ledger = new PostgresPlacementLedger(dataSource);
        var row = Random.Shared.Next(100_000, int.MaxValue);
        var column = Random.Shared.Next(100_000, int.MaxValue);
        var older = CreatePlacement(row, column, "#111111");
        var newer = CreatePlacement(row, column, "#222222");

        await ledger.IngestAsync(newer, "2000-0");
        await ledger.IngestAsync(older, "1000-0");

        await using var ownerCommand = dataSource.CreateCommand(
            """
            SELECT placement_id
            FROM pixelboard.current_pixels
            WHERE board_row = @board_row
              AND board_column = @board_column;
            """);
        ownerCommand.Parameters.AddWithValue("board_row", row);
        ownerCommand.Parameters.AddWithValue("board_column", column);

        Assert.Equal(newer.PlacementId.Value, (Guid?)await ownerCommand.ExecuteScalarAsync());

        await using var cleanup = dataSource.CreateCommand(
            """
            DELETE FROM pixelboard.current_pixels
            WHERE board_row = @board_row
              AND board_column = @board_column;
            DELETE FROM pixelboard.placements
            WHERE placement_id IN (@older_id, @newer_id);
            """);
        cleanup.Parameters.AddWithValue("board_row", row);
        cleanup.Parameters.AddWithValue("board_column", column);
        cleanup.Parameters.AddWithValue("older_id", older.PlacementId.Value);
        cleanup.Parameters.AddWithValue("newer_id", newer.PlacementId.Value);
        await cleanup.ExecuteNonQueryAsync();
    }

    [PostgresFact]
    [Trait("Category", "Integration")]
    public async Task TenOverwritesCreateOneDailyDigestForThePriorOwner()
    {
        var connectionString = Environment.GetEnvironmentVariable(
            "PIXELBOARD_TEST_POSTGRES")!;

        await using var dataSource = NpgsqlDataSource.Create(connectionString);
        var ledger = new PostgresPlacementLedger(dataSource);
        var row = Random.Shared.Next(100_000, int.MaxValue);
        var column = Random.Shared.Next(100_000, int.MaxValue);
        var placements = new List<PlacementLedgerEvent>();
        var owner = $"firebase-test-owner-{Guid.NewGuid():N}";
        var actor = $"firebase-test-actor-{Guid.NewGuid():N}";
        for (var index = 0; index < 10; index++)
        {
            var original = CreatePlacement(row + index, column, "#111111", owner);
            var next = CreatePlacement(row + index, column, $"#{index + 2:X2}0000", actor) with
            {
                PriorPlacementId = original.PlacementId,
                PriorColor = original.Color
            };
            placements.Add(original);
            placements.Add(next);
            await ledger.IngestAsync(original, $"{3000 + index * 2}-0");
            await ledger.IngestAsync(next, $"{3001 + index * 2}-0");
        }

        await using var notificationCount = dataSource.CreateCommand(
            """
            SELECT count(*)
            FROM pixelboard.notification_outbox
            WHERE recipient_firebase_uid = @recipient
              AND category = 'board_activity';
            """);
        notificationCount.Parameters.AddWithValue("recipient", owner);

        Assert.Equal(1L, (long)(await notificationCount.ExecuteScalarAsync() ?? 0L));

        await using var counterCommand = dataSource.CreateCommand(
            """
            SELECT event_count
            FROM pixelboard.notification_digest_counters
            WHERE firebase_uid = @recipient
              AND event_day = (now() AT TIME ZONE 'UTC')::date;
            """);
        counterCommand.Parameters.AddWithValue("recipient", owner);
        Assert.Equal(10, (int)(await counterCommand.ExecuteScalarAsync() ?? 0));

        await using var cleanup = dataSource.CreateCommand(
            """
            DELETE FROM pixelboard.notification_outbox
            WHERE recipient_firebase_uid = @recipient;
            DELETE FROM pixelboard.notification_digest_counters
            WHERE firebase_uid = @recipient;
            DELETE FROM pixelboard.current_pixels
            WHERE board_row >= @board_row
              AND board_row < @board_row + 10
              AND board_column = @board_column;
            DELETE FROM pixelboard.placements
            WHERE placement_id = ANY(@placement_ids);
            """);
        cleanup.Parameters.AddWithValue("recipient", owner);
        cleanup.Parameters.AddWithValue("board_row", row);
        cleanup.Parameters.AddWithValue("board_column", column);
        cleanup.Parameters.AddWithValue(
            "placement_ids",
            placements.Select(placement => placement.PlacementId.Value).ToArray());
        await cleanup.ExecuteNonQueryAsync();
    }

    private static PlacementLedgerEvent CreatePlacement(
        int row,
        int column,
        string color,
        string? firebaseUid = null)
    {
        return new PlacementLedgerEvent(
            PlacementId.New(),
            firebaseUid ?? $"firebase-test-{Guid.NewGuid():N}",
            row,
            column,
            color,
            DateTimeOffset.UtcNow,
            "test",
            "1.0",
            $"request-{Guid.NewGuid():N}",
            null,
            "#FFFFFF",
            null,
            null);
    }
}
