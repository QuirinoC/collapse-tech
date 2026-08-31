using Npgsql;
using TrustApi.Configuration;
using TrustApi.Domain;

namespace TrustApi.Infrastructure.Postgres;

public sealed class PostgresTrustStore(string connectionString) : ITrustStore
{
    private const string AccountColumns =
        "account_id, provider, provider_subject, display_name, has_circle, circle_source, created_at, phone_e164, phone_verified_at";

    private readonly string _connectionString = PostgresConnectionString.Normalize(connectionString);

    public Task<Account?> FindAccountAsync(Guid id, CancellationToken cancellationToken) =>
        QueryAccountAsync(
            $"SELECT {AccountColumns} FROM trust.accounts WHERE account_id = $1",
            cmd => cmd.Parameters.AddWithValue(id),
            cancellationToken);

    public Task<Account?> FindByProviderAsync(
        string provider,
        string subject,
        CancellationToken cancellationToken) =>
        QueryAccountAsync(
            $"SELECT {AccountColumns} FROM trust.accounts WHERE provider = $1 AND provider_subject = $2",
            cmd =>
            {
                cmd.Parameters.AddWithValue(provider);
                cmd.Parameters.AddWithValue(subject);
            },
            cancellationToken);

    public async Task<Account> UpsertAccountAsync(Account account, CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(
            """
            INSERT INTO trust.accounts (account_id, provider, provider_subject, display_name, has_circle, circle_source, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (provider, provider_subject) DO UPDATE
                SET display_name = EXCLUDED.display_name
            RETURNING account_id, provider, provider_subject, display_name, has_circle, circle_source, created_at, phone_e164, phone_verified_at;
            """,
            connection);
        command.Parameters.AddWithValue(account.Id);
        command.Parameters.AddWithValue(account.Provider);
        command.Parameters.AddWithValue(account.ProviderSubject);
        command.Parameters.AddWithValue(account.DisplayName);
        command.Parameters.AddWithValue(account.HasCircle);
        command.Parameters.AddWithValue((object?)account.CircleSource ?? DBNull.Value);
        command.Parameters.AddWithValue(account.CreatedAt);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        await reader.ReadAsync(cancellationToken);
        return ReadAccount(reader);
    }

