using Npgsql;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using PixelBoard.Application;
using PixelBoard.Infrastructure.Postgres;

namespace PixelBoard.Infrastructure.Moderation;

public sealed class PostgresReportStore(NpgsqlDataSource dataSource) : IReportStore
{
    private static readonly JsonSerializerOptions JsonOptions =
        new(JsonSerializerDefaults.Web);

    public async ValueTask<bool> SaveAsync(
        ReportCommand command,
        ReportEvidence evidence,
        CancellationToken cancellationToken = default)
    {
        var snapshot = JsonNode.Parse(evidence.SnapshotJson) as JsonObject
            ?? throw new JsonException("Report evidence must be a JSON object.");
        var attributedPlacements = GetAttributedPlacements(snapshot);
        var identities = attributedPlacements
            .Select(placement => placement["firebaseUid"]?.GetValue<string>())
            .Append(command.ReporterAccountId.Value)
            .Where(identity => !string.IsNullOrWhiteSpace(identity)
                               && !identity.StartsWith("deleted:", StringComparison.Ordinal))
            .Distinct(StringComparer.Ordinal)
            .Select(identity => new LockedAccount(
                identity!,
                SHA256.HashData(Encoding.UTF8.GetBytes(identity!))))
            .OrderBy(identity => Convert.ToHexString(identity.Hash), StringComparer.Ordinal)
            .ToArray();
        var accountHash = identities
            .Single(identity => identity.AccountId == command.ReporterAccountId.Value)
            .Hash;
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        foreach (var identity in identities)
        {
            await PostgresAccountLock.AcquireAsync(
                connection,
                transaction,
                identity.Hash,
                cancellationToken);
        }
        var anonymizedAccounts = await GetAnonymizedAccountsAsync(
            connection,
            transaction,
            identities,
            cancellationToken);
        var evidenceChanged = false;
        foreach (var placement in attributedPlacements)
        {
            var accountId = placement["firebaseUid"]?.GetValue<string>();
            if (accountId is not null
                && anonymizedAccounts.TryGetValue(accountId, out var anonymizedId))
            {
                placement["firebaseUid"] = anonymizedId;
                evidenceChanged = true;
            }
        }
        var snapshotJson = evidenceChanged
            ? snapshot.ToJsonString(JsonOptions)
            : evidence.SnapshotJson;
        var evidenceHash = evidenceChanged
            ? SHA256.HashData(Encoding.UTF8.GetBytes(snapshotJson))
            : evidence.EvidenceHash;
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
            SELECT
                $1, $2, $3, $4, $5, $6, $7, $8, 'received', $9::jsonb, $10,
                $11, $12, $13, $14, $14
            WHERE NOT EXISTS (
                SELECT 1
                FROM pixelboard.deleted_accounts
                WHERE account_hash = $15
            );
            """;
        await using var databaseCommand = new NpgsqlCommand(sql, connection, transaction);
        databaseCommand.Parameters.AddWithValue(command.ReportId.Value);
        databaseCommand.Parameters.AddWithValue(command.ReporterAccountId.Value);
        databaseCommand.Parameters.AddWithValue(command.Region.Top);
        databaseCommand.Parameters.AddWithValue(command.Region.Left);
        databaseCommand.Parameters.AddWithValue(command.Region.Width);
        databaseCommand.Parameters.AddWithValue(command.Region.Height);
        databaseCommand.Parameters.AddWithValue(ToStorageValue(command.Reason));
        databaseCommand.Parameters.AddWithValue(command.Note ?? (object)DBNull.Value);
        databaseCommand.Parameters.AddWithValue(snapshotJson);
        databaseCommand.Parameters.AddWithValue(evidenceHash);
        databaseCommand.Parameters.AddWithValue(command.Client.Platform);
        databaseCommand.Parameters.AddWithValue(command.Client.AppVersion);
        databaseCommand.Parameters.AddWithValue(
            RedisReportRateLimiter.DeduplicationHash(command));
        databaseCommand.Parameters.AddWithValue(command.SubmittedAt);
        databaseCommand.Parameters.AddWithValue(accountHash);
        var saved = await databaseCommand.ExecuteNonQueryAsync(cancellationToken) == 1;
        await transaction.CommitAsync(cancellationToken);
        return saved;
    }

    private static List<JsonObject> GetAttributedPlacements(JsonObject snapshot)
    {
        if (snapshot["recentAttributedPlacements"] is not JsonArray placements)
        {
            return [];
        }

        return placements.OfType<JsonObject>().ToList();
    }

    private static async ValueTask<Dictionary<string, string>> GetAnonymizedAccountsAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        IReadOnlyList<LockedAccount> identities,
        CancellationToken cancellationToken)
    {
        const string sql =
            """
            SELECT account_hash, anonymized_id
            FROM pixelboard.deleted_accounts
            WHERE account_hash = ANY($1);
            """;
        await using var command = new NpgsqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue(identities.Select(identity => identity.Hash).ToArray());
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var byHash = new Dictionary<string, string>(StringComparer.Ordinal);
        while (await reader.ReadAsync(cancellationToken))
        {
            byHash[Convert.ToHexString(reader.GetFieldValue<byte[]>(0))] = reader.GetString(1);
        }

        return identities
            .Where(identity => byHash.ContainsKey(Convert.ToHexString(identity.Hash)))
            .ToDictionary(
                identity => identity.AccountId,
                identity => byHash[Convert.ToHexString(identity.Hash)],
                StringComparer.Ordinal);
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

    private sealed record LockedAccount(string AccountId, byte[] Hash);
}
