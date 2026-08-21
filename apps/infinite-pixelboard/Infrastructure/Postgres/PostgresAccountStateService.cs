using Npgsql;
using System.Security.Cryptography;
using System.Text;
using PixelBoard.Application;
using PixelBoard.Contracts.V1;

namespace PixelBoard.Infrastructure.Postgres;

public sealed class PostgresAccountStateService(NpgsqlDataSource dataSource)
    : IAccountPolicyService, IEntitlementService
{
    public async ValueTask<AccountPolicyState> GetAsync(
        AccountId accountId,
        string requiredCommunityStandardsVersion,
        CancellationToken cancellationToken = default)
    {
        const string sql =
            """
            SELECT
                EXISTS (
                    SELECT 1
                    FROM pixelboard.deleted_accounts
                    WHERE account_hash = $3
                ),
                EXISTS (
                    SELECT 1
                    FROM pixelboard.account_bans
                    WHERE firebase_uid = $1
                      AND starts_at <= now()
                      AND revoked_at IS NULL
                      AND (expires_at IS NULL OR expires_at > now())
                ),
                COALESCE((
                    SELECT community_standards_version = $2
                    FROM pixelboard.accounts
                    WHERE firebase_uid = $1
                ), false);
            """;
        await using var command = dataSource.CreateCommand(sql);
        command.Parameters.AddWithValue(accountId.Value);
        command.Parameters.AddWithValue(requiredCommunityStandardsVersion);
        command.Parameters.AddWithValue(AccountHash(accountId));
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        await reader.ReadAsync(cancellationToken);
        return new AccountPolicyState(
            reader.GetBoolean(0) || reader.GetBoolean(1),
            !reader.GetBoolean(0) && reader.GetBoolean(2));
    }

    public async ValueTask AcceptCommunityStandardsAsync(
        AccountId accountId,
        string version,
        CancellationToken cancellationToken = default)
    {
        const string sql =
            """
            INSERT INTO pixelboard.accounts (
                firebase_uid,
                community_standards_version,
                community_standards_accepted_at,
                updated_at)
            SELECT $1, $2, now(), now()
            WHERE NOT EXISTS (
                SELECT 1
                FROM pixelboard.deleted_accounts
                WHERE account_hash = $3
            )
            ON CONFLICT (firebase_uid) DO UPDATE SET
                community_standards_version = EXCLUDED.community_standards_version,
                community_standards_accepted_at = EXCLUDED.community_standards_accepted_at,
                updated_at = EXCLUDED.updated_at;
            """;
        await using var command = dataSource.CreateCommand(sql);
        command.Parameters.AddWithValue(accountId.Value);
        command.Parameters.AddWithValue(version);
        command.Parameters.AddWithValue(AccountHash(accountId));
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    async ValueTask<EntitlementState> IEntitlementService.GetAsync(
        AccountId accountId,
        CancellationToken cancellationToken)
    {
        const string sql =
            """
            SELECT tier, expires_at
            FROM pixelboard.entitlements
            WHERE firebase_uid = $1
              AND revoked_at IS NULL
              AND (expires_at IS NULL OR expires_at > now());
            """;
        await using var command = dataSource.CreateCommand(sql);
        command.Parameters.AddWithValue(accountId.Value);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return new EntitlementState(AccountTier.Free, null);
        }

        var tier = string.Equals(reader.GetString(0), "pro", StringComparison.OrdinalIgnoreCase)
            ? AccountTier.Pro
            : AccountTier.Free;
        return new EntitlementState(
            tier,
            reader.IsDBNull(1) ? null : reader.GetFieldValue<DateTimeOffset>(1));
    }

    private static byte[] AccountHash(AccountId accountId) =>
        SHA256.HashData(Encoding.UTF8.GetBytes(accountId.Value));
}