    public async Task UpdateAccountAsync(Account account, CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(
            """
            UPDATE trust.accounts
            SET display_name = $2, has_circle = $3, circle_source = $4
            WHERE account_id = $1;
            """,
            connection);
        command.Parameters.AddWithValue(account.Id);
        command.Parameters.AddWithValue(account.DisplayName);
        command.Parameters.AddWithValue(account.HasCircle);
        command.Parameters.AddWithValue((object?)account.CircleSource ?? DBNull.Value);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<Account>> ListConnectedAsync(Guid accountId, CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(
            """
            SELECT a.account_id, a.provider, a.provider_subject, a.display_name, a.has_circle, a.circle_source, a.created_at, a.phone_e164, a.phone_verified_at
            FROM trust.memberships m
            JOIN trust.accounts a ON a.account_id = CASE WHEN m.person_a = $1 THEN m.person_b ELSE m.person_a END
            WHERE m.status = 'active' AND (m.person_a = $1 OR m.person_b = $1);
            """,
            connection);
        command.Parameters.AddWithValue(accountId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var people = new List<Account>();
        while (await reader.ReadAsync(cancellationToken))
        {
            people.Add(ReadAccount(reader));
        }

        return people;
    }

    public async Task<int> ActiveMembershipCountAsync(Guid accountId, CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(
            "SELECT COUNT(*) FROM trust.memberships WHERE status = 'active' AND (person_a = $1 OR person_b = $1);",
            connection);
        command.Parameters.AddWithValue(accountId);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return Convert.ToInt32(result);
    }

    public async Task<bool> AreConnectedAsync(Guid a, Guid b, CancellationToken cancellationToken)
    {
        var (left, right) = Order(a, b);
        await using var connection = await OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(
            "SELECT 1 FROM trust.memberships WHERE person_a = $1 AND person_b = $2 AND status = 'active';",
            connection);
        command.Parameters.AddWithValue(left);
        command.Parameters.AddWithValue(right);
        return await command.ExecuteScalarAsync(cancellationToken) is not null;
    }

    public async Task InsertMembershipAsync(Guid a, Guid b, CancellationToken cancellationToken)
    {
        var (left, right) = Order(a, b);
        await using var connection = await OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(
            """
            INSERT INTO trust.memberships (membership_id, person_a, person_b, status, created_at)
            VALUES ($1, $2, $3, 'active', $4)
            ON CONFLICT (person_a, person_b) DO UPDATE SET status = 'active';
            """,
            connection);
        command.Parameters.AddWithValue(Guid.NewGuid());
        command.Parameters.AddWithValue(left);
        command.Parameters.AddWithValue(right);
        command.Parameters.AddWithValue(DateTimeOffset.UtcNow);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task RevokeMembershipAsync(Guid a, Guid b, CancellationToken cancellationToken)
    {
        var (left, right) = Order(a, b);
        await using var connection = await OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(
            "UPDATE trust.memberships SET status = 'revoked' WHERE person_a = $1 AND person_b = $2;",
            connection);
        command.Parameters.AddWithValue(left);
        command.Parameters.AddWithValue(right);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<ShareState> GetShareAsync(Guid grantor, Guid grantee, CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(
            "SELECT resting, timed_until FROM trust.shares WHERE grantor_id = $1 AND grantee_id = $2;",
            connection);
        command.Parameters.AddWithValue(grantor);
        command.Parameters.AddWithValue(grantee);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return ShareState.Default;
        }

        return new ShareState(ParseResting(reader.GetString(0)), reader.IsDBNull(1) ? null : reader.GetFieldValue<DateTimeOffset>(1));
    }

    public async Task UpsertShareAsync(Guid grantor, Guid grantee, ShareState state, CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(
            """
            INSERT INTO trust.shares (grantor_id, grantee_id, resting, timed_until)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (grantor_id, grantee_id) DO UPDATE
                SET resting = EXCLUDED.resting, timed_until = EXCLUDED.timed_until;
            """,
            connection);
        command.Parameters.AddWithValue(grantor);
        command.Parameters.AddWithValue(grantee);
        command.Parameters.AddWithValue(FormatResting(state.Resting));
        command.Parameters.AddWithValue((object?)state.TimedUntil ?? DBNull.Value);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<Presence> GetPresenceAsync(
        Guid accountId,
        DateTimeOffset fallbackNow,
        CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(
            "SELECT last_active_at, battery_percent, is_charging, got_home_at, checked_in_at FROM trust.presence WHERE account_id = $1;",
            connection);
        command.Parameters.AddWithValue(accountId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return new Presence(fallbackNow.AddMinutes(-10), 80, false, null, null);
        }

        return new Presence(
            reader.GetFieldValue<DateTimeOffset>(0),
            reader.GetInt32(1),
            reader.GetBoolean(2),
            reader.IsDBNull(3) ? null : reader.GetFieldValue<DateTimeOffset>(3),
            reader.IsDBNull(4) ? null : reader.GetFieldValue<DateTimeOffset>(4));
    }

    public async Task UpsertPresenceAsync(Guid accountId, Presence presence, CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(
            """
            INSERT INTO trust.presence (account_id, last_active_at, battery_percent, is_charging, got_home_at, checked_in_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (account_id) DO UPDATE SET
                last_active_at = EXCLUDED.last_active_at,
                battery_percent = EXCLUDED.battery_percent,
                is_charging = EXCLUDED.is_charging,
                got_home_at = EXCLUDED.got_home_at,
                checked_in_at = EXCLUDED.checked_in_at;
            """,
            connection);
        command.Parameters.AddWithValue(accountId);
        command.Parameters.AddWithValue(presence.LastActiveAt);
        command.Parameters.AddWithValue(presence.BatteryPercent);
        command.Parameters.AddWithValue(presence.IsCharging);
        command.Parameters.AddWithValue((object?)presence.GotHomeAt ?? DBNull.Value);
        command.Parameters.AddWithValue((object?)presence.CheckedInAt ?? DBNull.Value);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task IngestLocationAsync(Guid accountId, LocationFix fix, CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(
            "INSERT INTO trust.location_points (account_id, recorded_at, latitude, longitude) VALUES ($1, $2, $3, $4);",
            connection);
        command.Parameters.AddWithValue(accountId);
        command.Parameters.AddWithValue(fix.Timestamp);
        command.Parameters.AddWithValue(fix.Latitude);
        command.Parameters.AddWithValue(fix.Longitude);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task PruneLocationsAsync(Guid accountId, DateTimeOffset olderThan, CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(
            "DELETE FROM trust.location_points WHERE account_id = $1 AND recorded_at < $2;",
            connection);
        command.Parameters.AddWithValue(accountId);
        command.Parameters.AddWithValue(olderThan);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task ClearLocationsAsync(Guid accountId, CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(
            "DELETE FROM trust.location_points WHERE account_id = $1;",
            connection);
        command.Parameters.AddWithValue(accountId);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<LocationFix>> UnlockLocationsAsync(
        Guid accountId,
        DateTimeOffset from,
        DateTimeOffset to,
        CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(
            """
            SELECT recorded_at, latitude, longitude
            FROM trust.location_points
            WHERE account_id = $1 AND recorded_at >= $2 AND recorded_at <= $3
            ORDER BY recorded_at ASC;
            """,
            connection);
        command.Parameters.AddWithValue(accountId);
        command.Parameters.AddWithValue(from);
        command.Parameters.AddWithValue(to);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var trail = new List<LocationFix>();
        while (await reader.ReadAsync(cancellationToken))
        {
            trail.Add(ReadFix(reader));
        }

        return trail;
    }

    public async Task<LocationFix?> LatestLocationAsync(Guid accountId, CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(
            """
            SELECT recorded_at, latitude, longitude
            FROM trust.location_points
            WHERE account_id = $1
            ORDER BY recorded_at DESC
            LIMIT 1;
            """,
            connection);
        command.Parameters.AddWithValue(accountId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return ReadFix(reader);
    }

    public async Task InsertLookEventAsync(LookEvent look, CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(
            """
            INSERT INTO trust.look_events (look_id, viewer_id, subject_id, at, history_window_hours, included_live)
            VALUES ($1, $2, $3, $4, $5, $6);
            """,
            connection);
        command.Parameters.AddWithValue(look.Id);
        command.Parameters.AddWithValue(look.ViewerId);
        command.Parameters.AddWithValue(look.SubjectId);
        command.Parameters.AddWithValue(look.At);
        command.Parameters.AddWithValue(look.HistoryWindowHours);
        command.Parameters.AddWithValue(look.IncludedLive);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<LookEvent>> ListLooksAsync(
        Guid accountId,
        DateTimeOffset since,
        CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(
            """
            SELECT e.look_id, e.viewer_id, v.display_name, e.subject_id, s.display_name, e.at, e.history_window_hours, e.included_live
            FROM trust.look_events e
            JOIN trust.accounts v ON v.account_id = e.viewer_id
            JOIN trust.accounts s ON s.account_id = e.subject_id
            WHERE (e.viewer_id = $1 OR e.subject_id = $1) AND e.at >= $2
            ORDER BY e.at DESC;
            """,
            connection);
        command.Parameters.AddWithValue(accountId);
        command.Parameters.AddWithValue(since);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var events = new List<LookEvent>();
        while (await reader.ReadAsync(cancellationToken))
        {
            events.Add(new LookEvent(
                reader.GetGuid(0),
                reader.GetGuid(1),
                reader.GetString(2),
                reader.GetGuid(3),
                reader.GetString(4),
                reader.GetFieldValue<DateTimeOffset>(5),
                reader.GetInt32(6),
                reader.GetBoolean(7)));
        }

        return events;
    }

    public async Task<int> LooksTodayAsync(Guid viewerId, DateTimeOffset startOfDay, CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(
            "SELECT COUNT(*) FROM trust.look_events WHERE viewer_id = $1 AND at >= $2;",
            connection);
        command.Parameters.AddWithValue(viewerId);
        command.Parameters.AddWithValue(startOfDay);
        return Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken));
    }

    public async Task SetActiveLookAsync(ActiveLook look, CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(
            """
            INSERT INTO trust.active_looks (viewer_id, subject_id, look_id, history_window_hours, opened_at)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (viewer_id, subject_id) DO UPDATE SET
                look_id = EXCLUDED.look_id,
                history_window_hours = EXCLUDED.history_window_hours,
                opened_at = EXCLUDED.opened_at;
            """,
            connection);
        command.Parameters.AddWithValue(look.ViewerId);
        command.Parameters.AddWithValue(look.SubjectId);
        command.Parameters.AddWithValue(look.LookId);
        command.Parameters.AddWithValue(look.HistoryWindowHours);
        command.Parameters.AddWithValue(look.OpenedAt);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<ActiveLook?> GetActiveLookAsync(Guid viewerId, Guid subjectId, CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(
            "SELECT look_id, viewer_id, subject_id, history_window_hours, opened_at FROM trust.active_looks WHERE viewer_id = $1 AND subject_id = $2;",
            connection);
        command.Parameters.AddWithValue(viewerId);
        command.Parameters.AddWithValue(subjectId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return ReadActive(reader);
    }

    public async Task<ActiveLook?> GetLookAtMeAsync(Guid subjectId, CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(
            "SELECT look_id, viewer_id, subject_id, history_window_hours, opened_at FROM trust.active_looks WHERE subject_id = $1 LIMIT 1;",
            connection);
        command.Parameters.AddWithValue(subjectId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return ReadActive(reader);
    }

    public async Task ClearActiveLookAsync(Guid viewerId, Guid? subjectId, CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(cancellationToken);
        if (subjectId is { } id)
        {
            await using var command = new NpgsqlCommand(
                "DELETE FROM trust.active_looks WHERE viewer_id = $1 AND subject_id = $2;",
                connection);
            command.Parameters.AddWithValue(viewerId);
            command.Parameters.AddWithValue(id);
            await command.ExecuteNonQueryAsync(cancellationToken);
            return;
        }

        await using var all = new NpgsqlCommand(
            "DELETE FROM trust.active_looks WHERE viewer_id = $1;",
            connection);
        all.Parameters.AddWithValue(viewerId);
        await all.ExecuteNonQueryAsync(cancellationToken);
    }

    public Task<Invite?> FindInviteByCodeAsync(string code, CancellationToken cancellationToken) =>
        QueryInviteAsync(
            "SELECT invite_id, code, creator_id, status, created_at FROM trust.invites WHERE code = $1",
            cmd => cmd.Parameters.AddWithValue(code),
            cancellationToken);

    public Task<Invite?> FindPendingInviteAsync(Guid creatorId, CancellationToken cancellationToken) =>
        QueryInviteAsync(
            "SELECT invite_id, code, creator_id, status, created_at FROM trust.invites WHERE creator_id = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 1",
            cmd => cmd.Parameters.AddWithValue(creatorId),
            cancellationToken);

    public async Task InsertInviteAsync(Invite invite, CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(
            "INSERT INTO trust.invites (invite_id, code, creator_id, status, created_at) VALUES ($1, $2, $3, $4, $5);",
            connection);
        command.Parameters.AddWithValue(invite.Id);
        command.Parameters.AddWithValue(invite.Code);
        command.Parameters.AddWithValue(invite.CreatorId);
        command.Parameters.AddWithValue(invite.Status);
        command.Parameters.AddWithValue(invite.CreatedAt);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task MarkInviteConsumedAsync(Guid inviteId, CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(
            "UPDATE trust.invites SET status = 'consumed' WHERE invite_id = $1;",
            connection);
        command.Parameters.AddWithValue(inviteId);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task DeleteAccountAsync(Guid accountId, CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        await using (var command = new NpgsqlCommand(
            """
            DELETE FROM trust.active_looks WHERE viewer_id = $1 OR subject_id = $1;
            DELETE FROM trust.look_events WHERE viewer_id = $1 OR subject_id = $1;
            DELETE FROM trust.location_points WHERE account_id = $1;
            DELETE FROM trust.presence WHERE account_id = $1;
            DELETE FROM trust.shares WHERE grantor_id = $1 OR grantee_id = $1;
            DELETE FROM trust.memberships WHERE person_a = $1 OR person_b = $1;
            DELETE FROM trust.invites WHERE creator_id = $1;
            DELETE FROM trust.phone_challenges WHERE account_id = $1;
            DELETE FROM trust.storekit_transactions WHERE account_id = $1;
            DELETE FROM trust.storekit_subscription_owners WHERE account_id = $1;
            DELETE FROM trust.storekit_account_tokens WHERE account_id = $1;
            DELETE FROM trust.push_devices WHERE account_id = $1;
            DELETE FROM trust.accounts WHERE account_id = $1;
            """,
            connection,
            transaction))
        {
            command.Parameters.AddWithValue(accountId);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);
    }

    public Task<Account?> FindByVerifiedPhoneAsync(string phoneE164, CancellationToken cancellationToken) =>
        QueryAccountAsync(
            $"SELECT {AccountColumns} FROM trust.accounts WHERE phone_e164 = $1 AND phone_verified_at IS NOT NULL",
            cmd => cmd.Parameters.AddWithValue(phoneE164),
            cancellationToken);

    public async Task SetVerifiedPhoneAsync(
        Guid accountId,
        string phoneE164,
        DateTimeOffset verifiedAt,
        CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(
            """
            UPDATE trust.accounts
            SET phone_e164 = $2, phone_verified_at = $3
            WHERE account_id = $1;
            """,
            connection);
        command.Parameters.AddWithValue(accountId);
        command.Parameters.AddWithValue(phoneE164);
        command.Parameters.AddWithValue(verifiedAt);
        try
        {
            await command.ExecuteNonQueryAsync(cancellationToken);
        }
        catch (PostgresException exception) when (exception.SqlState == PostgresErrorCodes.UniqueViolation)
        {
            throw TrustException.PhoneInUse();
        }
    }

    public async Task<PhoneChallenge?> GetPhoneChallengeAsync(Guid accountId, CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(
            """
            SELECT account_id, phone_e164, code_hash, expires_at, attempts, sent_at, send_count, window_started_at
            FROM trust.phone_challenges
            WHERE account_id = $1;
            """,
            connection);
        command.Parameters.AddWithValue(accountId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return ReadChallenge(reader);
    }

    public async Task UpsertPhoneChallengeAsync(PhoneChallenge challenge, CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(
            """
            INSERT INTO trust.phone_challenges (
                account_id, phone_e164, code_hash, expires_at, attempts, sent_at, send_count, window_started_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (account_id) DO UPDATE SET
                phone_e164 = EXCLUDED.phone_e164,
                code_hash = EXCLUDED.code_hash,
                expires_at = EXCLUDED.expires_at,
                attempts = EXCLUDED.attempts,
                sent_at = EXCLUDED.sent_at,
                send_count = EXCLUDED.send_count,
                window_started_at = EXCLUDED.window_started_at;
            """,
            connection);
        command.Parameters.AddWithValue(challenge.AccountId);
        command.Parameters.AddWithValue(challenge.PhoneE164);
        command.Parameters.AddWithValue(challenge.CodeHash);
        command.Parameters.AddWithValue(challenge.ExpiresAt);
        command.Parameters.AddWithValue(challenge.Attempts);
        command.Parameters.AddWithValue(challenge.SentAt);
        command.Parameters.AddWithValue(challenge.SendCount);
        command.Parameters.AddWithValue(challenge.WindowStartedAt);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task ClearPhoneChallengeAsync(Guid accountId, CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(
            "DELETE FROM trust.phone_challenges WHERE account_id = $1;",
            connection);
        command.Parameters.AddWithValue(accountId);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private async Task<Account?> QueryAccountAsync(
        string sql,
        Action<NpgsqlCommand> bind,
        CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(sql, connection);
        bind(command);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return ReadAccount(reader);
    }

    private async Task<Invite?> QueryInviteAsync(
        string sql,
        Action<NpgsqlCommand> bind,
        CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand(sql, connection);
        bind(command);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return new Invite(
            reader.GetGuid(0),
            reader.GetString(1),
            reader.GetGuid(2),
            reader.GetString(3),
            reader.GetFieldValue<DateTimeOffset>(4));
    }

    private async Task<NpgsqlConnection> OpenAsync(CancellationToken cancellationToken)
    {
        var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        return connection;
    }

    private static Account ReadAccount(NpgsqlDataReader reader) =>
        new(
            reader.GetGuid(0),
            reader.GetString(1),
            reader.GetString(2),
            reader.GetString(3),
            reader.GetBoolean(4),
            reader.IsDBNull(5) ? null : reader.GetString(5),
            reader.GetFieldValue<DateTimeOffset>(6),
            reader.IsDBNull(7) ? null : reader.GetString(7),
            reader.IsDBNull(8) ? null : reader.GetFieldValue<DateTimeOffset>(8));

    private static PhoneChallenge ReadChallenge(NpgsqlDataReader reader) =>
        new(
            reader.GetGuid(0),
            reader.GetString(1),
            reader.GetString(2),
            reader.GetFieldValue<DateTimeOffset>(3),
            reader.GetInt32(4),
            reader.GetFieldValue<DateTimeOffset>(5),
            reader.GetInt32(6),
            reader.GetFieldValue<DateTimeOffset>(7));

    private static LocationFix ReadFix(NpgsqlDataReader reader) =>
        new(
            reader.GetFieldValue<DateTimeOffset>(0),
            reader.GetDouble(1),
            reader.GetDouble(2));

    private static ActiveLook ReadActive(NpgsqlDataReader reader) =>
        new(
            reader.GetGuid(0),
            reader.GetGuid(1),
            reader.GetGuid(2),
            reader.GetInt32(3),
            reader.GetFieldValue<DateTimeOffset>(4));

    private static (Guid A, Guid B) Order(Guid a, Guid b) =>
        a.CompareTo(b) < 0 ? (a, b) : (b, a);

    private static ShareResting ParseResting(string value) =>
        string.Equals(value, "always", StringComparison.OrdinalIgnoreCase)
            ? ShareResting.Always
            : ShareResting.UntilTheyLook;

    private static string FormatResting(ShareResting resting) =>
        resting == ShareResting.Always ? "always" : "until_they_look";
}
