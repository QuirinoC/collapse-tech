using System.Text.Json;
using Npgsql;
using NpgsqlTypes;
using PixelBoard.Application;

namespace PixelBoard.Infrastructure.Notifications;

public sealed class PostgresNotificationStore(NpgsqlDataSource dataSource) : INotificationStore
{
    public async ValueTask RegisterDeviceAsync(
        AccountId accountId,
        PushDeviceRegistration registration,
        CancellationToken cancellationToken = default)
    {
        const string sql =
            """
            INSERT INTO pixelboard.push_devices (
                installation_id, firebase_uid, apns_token, environment, bundle_id,
                enabled, last_seen_at, invalidated_at, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, true, now(), NULL, now(), now())
            ON CONFLICT (installation_id) DO UPDATE SET
                firebase_uid = EXCLUDED.firebase_uid,
                apns_token = EXCLUDED.apns_token,
                environment = EXCLUDED.environment,
                bundle_id = EXCLUDED.bundle_id,
                enabled = true,
                last_seen_at = now(),
                invalidated_at = NULL,
                updated_at = now();
            """;
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        await using (var removeDuplicate = new NpgsqlCommand(
                         """
                         DELETE FROM pixelboard.push_devices
                         WHERE firebase_uid = $1
                           AND apns_token = $2
                           AND installation_id <> $3;
                         """,
                         connection,
                         transaction))
        {
            removeDuplicate.Parameters.AddWithValue(accountId.Value);
            removeDuplicate.Parameters.AddWithValue(registration.Token);
            removeDuplicate.Parameters.AddWithValue(registration.InstallationId);
            await removeDuplicate.ExecuteNonQueryAsync(cancellationToken);
        }

        await using var command = new NpgsqlCommand(sql, connection, transaction);
        command.Parameters.AddWithValue(registration.InstallationId);
        command.Parameters.AddWithValue(accountId.Value);
        command.Parameters.AddWithValue(registration.Token);
        command.Parameters.AddWithValue(registration.Environment);
        command.Parameters.AddWithValue(registration.BundleId);
        await command.ExecuteNonQueryAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }

    public async ValueTask RemoveDeviceAsync(
        AccountId accountId,
        Guid installationId,
        CancellationToken cancellationToken = default)
    {
        const string sql =
            """
            DELETE FROM pixelboard.push_devices
            WHERE installation_id = $1
              AND firebase_uid = $2;
            """;
        await using var command = dataSource.CreateCommand(sql);
        command.Parameters.AddWithValue(installationId);
        command.Parameters.AddWithValue(accountId.Value);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async ValueTask<NotificationPreferences> GetPreferencesAsync(
        AccountId accountId,
        CancellationToken cancellationToken = default)
    {
        const string sql =
            """
            SELECT board_activity_enabled, broadcast_enabled
            FROM pixelboard.notification_preferences
            WHERE firebase_uid = $1;
            """;
        await using var command = dataSource.CreateCommand(sql);
        command.Parameters.AddWithValue(accountId.Value);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken)
            ? new NotificationPreferences(reader.GetBoolean(0), reader.GetBoolean(1))
            : new NotificationPreferences(true, true);
    }

