using Npgsql;
using PixelBoard.Application;

namespace PixelBoard.Infrastructure.Moderation;

public sealed class PostgresReportStore(NpgsqlDataSource dataSource) : IReportStore
{
    public async ValueTask SaveAsync(
        ReportCommand command,
        ReportEvidence evidence,
        CancellationToken cancellationToken = default)
    {
        const string sql =
            """
            INSERT INTO pixelboard.reports (
                report_id,
                reporter_firebase_uid,
                region_top,
                region_left,
                region_width,
                region_height,
                reason,
                note,
                status,
                snapshot,
                evidence_hash,
                client_platform,
                client_version,
                deduplication_hash,
                submitted_at,
                updated_at)
            VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, 'received', $9::jsonb, $10,
                $11, $12, $13, $14, $14);
            """;
        await using var databaseCommand = dataSource.CreateCommand(sql);
        databaseCommand.Parameters.AddWithValue(command.ReportId.Value);
        databaseCommand.Parameters.AddWithValue(command.ReporterAccountId.Value);
        databaseCommand.Parameters.AddWithValue(command.Region.Top);
        databaseCommand.Parameters.AddWithValue(command.Region.Left);
        databaseCommand.Parameters.AddWithValue(command.Region.Width);
        databaseCommand.Parameters.AddWithValue(command.Region.Height);
        databaseCommand.Parameters.AddWithValue(ToStorageValue(command.Reason));
        databaseCommand.Parameters.AddWithValue(command.Note ?? (object)DBNull.Value);
        databaseCommand.Parameters.AddWithValue(evidence.SnapshotJson);
        databaseCommand.Parameters.AddWithValue(evidence.EvidenceHash);
        databaseCommand.Parameters.AddWithValue(command.Client.Platform);
        databaseCommand.Parameters.AddWithValue(command.Client.AppVersion);
        databaseCommand.Parameters.AddWithValue(
            RedisReportRateLimiter.DeduplicationHash(command));
        databaseCommand.Parameters.AddWithValue(command.SubmittedAt);
        await databaseCommand.ExecuteNonQueryAsync(cancellationToken);
    }

    private static string ToStorageValue(Contracts.V1.ReportReason reason) =>
        reason switch
        {
            Contracts.V1.ReportReason.ExplicitSexualContent => "explicit_sexual_content",
            Contracts.V1.ReportReason.GraphicViolence => "graphic_violence",
            Contracts.V1.ReportReason.HateOrHarassment => "hate_or_harassment",
            Contracts.V1.ReportReason.Threat => "threat",
            Contracts.V1.ReportReason.IllegalContent => "illegal_content",
            Contracts.V1.ReportReason.Copyright => "copyright",
            Contracts.V1.ReportReason.Other => "other",
            _ => throw new ArgumentOutOfRangeException(nameof(reason))
        };
}
