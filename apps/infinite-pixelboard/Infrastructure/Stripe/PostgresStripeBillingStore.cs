using System.Security.Cryptography;
using System.Text;
using Npgsql;
using PixelBoard.Application;
using PixelBoard.Contracts.V1;
using PixelBoard.Infrastructure.Postgres;

namespace PixelBoard.Infrastructure.Stripe;

public sealed class PostgresStripeBillingStore(NpgsqlDataSource dataSource) : IStripeBillingStore
{
    public async ValueTask<string?> GetCustomerIdAsync(
        AccountId accountId,
        CancellationToken cancellationToken = default)
    {
        const string sql =
            """
            SELECT stripe_customer_id
            FROM pixelboard.stripe_customers
            WHERE firebase_uid = $1;
            """;
        await using var command = dataSource.CreateCommand(sql);
        command.Parameters.AddWithValue(accountId.Value);
        return await command.ExecuteScalarAsync(cancellationToken) as string;
    }

    public async ValueTask<bool> HasCustomerAsync(
        AccountId accountId,
        CancellationToken cancellationToken = default)
    {
        const string sql =
            """
            SELECT EXISTS (
                SELECT 1
                FROM pixelboard.stripe_customers
                WHERE firebase_uid = $1
            );
            """;
        await using var command = dataSource.CreateCommand(sql);
        command.Parameters.AddWithValue(accountId.Value);
        return (bool)(await command.ExecuteScalarAsync(cancellationToken) ?? false);
    }

    public async ValueTask<string?> GetCurrentPriceIdAsync(
        AccountId accountId,
        CancellationToken cancellationToken = default)
    {
        const string sql =
            """
            SELECT price_id
            FROM pixelboard.stripe_subscriptions
            WHERE firebase_uid = $1
              AND status IN ('active', 'trialing', 'past_due')
              AND current_period_end > now()
            ORDER BY event_at DESC
            LIMIT 1;
            """;
        await using var command = dataSource.CreateCommand(sql);
        command.Parameters.AddWithValue(accountId.Value);
        return await command.ExecuteScalarAsync(cancellationToken) as string;
    }

    public async ValueTask<bool> CanClaimStripeTrialAsync(
        AccountId accountId,
        CancellationToken cancellationToken = default)
    {
        const string sql =
            """
            SELECT NOT EXISTS (
                SELECT 1
                FROM pixelboard.deleted_accounts
                WHERE account_hash = $2
            )
            AND NOT EXISTS (
                SELECT 1
                FROM pixelboard.stripe_trial_claims
                WHERE firebase_uid = $1
            )
            AND NOT EXISTS (
                SELECT 1
                FROM pixelboard.stripe_subscriptions
                WHERE firebase_uid = $1
            );
            """;
        await using var command = dataSource.CreateCommand(sql);
        command.Parameters.AddWithValue(accountId.Value);
        command.Parameters.AddWithValue(AccountHash(accountId));
        return (bool)(await command.ExecuteScalarAsync(cancellationToken) ?? false);
    }

    public async ValueTask<bool> TryClaimStripeTrialAsync(
        AccountId accountId,
        CancellationToken cancellationToken = default)
    {
        const string sql =
            """
            INSERT INTO pixelboard.stripe_trial_claims (firebase_uid, claimed_at)
            SELECT $1, now()
            WHERE NOT EXISTS (
                SELECT 1
                FROM pixelboard.deleted_accounts
                WHERE account_hash = $2
            )
            AND NOT EXISTS (
                SELECT 1
                FROM pixelboard.stripe_subscriptions
                WHERE firebase_uid = $1
            )
            ON CONFLICT (firebase_uid) DO NOTHING
            RETURNING firebase_uid;
            """;
        await using var command = dataSource.CreateCommand(sql);
        command.Parameters.AddWithValue(accountId.Value);
        command.Parameters.AddWithValue(AccountHash(accountId));
        return await command.ExecuteScalarAsync(cancellationToken) is not null;
    }

    public async ValueTask<string?> FindFirebaseUidByCustomerAsync(
        string stripeCustomerId,
        CancellationToken cancellationToken = default)
    {
        const string sql =
            """
            SELECT firebase_uid
            FROM pixelboard.stripe_customers
            WHERE stripe_customer_id = $1;
            """;
        await using var command = dataSource.CreateCommand(sql);
        command.Parameters.AddWithValue(stripeCustomerId);
        return await command.ExecuteScalarAsync(cancellationToken) as string;
    }

