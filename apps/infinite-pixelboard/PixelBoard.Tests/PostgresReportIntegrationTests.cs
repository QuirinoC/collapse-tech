using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Npgsql;
using PixelBoard.Application;
using PixelBoard.Contracts.V1;
using PixelBoard.Domain;
using PixelBoard.Infrastructure.Board;
using PixelBoard.Infrastructure.Moderation;

namespace PixelBoard.Tests;

public sealed class PostgresReportIntegrationTests
{
    [PostgresFact]
    [Trait("Category", "Integration")]
    public async Task ServerEvidenceAndPrivateAttributionArePersistedWithStableStatus()
    {
        var connectionString = Environment.GetEnvironmentVariable(
            "PIXELBOARD_TEST_POSTGRES")!;
        await using var dataSource = NpgsqlDataSource.Create(connectionString);
        var submittedAt = DateTimeOffset.UtcNow;
        var reporter = $"firebase-reporter-{Guid.NewGuid():N}";
        var accused = $"firebase-accused-{Guid.NewGuid():N}";
        var placementId = Guid.NewGuid();
        var reportId = ReportId.New();
        var command = new ReportCommand(
            reportId,
            new AccountId(reporter),
            new ReportRegion(-1, 128, 1, 1),
            ReportReason.HateOrHarassment,
            "context",
            new ClientContext("integration", "1.0"),
            submittedAt);

        await ExecuteAsync(
            dataSource,
            """
            INSERT INTO pixelboard.placements (
                placement_id, firebase_uid, board_row, board_column, color, placed_at,
                client_platform, client_version, idempotency_key, prior_color,
                redis_stream_id, stream_timestamp_ms, stream_sequence)
            VALUES ($1, $2, -1, 128, '#112233', $3, 'test', '1.0', $4, '#FFFFFF',
                $5, $6, 0);
            """,
            placementId,
            accused,
            submittedAt.AddMinutes(-1),
            $"report-evidence-{Guid.NewGuid():N}",
            $"{submittedAt.ToUnixTimeMilliseconds()}-0",
            submittedAt.ToUnixTimeMilliseconds());

        var collector = new ReportEvidenceCollector(
            new FixedBoardStore("#ABCDEF"),
            dataSource,
            TimeProvider.System);
        var evidence = await collector.CollectAsync(command);
        await new PostgresReportStore(dataSource).SaveAsync(command, evidence);

        await using var query = dataSource.CreateCommand(
            """
            SELECT status, snapshot::text, evidence_hash, reporter_firebase_uid
            FROM pixelboard.reports
            WHERE report_id = $1;
            """);
        query.Parameters.AddWithValue(reportId.Value);
        await using var reader = await query.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        Assert.Equal("received", reader.GetString(0));
        var snapshot = reader.GetString(1);
        Assert.Equal(
            SHA256.HashData(Encoding.UTF8.GetBytes(evidence.SnapshotJson)),
            reader.GetFieldValue<byte[]>(2));
        Assert.Equal(reporter, reader.GetString(3));
        using var document = JsonDocument.Parse(snapshot);
        Assert.Equal(
            "#ABCDEF",
            document.RootElement.GetProperty("colors")[0][0].GetString());
        Assert.Equal(
            accused,
            document.RootElement
                .GetProperty("recentAttributedPlacements")[0]
                .GetProperty("firebaseUid")
                .GetString());

        await reader.CloseAsync();
        await ExecuteAsync(
            dataSource,
            "DELETE FROM pixelboard.reports WHERE report_id = $1;",
            reportId.Value);
        await ExecuteAsync(
            dataSource,
            "DELETE FROM pixelboard.placements WHERE placement_id = $1;",
            placementId);
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

    private sealed class FixedBoardStore(string color) : IBoardStore
    {
        public ValueTask<string[][]> GetTileAsync(
            TileAddress address,
            CancellationToken cancellationToken = default)
        {
            var tile = BoardTileSerializer.CreateDefault();
            tile[127][0] = color;
            return ValueTask.FromResult(tile);
        }

        public ValueTask SetPixelAsync(
            BoardPosition position,
            string color,
            CancellationToken cancellationToken = default) =>
            ValueTask.CompletedTask;

        public ValueTask CheckHealthAsync(
            CancellationToken cancellationToken = default) =>
            ValueTask.CompletedTask;
    }
}
