using Npgsql;
using System.Security.Cryptography;
using System.Text;
using PixelBoard.Application;
using PixelBoard.Contracts.V1;
using PixelBoard.Infrastructure.Postgres;

namespace PixelBoard.Infrastructure.StoreKit;

public sealed class PostgresStoreKitEntitlementStore(NpgsqlDataSource dataSource)
    : IStoreKitEntitlementStore
{
    public async ValueTask<AppAccountToken?> GetOrCreateAccountTokenAsync(
        AccountId accountId,
        CancellationToken cancellationToken = default)
    {
        var accountHash = AccountHash(accountId);
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        await PostgresAccountLock.AcquireAsync(
            connection,
            transaction,
            accountHash,
            cancellationToken);
        const string sql =
            """
            INSERT INTO pixelboard.storekit_account_tokens (
                firebase_uid, app_account_token, created_at)
            SELECT $1, $2, now()
            WHERE NOT EXISTS (
                SELECT 1
                FROM pixelboard.deleted_accounts
                WHERE account_hash = $3
            )
            ON CONFLICT (firebase_uid) DO UPDATE
            SET firebase_uid = EXCLUDED.firebase_uid
            RETURNING app_account_token;
            """;
        await using var command = new NpgsqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue(accountId.Value);
        command.Parameters.AddWithValue(Guid.NewGuid());
        command.Parameters.AddWithValue(accountHash);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return result is Guid token ? AppAccountToken.From(token) : null;
    }

    public async ValueTask<bool> ApplyAsync(
        AccountId accountId,
        VerifiedStoreKitTransaction transaction,
        CancellationToken cancellationToken = default)
    {
        var accountHash = AccountHash(accountId);
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var databaseTransaction =
            await connection.BeginTransactionAsync(cancellationToken);
        await PostgresAccountLock.AcquireAsync(
            connection,
            databaseTransaction,
            accountHash,
            cancellationToken);
        const string sql =
            """
            WITH expected_account AS (
                SELECT firebase_uid
                FROM pixelboard.storekit_account_tokens
                WHERE firebase_uid = $1
                  AND app_account_token = $2
                  AND NOT EXISTS (
                      SELECT 1
                      FROM pixelboard.deleted_accounts
                      WHERE account_hash = $10
                  )
            ),
            claimed_subscription AS (
                INSERT INTO pixelboard.storekit_subscription_owners (
                    original_transaction_id, firebase_uid, app_account_token, created_at)
                SELECT $3, firebase_uid, $2, now()
                FROM expected_account
                ON CONFLICT (original_transaction_id) DO NOTHING
                RETURNING firebase_uid
            ),
            owned_subscription AS (
                SELECT firebase_uid
                FROM claimed_subscription
                UNION ALL
                SELECT firebase_uid
                FROM pixelboard.storekit_subscription_owners
                WHERE original_transaction_id = $3
                  AND firebase_uid = $1
                  AND app_account_token = $2
                LIMIT 1
            ),
            recorded_transaction AS (
                INSERT INTO pixelboard.storekit_transactions (
                    transaction_id,
                    original_transaction_id,
                    firebase_uid,
                    product_id,
                    environment,
                    signed_at,
                    expires_at,
                    revoked_at,
                    received_at)
                SELECT $4, $3, firebase_uid, $5, $6, $7, $8, $9, now()
                FROM owned_subscription
                ON CONFLICT (transaction_id) DO UPDATE SET
                    product_id = EXCLUDED.product_id,
                    environment = EXCLUDED.environment,
                    signed_at = EXCLUDED.signed_at,
                    expires_at = EXCLUDED.expires_at,
                    revoked_at = EXCLUDED.revoked_at,
                    received_at = EXCLUDED.received_at
                WHERE pixelboard.storekit_transactions.firebase_uid = EXCLUDED.firebase_uid
                  AND pixelboard.storekit_transactions.original_transaction_id =
                      EXCLUDED.original_transaction_id
                  AND EXCLUDED.signed_at >= pixelboard.storekit_transactions.signed_at
                RETURNING firebase_uid
            ),
            applied AS (
                INSERT INTO pixelboard.entitlements (
                    firebase_uid,
                    tier,
                    source,
                    source_transaction_id,
                    source_signed_at,
                    expires_at,
                    revoked_at,
                    updated_at)
                SELECT firebase_uid, 'pro', 'storekit', $3, $7, $8, $9, now()
                FROM recorded_transaction
                ON CONFLICT (firebase_uid) DO UPDATE SET
                    tier = EXCLUDED.tier,
                    source = EXCLUDED.source,
                    source_transaction_id = EXCLUDED.source_transaction_id,
                    source_signed_at = EXCLUDED.source_signed_at,
                    expires_at = EXCLUDED.expires_at,
                    revoked_at = EXCLUDED.revoked_at,
                    updated_at = EXCLUDED.updated_at
                WHERE pixelboard.entitlements.source_signed_at IS NULL
                   OR EXCLUDED.source_signed_at >= pixelboard.entitlements.source_signed_at
                RETURNING firebase_uid
            )
            SELECT EXISTS (SELECT 1 FROM owned_subscription);
            """;
        await using var command = new NpgsqlCommand(sql, connection, databaseTransaction);
        command.Parameters.AddWithValue(accountId.Value);
        command.Parameters.AddWithValue(transaction.AppAccountToken.Value);
        command.Parameters.AddWithValue(transaction.OriginalTransactionId);
        command.Parameters.AddWithValue(transaction.TransactionId);
        command.Parameters.AddWithValue(transaction.ProductId);
        command.Parameters.AddWithValue(transaction.Environment);
        command.Parameters.AddWithValue(transaction.SignedAt);
        command.Parameters.AddWithValue(transaction.ExpiresAt);
        command.Parameters.AddWithValue(
            transaction.RevokedAt.HasValue ? transaction.RevokedAt.Value : DBNull.Value);
        command.Parameters.AddWithValue(accountHash);
        var applied = (bool)(await command.ExecuteScalarAsync(cancellationToken) ?? false);
        await databaseTransaction.CommitAsync(cancellationToken);
        return applied;
    }

    public async ValueTask<bool> ApplyNotificationAsync(
        VerifiedStoreKitTransaction transaction,
        CancellationToken cancellationToken = default)
    {
        const string sql =
            """
            SELECT firebase_uid
            FROM pixelboard.storekit_account_tokens
            WHERE app_account_token = $1;
            """;
        await using var command = dataSource.CreateCommand(sql);
        command.Parameters.AddWithValue(transaction.AppAccountToken.Value);
        var firebaseUid = await command.ExecuteScalarAsync(cancellationToken) as string;
        return firebaseUid is not null
            && await ApplyAsync(
                new AccountId(firebaseUid),
                transaction,
                cancellationToken);
    }

    private static byte[] AccountHash(AccountId accountId) =>
        SHA256.HashData(Encoding.UTF8.GetBytes(accountId.Value));
}