    public async ValueTask<string?> SaveCustomerAsync(
        AccountId accountId,
        string stripeCustomerId,
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
            INSERT INTO pixelboard.stripe_customers (
                firebase_uid, stripe_customer_id, created_at)
            SELECT $1, $2, now()
            WHERE NOT EXISTS (
                SELECT 1
                FROM pixelboard.deleted_accounts
                WHERE account_hash = $3
            )
            AND NOT EXISTS (
                SELECT 1
                FROM pixelboard.stripe_customers
                WHERE stripe_customer_id = $2
                  AND firebase_uid IS DISTINCT FROM $1
            )
            ON CONFLICT (firebase_uid) DO UPDATE
            SET stripe_customer_id = pixelboard.stripe_customers.stripe_customer_id
            RETURNING stripe_customer_id;
            """;
        try
        {
            await using var command = new NpgsqlCommand(sql, connection, transaction);
            command.Parameters.AddWithValue(accountId.Value);
            command.Parameters.AddWithValue(stripeCustomerId);
            command.Parameters.AddWithValue(accountHash);
            var stored = await command.ExecuteScalarAsync(cancellationToken) as string;
            await transaction.CommitAsync(cancellationToken);
            return stored;
        }
        catch (PostgresException exception)
            when (exception.SqlState == PostgresErrorCodes.UniqueViolation)
        {
            await transaction.RollbackAsync(cancellationToken);
            return null;
        }
    }

    public async ValueTask<bool> ApplyAsync(
        StripeSubscriptionUpdate update,
        CancellationToken cancellationToken = default)
    {
        var accountHash = AccountHash(update.AccountId);
        var entitlement = StripeBilling.ToEntitlement(
            update.Status,
            update.CurrentPeriodEnd,
            DateTimeOffset.UtcNow);
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        await PostgresAccountLock.AcquireAsync(
            connection,
            transaction,
            accountHash,
            cancellationToken);
        const string sql =
            """
            WITH customer AS (
                INSERT INTO pixelboard.stripe_customers (
                    firebase_uid, stripe_customer_id, created_at)
                SELECT $1, $2, now()
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM pixelboard.deleted_accounts
                    WHERE account_hash = $8
                )
                AND NOT EXISTS (
                    SELECT 1
                    FROM pixelboard.stripe_customers
                    WHERE stripe_customer_id = $2
                      AND firebase_uid IS DISTINCT FROM $1
                )
                ON CONFLICT (firebase_uid) DO UPDATE
                SET stripe_customer_id = pixelboard.stripe_customers.stripe_customer_id
                RETURNING firebase_uid, stripe_customer_id
            ),
            owned AS (
                SELECT firebase_uid
                FROM customer
                WHERE stripe_customer_id = $2
            ),
            recorded AS (
                INSERT INTO pixelboard.stripe_subscriptions (
                    stripe_subscription_id,
                    firebase_uid,
                    stripe_customer_id,
                    status,
                    price_id,
                    current_period_end,
                    event_at,
                    updated_at)
                SELECT $3, firebase_uid, $2, $4, $5, $6, $7, now()
                FROM owned
                ON CONFLICT (stripe_subscription_id) DO UPDATE SET
                    status = EXCLUDED.status,
                    price_id = EXCLUDED.price_id,
                    current_period_end = EXCLUDED.current_period_end,
                    event_at = EXCLUDED.event_at,
                    updated_at = EXCLUDED.updated_at
                WHERE EXCLUDED.event_at >= pixelboard.stripe_subscriptions.event_at
                  AND pixelboard.stripe_subscriptions.firebase_uid = EXCLUDED.firebase_uid
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
                SELECT firebase_uid, $9, 'stripe', $3, $7, $6, $10, now()
                FROM recorded
                ON CONFLICT (firebase_uid) DO UPDATE SET
                    tier = EXCLUDED.tier,
                    source = EXCLUDED.source,
                    source_transaction_id = EXCLUDED.source_transaction_id,
                    source_signed_at = EXCLUDED.source_signed_at,
                    expires_at = EXCLUDED.expires_at,
                    revoked_at = EXCLUDED.revoked_at,
                    updated_at = EXCLUDED.updated_at
                WHERE (
                    pixelboard.entitlements.source_signed_at IS NULL
                    OR EXCLUDED.source_signed_at >= pixelboard.entitlements.source_signed_at
                )
                AND NOT (
                    pixelboard.entitlements.source = 'storekit'
                    AND pixelboard.entitlements.revoked_at IS NULL
                    AND pixelboard.entitlements.tier = 'pro'
                    AND (
                        pixelboard.entitlements.expires_at IS NULL
                        OR pixelboard.entitlements.expires_at > now()
                    )
                )
                RETURNING firebase_uid
            )
            SELECT EXISTS (SELECT 1 FROM owned);
            """;
        try
        {
            await using var command = new NpgsqlCommand(sql, connection, transaction);
            command.Parameters.AddWithValue(update.AccountId.Value);
            command.Parameters.AddWithValue(update.CustomerId);
            command.Parameters.AddWithValue(update.SubscriptionId);
            command.Parameters.AddWithValue(update.Status);
            command.Parameters.AddWithValue(
                string.IsNullOrWhiteSpace(update.PriceId) ? DBNull.Value : update.PriceId);
            command.Parameters.AddWithValue(update.CurrentPeriodEnd);
            command.Parameters.AddWithValue(update.EventAt);
            command.Parameters.AddWithValue(accountHash);
            command.Parameters.AddWithValue(
                entitlement.Tier == AccountTier.Pro ? "pro" : "free");
            command.Parameters.AddWithValue(
                entitlement.RevokedAt.HasValue ? entitlement.RevokedAt.Value : DBNull.Value);
            var applied = (bool)(await command.ExecuteScalarAsync(cancellationToken) ?? false);
            await transaction.CommitAsync(cancellationToken);
            return applied;
        }
        catch (PostgresException exception)
            when (exception.SqlState == PostgresErrorCodes.UniqueViolation)
        {
            await transaction.RollbackAsync(cancellationToken);
            return false;
        }
    }

    private static byte[] AccountHash(AccountId accountId) =>
        SHA256.HashData(Encoding.UTF8.GetBytes(accountId.Value));
}
