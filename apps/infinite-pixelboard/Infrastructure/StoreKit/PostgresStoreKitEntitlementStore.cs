using Npgsql;
using PixelBoard.Application;
using PixelBoard.Contracts.V1;

namespace PixelBoard.Infrastructure.StoreKit;

public sealed class PostgresStoreKitEntitlementStore(NpgsqlDataSource dataSource)
    : IStoreKitEntitlementStore
{
    public async ValueTask<AppAccountToken> GetOrCreateAccountTokenAsync(
        AccountId accountId,
        CancellationToken cancellationToken = default)
    {
        const string sql =
            """
            INSERT INTO pixelboard.storekit_account_tokens (
                firebase_uid, app_account_token, created_at)
            VALUES ($1, $2, now())
            ON CONFLICT (firebase_uid) DO UPDATE
            SET firebase_uid = EXCLUDED.firebase_uid
            RETURNING app_account_token;
            """;
        await using var command = dataSource.CreateCommand(sql);
        command.Parameters.AddWithValue(accountId.Value);
        command.Parameters.AddWithValue(Guid.NewGuid());
        var token = (Guid)(await command.ExecuteScalarAsync(cancellationToken)
            ?? throw new InvalidOperationException("StoreKit account token was not returned."));
        return AppAccountToken.From(token);
    }

    public async ValueTask<bool> ApplyAsync(
        AccountId accountId,
        VerifiedStoreKitTransaction transaction,
        CancellationToken cancellationToken = default)
    {
        const string sql =
            """
            WITH expected_account AS (
                SELECT firebase_uid
                FROM pixelboard.storekit_account_tokens
                WHERE firebase_uid = $1
                  AND app_account_token = $2
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
                ON CONFLICT (transaction_id) DO NOTHING
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
        await using var command = dataSource.CreateCommand(sql);
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
        return (bool)(await command.ExecuteScalarAsync(cancellationToken) ?? false);
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
}
