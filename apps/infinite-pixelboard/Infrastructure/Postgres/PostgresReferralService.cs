using System.Security.Cryptography;
using System.Text;
using Npgsql;
using PixelBoard.Application;

namespace PixelBoard.Infrastructure.Postgres;

public sealed class PostgresReferralService(
    NpgsqlDataSource dataSource,
    TimeProvider timeProvider) : IReferralService, IPaintBoostService
{
    private const int CodeAttempts = 8;

    public async ValueTask<PaintBoostState?> GetAsync(
        AccountId accountId,
        CancellationToken cancellationToken = default)
    {
        const string sql =
            """
            SELECT cooldown_seconds, expires_at
            FROM pixelboard.paint_boosts
            WHERE firebase_uid = $1
              AND expires_at > $2;
            """;
        var now = timeProvider.GetUtcNow();
        await using var command = dataSource.CreateCommand(sql);
        command.Parameters.AddWithValue(accountId.Value);
        command.Parameters.AddWithValue(now);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return new PaintBoostState(
            reader.GetInt32(0),
            reader.GetFieldValue<DateTimeOffset>(1));
    }

    public async ValueTask<string?> GetOrCreateCodeAsync(
        AccountId accountId,
        CancellationToken cancellationToken = default)
    {
        var existing = await ReadCodeAsync(accountId, cancellationToken);
        if (existing is not null)
        {
            return existing;
        }

        for (var attempt = 0; attempt < CodeAttempts; attempt++)
        {
            var code = ReferralCode.Create();
            try
            {
                const string sql =
                    """
                    INSERT INTO pixelboard.referral_codes (firebase_uid, code, created_at)
                    SELECT $1, $2, now()
                    FROM pixelboard.accounts
                    WHERE firebase_uid = $1
                    ON CONFLICT (firebase_uid) DO NOTHING;
                    """;
                await using var command = dataSource.CreateCommand(sql);
                command.Parameters.AddWithValue(accountId.Value);
                command.Parameters.AddWithValue(code);
                await command.ExecuteNonQueryAsync(cancellationToken);
            }
            catch (PostgresException exception) when (exception.SqlState == PostgresErrorCodes.UniqueViolation)
            {
                continue;
            }

            return await ReadCodeAsync(accountId, cancellationToken);
        }

        return await ReadCodeAsync(accountId, cancellationToken);
    }

    public async ValueTask<ReferralClaimOutcome> ClaimAsync(
        AccountId refereeAccountId,
        string? code,
        CancellationToken cancellationToken = default)
    {
        if (!ReferralCode.TryNormalize(code, out var normalized))
        {
            return ReferralClaimOutcome.InvalidCode;
        }

        var now = timeProvider.GetUtcNow();
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);

        if (await IsDeletedAsync(connection, transaction, refereeAccountId, cancellationToken))
        {
            return ReferralClaimOutcome.AccountDeleted;
        }

        if (!await AccountExistsAsync(connection, transaction, refereeAccountId, cancellationToken))
        {
            return ReferralClaimOutcome.CommunityStandardsRequired;
        }

        var referrerUid = await FindReferrerAsync(
            connection,
            transaction,
            normalized,
            cancellationToken);
        if (referrerUid is null)
        {
            return ReferralClaimOutcome.InvalidCode;
        }

        if (string.Equals(referrerUid, refereeAccountId.Value, StringComparison.Ordinal))
        {
            return ReferralClaimOutcome.OwnCode;
        }

        var referrer = new AccountId(referrerUid);
        await LockAccountsAsync(
            connection,
            transaction,
            [refereeAccountId, referrer],
            cancellationToken);

        if (await AlreadyClaimedAsync(connection, transaction, refereeAccountId, cancellationToken))
        {
            return ReferralClaimOutcome.AlreadyClaimed;
        }

        if (await DailyCapReachedAsync(connection, transaction, referrer, now, cancellationToken))
        {
            return ReferralClaimOutcome.LimitReached;
        }

        await InsertAttributionAsync(
            connection,
            transaction,
            refereeAccountId,
            referrer,
            normalized,
            now,
            cancellationToken);
        await UpsertBoostAsync(
            connection,
            transaction,
            refereeAccountId,
            PlacementCooldown.RefereeSeconds,
            now,
            cancellationToken);
        await UpsertBoostAsync(
            connection,
            transaction,
            referrer,
            PlacementCooldown.ReferrerSeconds,
            now,
            cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return ReferralClaimOutcome.Granted;
    }

    private async Task<string?> ReadCodeAsync(
        AccountId accountId,
        CancellationToken cancellationToken)
    {
        const string sql =
            """
            SELECT code
            FROM pixelboard.referral_codes
            WHERE firebase_uid = $1;
            """;
        await using var command = dataSource.CreateCommand(sql);
        command.Parameters.AddWithValue(accountId.Value);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result as string;
    }

    private static async Task<bool> IsDeletedAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        AccountId accountId,
        CancellationToken cancellationToken)
    {
        const string sql =
            """
            SELECT EXISTS (
                SELECT 1
                FROM pixelboard.deleted_accounts
                WHERE account_hash = $1
            );
            """;
        await using var command = new NpgsqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue(AccountHash(accountId));
        return (bool)(await command.ExecuteScalarAsync(cancellationToken) ?? false);
    }

    private static async Task<bool> AccountExistsAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        AccountId accountId,
        CancellationToken cancellationToken)
    {
        const string sql =
            """
            SELECT EXISTS (
                SELECT 1
                FROM pixelboard.accounts
                WHERE firebase_uid = $1
            );
            """;
        await using var command = new NpgsqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue(accountId.Value);
        return (bool)(await command.ExecuteScalarAsync(cancellationToken) ?? false);
    }

    private static async Task<string?> FindReferrerAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        string code,
        CancellationToken cancellationToken)
    {
        const string sql =
            """
            SELECT firebase_uid
            FROM pixelboard.referral_codes
            WHERE code = $1;
            """;
        await using var command = new NpgsqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue(code);
        return await command.ExecuteScalarAsync(cancellationToken) as string;
    }

    private static async Task LockAccountsAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        IReadOnlyList<AccountId> accountIds,
        CancellationToken cancellationToken)
    {
        var hashes = accountIds
            .Select(AccountHash)
            .Distinct(ByteArrayComparer.Instance)
            .Order(ByteArrayComparer.Instance);
        foreach (var hash in hashes)
        {
            await PostgresAccountLock.AcquireAsync(
                connection,
                transaction,
                hash,
                cancellationToken);
        }
    }

    private static async Task<bool> AlreadyClaimedAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        AccountId refereeAccountId,
        CancellationToken cancellationToken)
    {
        const string sql =
            """
            SELECT EXISTS (
                SELECT 1
                FROM pixelboard.referral_attributions
                WHERE referee_firebase_uid = $1
            );
            """;
        await using var command = new NpgsqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue(refereeAccountId.Value);
        return (bool)(await command.ExecuteScalarAsync(cancellationToken) ?? false);
    }

    private static async Task<bool> DailyCapReachedAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        AccountId referrer,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        const string sql =
            """
            SELECT COUNT(*)
            FROM pixelboard.referral_attributions
            WHERE referrer_firebase_uid = $1
              AND created_at > $2;
            """;
        await using var command = new NpgsqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue(referrer.Value);
        command.Parameters.AddWithValue(now.AddHours(-24));
        var count = (long)(await command.ExecuteScalarAsync(cancellationToken) ?? 0L);
        return count >= PlacementCooldown.DailyReferralCap;
    }

    private static async Task InsertAttributionAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        AccountId referee,
        AccountId referrer,
        string code,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        const string sql =
            """
            INSERT INTO pixelboard.referral_attributions (
                referee_firebase_uid,
                referrer_firebase_uid,
                code,
                created_at)
            VALUES ($1, $2, $3, $4);
            """;
        await using var command = new NpgsqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue(referee.Value);
        command.Parameters.AddWithValue(referrer.Value);
        command.Parameters.AddWithValue(code);
        command.Parameters.AddWithValue(now);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task UpsertBoostAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        AccountId accountId,
        int cooldownSeconds,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        DateTimeOffset? existingExpiry = null;
        int? existingCooldown = null;
        const string selectSql =
            """
            SELECT cooldown_seconds, expires_at
            FROM pixelboard.paint_boosts
            WHERE firebase_uid = $1
            FOR UPDATE;
            """;
        await using (var select = new NpgsqlCommand(selectSql, connection, transaction))
        {
            select.Parameters.AddWithValue(accountId.Value);
            await using var reader = await select.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                existingCooldown = reader.GetInt32(0);
                existingExpiry = reader.GetFieldValue<DateTimeOffset>(1);
            }
        }

        var expiresAt = PlacementCooldown.ExtendExpiry(
            existingExpiry,
            now,
            TimeSpan.FromHours(PlacementCooldown.BoostDurationHours));
        var resolvedCooldown = existingExpiry is { } expiry
            && expiry > now
            && existingCooldown is { } current
                ? Math.Min(current, cooldownSeconds)
                : cooldownSeconds;

        const string upsertSql =
            """
            INSERT INTO pixelboard.paint_boosts (
                firebase_uid,
                cooldown_seconds,
                expires_at,
                updated_at)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (firebase_uid) DO UPDATE SET
                cooldown_seconds = EXCLUDED.cooldown_seconds,
                expires_at = EXCLUDED.expires_at,
                updated_at = EXCLUDED.updated_at;
            """;
        await using var upsert = new NpgsqlCommand(upsertSql, connection, transaction);
        upsert.Parameters.AddWithValue(accountId.Value);
        upsert.Parameters.AddWithValue(resolvedCooldown);
        upsert.Parameters.AddWithValue(expiresAt);
        upsert.Parameters.AddWithValue(now);
        await upsert.ExecuteNonQueryAsync(cancellationToken);
    }

    private static byte[] AccountHash(AccountId accountId) =>
        SHA256.HashData(Encoding.UTF8.GetBytes(accountId.Value));

    private sealed class ByteArrayComparer : IComparer<byte[]>, IEqualityComparer<byte[]>
    {
        public static ByteArrayComparer Instance { get; } = new();

        public int Compare(byte[]? left, byte[]? right) =>
            left is null && right is null ? 0
            : left is null ? -1
            : right is null ? 1
            : left.AsSpan().SequenceCompareTo(right);

        public bool Equals(byte[]? left, byte[]? right) =>
            left is null ? right is null : right is not null && left.AsSpan().SequenceEqual(right);

        public int GetHashCode(byte[] value) => Convert.ToHexString(value).GetHashCode();
    }
}
