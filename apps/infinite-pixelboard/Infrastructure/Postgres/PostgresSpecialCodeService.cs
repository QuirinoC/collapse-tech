using System.Security.Cryptography;
using System.Text;
using Npgsql;
using PixelBoard.Application;

namespace PixelBoard.Infrastructure.Postgres;

public sealed class PostgresSpecialCodeService(
    NpgsqlDataSource dataSource,
    TimeProvider timeProvider) : ISpecialCodeService
{
    private const int CodeAttempts = 8;

    public async ValueTask<SpecialCodeClaimOutcome> RedeemAsync(
        AccountId accountId,
        string? code,
        CancellationToken cancellationToken = default)
    {
        if (!SpecialCode.TryNormalize(code, out var normalized))
        {
            return SpecialCodeClaimOutcome.InvalidCode;
        }

        var now = timeProvider.GetUtcNow();
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);

        if (await IsDeletedAsync(connection, transaction, accountId, cancellationToken))
        {
            return SpecialCodeClaimOutcome.AccountDeleted;
        }

        if (!await AccountExistsAsync(connection, transaction, accountId, cancellationToken))
        {
            return SpecialCodeClaimOutcome.CommunityStandardsRequired;
        }

        await PostgresAccountLock.AcquireAsync(
            connection,
            transaction,
            AccountHash(accountId),
            cancellationToken);

        var definition = await ReadCodeForUpdateAsync(
            connection,
            transaction,
            normalized,
            cancellationToken);
        if (definition is null)
        {
            // Not a special code — caller may fall through to referral redeem.
            await transaction.RollbackAsync(cancellationToken);
            return SpecialCodeClaimOutcome.NotSpecialCode;
        }

        if (definition.CodeExpiresAt is { } codeExpiry && codeExpiry <= now)
        {
            return SpecialCodeClaimOutcome.CodeExpired;
        }

        DateTimeOffset benefitExpiresAt;
        try
        {
            benefitExpiresAt = PlacementCooldown.ResolveSpecialBenefitExpiry(
                now,
                definition.BenefitDurationSeconds,
                definition.BenefitExpiresAt);
        }
        catch (ArgumentException)
        {
            return SpecialCodeClaimOutcome.InvalidCode;
        }

        if (benefitExpiresAt <= now)
        {
            return SpecialCodeClaimOutcome.BenefitExpired;
        }

        if (await AlreadyRedeemedAsync(
                connection,
                transaction,
                normalized,
                accountId,
                cancellationToken))
        {
            return SpecialCodeClaimOutcome.AlreadyRedeemed;
        }

        await InsertRedemptionAsync(
            connection,
            transaction,
            normalized,
            accountId,
            now,
            benefitExpiresAt,
            cancellationToken);
        await UpsertBoostAsync(
            connection,
            transaction,
            accountId,
            definition.CooldownSeconds,
            now,
            benefitExpiresAt,
            cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return SpecialCodeClaimOutcome.Granted;
    }

    public async ValueTask<SpecialCodeCreateResult> CreateAsync(
        AccountId actorAccountId,
        CreateSpecialCodeCommand command,
        CancellationToken cancellationToken = default)
    {
        if (command.CooldownSeconds is < 0 or > 10)
        {
            return new SpecialCodeCreateResult(
                SpecialCodeCreateOutcome.InvalidRequest,
                ErrorMessage: "cooldownSeconds must be between 0 and 10.");
        }

        if (command.BenefitDurationSeconds is null && command.BenefitExpiresAt is null)
        {
            return new SpecialCodeCreateResult(
                SpecialCodeCreateOutcome.InvalidRequest,
                ErrorMessage: "Provide benefitDurationSeconds and/or benefitExpiresAt.");
        }

        if (command.BenefitDurationSeconds is <= 0)
        {
            return new SpecialCodeCreateResult(
                SpecialCodeCreateOutcome.InvalidRequest,
                ErrorMessage: "benefitDurationSeconds must be positive when set.");
        }

        string? requested = null;
        if (!string.IsNullOrWhiteSpace(command.Code))
        {
            if (!SpecialCode.TryNormalize(command.Code, out var normalized))
            {
                return new SpecialCodeCreateResult(
                    SpecialCodeCreateOutcome.InvalidRequest,
                    ErrorMessage: "Code must be 4–16 characters from the invite alphabet.");
            }

            requested = normalized;
        }

        var now = timeProvider.GetUtcNow();
        if (command.CodeExpiresAt is { } codeExpiry && codeExpiry <= now)
        {
            return new SpecialCodeCreateResult(
                SpecialCodeCreateOutcome.InvalidRequest,
                ErrorMessage: "codeExpiresAt must be in the future.");
        }

        if (command.BenefitExpiresAt is { } benefitExpiry && benefitExpiry <= now)
        {
            return new SpecialCodeCreateResult(
                SpecialCodeCreateOutcome.InvalidRequest,
                ErrorMessage: "benefitExpiresAt must be in the future.");
        }

        var note = string.IsNullOrWhiteSpace(command.Note)
            ? null
            : command.Note.Trim();
        if (note is { Length: > 200 })
        {
            return new SpecialCodeCreateResult(
                SpecialCodeCreateOutcome.InvalidRequest,
                ErrorMessage: "note must be at most 200 characters.");
        }

        for (var attempt = 0; attempt < CodeAttempts; attempt++)
        {
            var code = requested ?? SpecialCode.Create();
            try
            {
                const string sql =
                    """
                    INSERT INTO pixelboard.special_codes (
                        code,
                        cooldown_seconds,
                        code_expires_at,
                        benefit_duration_seconds,
                        benefit_expires_at,
                        created_by_firebase_uid,
                        note,
                        created_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    RETURNING
                        code,
                        cooldown_seconds,
                        code_expires_at,
                        benefit_duration_seconds,
                        benefit_expires_at,
                        note,
                        created_at;
                    """;
                await using var insert = dataSource.CreateCommand(sql);
                insert.Parameters.AddWithValue(code);
                insert.Parameters.AddWithValue(command.CooldownSeconds);
                insert.Parameters.AddWithValue(
                    (object?)command.CodeExpiresAt ?? DBNull.Value);
                insert.Parameters.AddWithValue(
                    (object?)command.BenefitDurationSeconds ?? DBNull.Value);
                insert.Parameters.AddWithValue(
                    (object?)command.BenefitExpiresAt ?? DBNull.Value);
                insert.Parameters.AddWithValue(actorAccountId.Value);
                insert.Parameters.AddWithValue((object?)note ?? DBNull.Value);
                insert.Parameters.AddWithValue(now);
                await using var reader = await insert.ExecuteReaderAsync(cancellationToken);
                if (!await reader.ReadAsync(cancellationToken))
                {
                    return new SpecialCodeCreateResult(
                        SpecialCodeCreateOutcome.InvalidRequest,
                        ErrorMessage: "The special code could not be created.");
                }

                return new SpecialCodeCreateResult(
                    SpecialCodeCreateOutcome.Created,
                    new SpecialCodeDefinition(
                        reader.GetString(0),
                        reader.GetInt32(1),
                        reader.IsDBNull(2)
                            ? null
                            : reader.GetFieldValue<DateTimeOffset>(2),
                        reader.IsDBNull(3) ? null : reader.GetInt32(3),
                        reader.IsDBNull(4)
                            ? null
                            : reader.GetFieldValue<DateTimeOffset>(4),
                        reader.IsDBNull(5) ? null : reader.GetString(5),
                        reader.GetFieldValue<DateTimeOffset>(6)));
            }
            catch (PostgresException exception)
                when (exception.SqlState == PostgresErrorCodes.UniqueViolation)
            {
                if (requested is not null)
                {
                    return new SpecialCodeCreateResult(
                        SpecialCodeCreateOutcome.CodeConflict,
                        ErrorMessage: "That special code already exists.");
                }
            }
        }

        return new SpecialCodeCreateResult(
            SpecialCodeCreateOutcome.InvalidRequest,
            ErrorMessage: "Could not allocate a unique special code.");
    }

    private static async Task<SpecialCodeDefinition?> ReadCodeForUpdateAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        string code,
        CancellationToken cancellationToken)
    {
        const string sql =
            """
            SELECT
                code,
                cooldown_seconds,
                code_expires_at,
                benefit_duration_seconds,
                benefit_expires_at,
                note,
                created_at
            FROM pixelboard.special_codes
            WHERE code = $1
            FOR UPDATE;
            """;
        await using var command = new NpgsqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue(code);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return new SpecialCodeDefinition(
            reader.GetString(0),
            reader.GetInt32(1),
            reader.IsDBNull(2) ? null : reader.GetFieldValue<DateTimeOffset>(2),
            reader.IsDBNull(3) ? null : reader.GetInt32(3),
            reader.IsDBNull(4) ? null : reader.GetFieldValue<DateTimeOffset>(4),
            reader.IsDBNull(5) ? null : reader.GetString(5),
            reader.GetFieldValue<DateTimeOffset>(6));
    }

    private static async Task<bool> AlreadyRedeemedAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        string code,
        AccountId accountId,
        CancellationToken cancellationToken)
    {
        const string sql =
            """
            SELECT EXISTS (
                SELECT 1
                FROM pixelboard.special_code_redemptions
                WHERE code = $1
                  AND firebase_uid = $2
            );
            """;
        await using var command = new NpgsqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue(code);
        command.Parameters.AddWithValue(accountId.Value);
        return (bool)(await command.ExecuteScalarAsync(cancellationToken) ?? false);
    }

    private static async Task InsertRedemptionAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        string code,
        AccountId accountId,
        DateTimeOffset redeemedAt,
        DateTimeOffset benefitExpiresAt,
        CancellationToken cancellationToken)
    {
        const string sql =
            """
            INSERT INTO pixelboard.special_code_redemptions (
                code,
                firebase_uid,
                redeemed_at,
                benefit_expires_at)
            VALUES ($1, $2, $3, $4);
            """;
        await using var command = new NpgsqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue(code);
        command.Parameters.AddWithValue(accountId.Value);
        command.Parameters.AddWithValue(redeemedAt);
        command.Parameters.AddWithValue(benefitExpiresAt);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task UpsertBoostAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        AccountId accountId,
        int cooldownSeconds,
        DateTimeOffset now,
        DateTimeOffset benefitExpiresAt,
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

        var expiresAt = existingExpiry is { } expiry && expiry > now
            ? (expiry > benefitExpiresAt ? expiry : benefitExpiresAt)
            : benefitExpiresAt;
        var resolvedCooldown = existingExpiry is { } activeExpiry
            && activeExpiry > now
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

    private static byte[] AccountHash(AccountId accountId) =>
        SHA256.HashData(Encoding.UTF8.GetBytes(accountId.Value));
}
