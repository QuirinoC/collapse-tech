using Microsoft.Extensions.Diagnostics.HealthChecks;
using Npgsql;

namespace PixelBoard.Infrastructure.Ledger;

public sealed class PostgresHealthCheck(NpgsqlDataSource dataSource) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        try
        {
            const string sql =
                """
                SELECT
                    has_schema_privilege(current_user, 'pixelboard', 'USAGE')
                    AND bool_and(COALESCE(
                        has_table_privilege(
                            current_user,
                            to_regclass('pixelboard.' || required_table)::oid,
                            'SELECT,INSERT,UPDATE,DELETE'),
                        false))
                FROM unnest(ARRAY[
                    'placements',
                    'current_pixels',
                    'reports',
                    'account_bans',
                    'moderation_actions',
                    'entitlements',
                    'audit_events',
                    'accounts',
                    'account_warnings',
                    'hidden_regions',
                    'platform_safety_state',
                    'deleted_accounts',
                    'referral_codes',
                    'referral_attributions',
                    'paint_boosts',
                    'special_codes',
                    'special_code_redemptions',
                    'push_devices',
                    'notification_preferences',
                    'notification_campaigns',
                    'notification_outbox',
                    'notification_digest_counters'
                ]) AS required_tables(required_table);
                """;
            await using var command = dataSource.CreateCommand(sql);
            var ready = (bool)(await command.ExecuteScalarAsync(cancellationToken)
                ?? false);
            if (!ready)
            {
                return HealthCheckResult.Unhealthy(
                    "The PostgreSQL moderation ledger schema or runtime grants are incomplete.");
            }

            return HealthCheckResult.Healthy();
        }
        catch (Exception exception)
        {
            return HealthCheckResult.Unhealthy(
                "The PostgreSQL moderation ledger is unavailable.",
                exception);
        }
    }
}
