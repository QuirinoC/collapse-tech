using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Npgsql;
using PixelBoard.Application;
using PixelBoard.Domain;
using PixelBoard.Infrastructure.Board;

namespace PixelBoard.Infrastructure.Moderation;

public sealed class ReportEvidenceCollector(
    IBoardStore boardStore,
    NpgsqlDataSource dataSource,
    TimeProvider timeProvider) : IReportEvidenceCollector
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async ValueTask<ReportEvidence> CollectAsync(
        ReportCommand command,
        CancellationToken cancellationToken = default)
    {
        var colors = await CaptureColorsAsync(command, cancellationToken);
        var placements = await CapturePlacementsAsync(command, cancellationToken);
        var snapshot = new EvidenceSnapshot(
            command.Region,
            timeProvider.GetUtcNow(),
            colors,
            placements);
        var json = JsonSerializer.Serialize(snapshot, JsonOptions);
        return new ReportEvidence(
            json,
            SHA256.HashData(Encoding.UTF8.GetBytes(json)));
    }

    private async ValueTask<string[][]> CaptureColorsAsync(
        ReportCommand command,
        CancellationToken cancellationToken)
    {
        var region = command.Region;
        var tiles = new Dictionary<TileAddress, string[][]>();
        var colors = new string[region.Height][];
        for (var rowOffset = 0; rowOffset < region.Height; rowOffset++)
        {
            colors[rowOffset] = new string[region.Width];
            for (var columnOffset = 0; columnOffset < region.Width; columnOffset++)
            {
                var location = BoardGeometry.Locate(new BoardPosition(
                    checked(region.Top + rowOffset),
                    checked(region.Left + columnOffset)));
                if (!tiles.TryGetValue(location.Tile, out var tile))
                {
                    tile = await boardStore.GetTileAsync(location.Tile, cancellationToken);
                    tiles.Add(location.Tile, tile);
                }

                colors[rowOffset][columnOffset] =
                    tile[location.Offset.Row][location.Offset.Column];
            }
        }

        return colors;
    }

    private async ValueTask<IReadOnlyList<AttributedPlacement>> CapturePlacementsAsync(
        ReportCommand command,
        CancellationToken cancellationToken)
    {
        const string sql =
            """
            SELECT
                placement_id,
                firebase_uid,
                board_row,
                board_column,
                color,
                placed_at
            FROM pixelboard.placements
            WHERE board_row >= $1
              AND board_row < $2
              AND board_column >= $3
              AND board_column < $4
              AND placed_at >= $5
            ORDER BY placed_at DESC
            LIMIT 500;
            """;
        await using var databaseCommand = dataSource.CreateCommand(sql);
        databaseCommand.Parameters.AddWithValue(command.Region.Top);
        databaseCommand.Parameters.AddWithValue(
            checked(command.Region.Top + command.Region.Height));
        databaseCommand.Parameters.AddWithValue(command.Region.Left);
        databaseCommand.Parameters.AddWithValue(
            checked(command.Region.Left + command.Region.Width));
        databaseCommand.Parameters.AddWithValue(command.SubmittedAt.AddHours(-24));
        await using var reader = await databaseCommand.ExecuteReaderAsync(cancellationToken);
        var placements = new List<AttributedPlacement>();
        while (await reader.ReadAsync(cancellationToken))
        {
            placements.Add(new AttributedPlacement(
                reader.GetGuid(0).ToString("N"),
                reader.GetString(1),
                reader.GetInt32(2),
                reader.GetInt32(3),
                reader.GetString(4),
                reader.GetFieldValue<DateTimeOffset>(5)));
        }

        return placements;
    }

    private sealed record EvidenceSnapshot(
        Contracts.V1.ReportRegion Region,
        DateTimeOffset CapturedAt,
        string[][] Colors,
        IReadOnlyList<AttributedPlacement> RecentAttributedPlacements);

    private sealed record AttributedPlacement(
        string PlacementId,
        string FirebaseUid,
        int Row,
        int Column,
        string Color,
        DateTimeOffset PlacedAt);
}