    public async ValueTask SavePreferencesAsync(
        AccountId accountId,
        NotificationPreferences preferences,
        CancellationToken cancellationToken = default)
    {
        const string sql =
            """
            INSERT INTO pixelboard.notification_preferences (
                firebase_uid, board_activity_enabled, broadcast_enabled, updated_at)
            VALUES ($1, $2, $3, now())
            ON CONFLICT (firebase_uid) DO UPDATE SET
                board_activity_enabled = EXCLUDED.board_activity_enabled,
                broadcast_enabled = EXCLUDED.broadcast_enabled,
                updated_at = now();
            """;
        await using var command = dataSource.CreateCommand(sql);
        command.Parameters.AddWithValue(accountId.Value);
        command.Parameters.AddWithValue(preferences.BoardActivityEnabled);
        command.Parameters.AddWithValue(preferences.BroadcastEnabled);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async ValueTask<NotificationCampaign> CreateCampaignAsync(
        AccountId moderatorAccountId,
        string title,
        string body,
        IReadOnlyCollection<AccountId> recipients,
        DateTimeOffset? expiresAt,
        CancellationToken cancellationToken = default)
    {
        var campaignId = Guid.NewGuid();
        var createdAt = DateTimeOffset.UtcNow;
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        await using (var campaign = new NpgsqlCommand(
                         """
                         INSERT INTO pixelboard.notification_campaigns (
                             campaign_id, created_by, title, body, expires_at,
                             recipient_count, created_at)
                         VALUES ($1, $2, $3, $4, $5, $6, $7);
                         """,
                         connection,
                         transaction))
        {
            campaign.Parameters.AddWithValue(campaignId);
            campaign.Parameters.AddWithValue(moderatorAccountId.Value);
            campaign.Parameters.AddWithValue(title);
            campaign.Parameters.AddWithValue(body);
            campaign.Parameters.AddWithValue(expiresAt ?? (object)DBNull.Value);
            campaign.Parameters.AddWithValue(recipients.Count);
            campaign.Parameters.AddWithValue(createdAt);
            await campaign.ExecuteNonQueryAsync(cancellationToken);
        }

        const string outboxSql =
            """
            INSERT INTO pixelboard.notification_outbox (
                notification_id, recipient_firebase_uid, category, title, body,
                payload, campaign_id, expires_at, dedupe_key, available_at, created_at)
            VALUES ($1, $2, 'broadcast', $3, $4, $5, $6, $7, $8, now(), $9)
            ON CONFLICT (dedupe_key) DO NOTHING;
            """;
        foreach (var recipient in recipients)
        {
            await using var outbox = new NpgsqlCommand(outboxSql, connection, transaction);
            outbox.Parameters.AddWithValue(Guid.NewGuid());
            outbox.Parameters.AddWithValue(recipient.Value);
            outbox.Parameters.AddWithValue(title);
            outbox.Parameters.AddWithValue(body);
            outbox.Parameters.Add(new NpgsqlParameter
            {
                NpgsqlDbType = NpgsqlDbType.Jsonb,
                Value = JsonSerializer.Serialize(new
                {
                    kind = "broadcast",
                    campaignId,
                    expiresAt
                })
            });
            outbox.Parameters.AddWithValue(campaignId);
            outbox.Parameters.AddWithValue(expiresAt ?? (object)DBNull.Value);
            outbox.Parameters.AddWithValue($"campaign:{campaignId}:{recipient.Value}");
            outbox.Parameters.AddWithValue(createdAt);
            await outbox.ExecuteNonQueryAsync(cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);
        return new NotificationCampaign(
            campaignId,
            title,
            body,
            expiresAt,
            recipients.Count,
            createdAt);
    }

    public async ValueTask<NotificationOutboxItem?> ClaimNextAsync(
        string workerId,
        CancellationToken cancellationToken = default)
    {
        const string sql =
            """
            WITH next_item AS (
                SELECT notification_id
                FROM pixelboard.notification_outbox
                WHERE sent_at IS NULL
                  AND available_at <= now()
                  AND (expires_at IS NULL OR expires_at > now())
                  AND (claimed_at IS NULL OR claimed_at < now() - interval '5 minutes')
                ORDER BY created_at
                FOR UPDATE SKIP LOCKED
                LIMIT 1
            )
            UPDATE pixelboard.notification_outbox outbox
            SET claimed_at = now(),
                claimed_by = $1,
                attempt_count = attempt_count + 1
            FROM next_item
            WHERE outbox.notification_id = next_item.notification_id
            RETURNING outbox.notification_id, outbox.recipient_firebase_uid,
                      outbox.category, outbox.title, outbox.body, outbox.payload,
                      outbox.expires_at, outbox.attempt_count;
            """;
        await using var command = dataSource.CreateCommand(sql);
        command.Parameters.AddWithValue(workerId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        var payload = (await reader.GetFieldValueAsync<JsonDocument>(
                5,
                cancellationToken))
            .RootElement
            .Clone();
        return new NotificationOutboxItem(
            reader.GetGuid(0),
            reader.GetString(1),
            ParseCategory(reader.GetString(2)),
            reader.GetString(3),
            reader.GetString(4),
            payload,
            reader.IsDBNull(6) ? null : reader.GetFieldValue<DateTimeOffset>(6),
            reader.GetInt32(7));
    }

    public async ValueTask<IReadOnlyList<PushDeviceRegistration>> GetActiveDevicesAsync(
        string firebaseUid,
        CancellationToken cancellationToken = default)
    {
        const string sql =
            """
            SELECT installation_id, apns_token, environment, bundle_id
            FROM pixelboard.push_devices
            WHERE firebase_uid = $1
              AND enabled
              AND invalidated_at IS NULL;
            """;
        await using var command = dataSource.CreateCommand(sql);
        command.Parameters.AddWithValue(firebaseUid);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var devices = new List<PushDeviceRegistration>();
        while (await reader.ReadAsync(cancellationToken))
        {
            devices.Add(new PushDeviceRegistration(
                reader.GetGuid(0),
                reader.GetString(1),
                reader.GetString(2),
                reader.GetString(3)));
        }

        return devices;
    }

    public async ValueTask MarkSentAsync(
        Guid notificationId,
        string workerId,
        CancellationToken cancellationToken = default)
    {
        const string sql =
            """
            UPDATE pixelboard.notification_outbox
            SET sent_at = now(), claimed_at = NULL, claimed_by = NULL
            WHERE notification_id = $1 AND claimed_by = $2;
            """;
        await using var command = dataSource.CreateCommand(sql);
        command.Parameters.AddWithValue(notificationId);
        command.Parameters.AddWithValue(workerId);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async ValueTask RescheduleAsync(
        Guid notificationId,
        string workerId,
        string error,
        TimeSpan delay,
        CancellationToken cancellationToken = default)
    {
        const string sql =
            """
            UPDATE pixelboard.notification_outbox
            SET available_at = now() + ($3 * interval '1 second'),
                claimed_at = NULL,
                claimed_by = NULL,
                last_error = $4
            WHERE notification_id = $1 AND claimed_by = $2;
            """;
        await using var command = dataSource.CreateCommand(sql);
        command.Parameters.AddWithValue(notificationId);
        command.Parameters.AddWithValue(workerId);
        command.Parameters.AddWithValue(delay.TotalSeconds);
        command.Parameters.AddWithValue(error);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async ValueTask InvalidateDeviceAsync(
        Guid installationId,
        string token,
        CancellationToken cancellationToken = default)
    {
        const string sql =
            """
            UPDATE pixelboard.push_devices
            SET enabled = false, invalidated_at = now(), updated_at = now()
            WHERE installation_id = $1 AND apns_token = $2;
            """;
        await using var command = dataSource.CreateCommand(sql);
        command.Parameters.AddWithValue(installationId);
        command.Parameters.AddWithValue(token);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async ValueTask DeleteAccountAsync(
        string firebaseUid,
        CancellationToken cancellationToken = default)
    {
        const string sql =
            """
            DELETE FROM pixelboard.push_devices WHERE firebase_uid = $1;
            DELETE FROM pixelboard.notification_preferences WHERE firebase_uid = $1;
            DELETE FROM pixelboard.notification_outbox WHERE recipient_firebase_uid = $1;
            """;
        await using var command = dataSource.CreateCommand(sql);
        command.Parameters.AddWithValue(firebaseUid);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static NotificationCategory ParseCategory(string value) =>
        value switch
        {
            "board_activity" => NotificationCategory.BoardActivity,
            "broadcast" => NotificationCategory.Broadcast,
            _ => throw new InvalidOperationException(
                $"Unknown notification category '{value}'.")
        };
}
