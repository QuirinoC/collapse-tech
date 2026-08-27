using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Options;
using Npgsql;
using PixelBoard.Application;
using PixelBoard.Configuration;
using PixelBoard.Contracts.V1;
using PixelBoard.Domain;
using PixelBoard.Infrastructure.Board;
using PixelBoard.Infrastructure.Ledger;
using PixelBoard.Infrastructure.Postgres;
using StackExchange.Redis;

namespace PixelBoard.Infrastructure.Moderation;

public sealed class ModerationConflictException(string message) : Exception(message);

public sealed class ModerationAccountDeletedException()
    : Exception("An account involved in this moderation action has been deleted.");

public sealed class PostgresModerationService(
    NpgsqlDataSource dataSource,
    IConnectionMultiplexer redis,
    IOptions<RedisOptions> redisOptions) : IModerationService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private const string CompareAndSetPixelScript =
        """
        local current_owner = redis.call('HGET', KEYS[2], ARGV[3]) or ''
        if current_owner ~= ARGV[4] then
            return 0
        end

        local tile_type = redis.call('TYPE', KEYS[1])['ok']
        local tile_json
        if tile_type == 'hash' then
            tile_json = redis.call('HGET', KEYS[1], 'data')
        elseif tile_type == 'string' then
            tile_json = redis.call('GET', KEYS[1])
        end
        if not tile_json then
            return -1
        end

        local tile = cjson.decode(tile_json)
        tile[tonumber(ARGV[1])][tonumber(ARGV[2])] = ARGV[5]
        if tile_type == 'string' then
            redis.call('DEL', KEYS[1])
        end
        redis.call(
            'HSET',
            KEYS[1],
            'data',
            cjson.encode(tile),
            'absexp',
            '-1',
            'sldexp',
            '-1')

        if ARGV[6] == '' then
            redis.call('HDEL', KEYS[2], ARGV[3])
        else
            redis.call('HSET', KEYS[2], ARGV[3], ARGV[6])
        end
        return 1
        """;

    public async ValueTask<PlatformSafetyState> GetStateAsync(
        CancellationToken cancellationToken = default)
    {
        const string sql =
            """
            SELECT placements_frozen, ads_disabled
            FROM pixelboard.platform_safety_state
            WHERE singleton = true;
            """;
        await using var command = dataSource.CreateCommand(sql);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            throw new InvalidOperationException("Platform safety state is unavailable.");
        }

        return new PlatformSafetyState(reader.GetBoolean(0), reader.GetBoolean(1));
    }

    public async ValueTask<bool> IsVisibleAsync(
        BoardPosition position,
        CancellationToken cancellationToken = default)
    {
        const string sql =
            """
            SELECT NOT EXISTS (
                SELECT 1
                FROM pixelboard.hidden_regions
                WHERE restored_at IS NULL
                  AND region_top <= $1
                  AND region_top + region_height > $1
                  AND region_left <= $2
                  AND region_left + region_width > $2
            );
            """;
        await using var command = dataSource.CreateCommand(sql);
        command.Parameters.AddWithValue(position.Row);
        command.Parameters.AddWithValue(position.Column);
        return (bool)(await command.ExecuteScalarAsync(cancellationToken)
            ?? throw new InvalidOperationException("Board visibility state is unavailable."));
    }

    public async ValueTask ApplyAsync(
        TileAddress tile,
        string[][] pixels,
        CancellationToken cancellationToken = default)
    {
        var origin = BoardGeometry.GetTileOrigin(tile);
        var bottom = checked(origin.Row + PixelBoardConstants.TileRows);
        var right = checked(origin.Column + PixelBoardConstants.TileCols);
        const string sql =
            """
            SELECT region_top, region_left, region_width, region_height
            FROM pixelboard.hidden_regions
            WHERE restored_at IS NULL
              AND region_top < $1
              AND region_top + region_height > $2
              AND region_left < $3
              AND region_left + region_width > $4;
            """;
        await using var command = dataSource.CreateCommand(sql);
        command.Parameters.AddWithValue(bottom);
        command.Parameters.AddWithValue(origin.Row);
        command.Parameters.AddWithValue(right);
        command.Parameters.AddWithValue(origin.Column);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var top = Math.Max(reader.GetInt32(0), origin.Row);
            var left = Math.Max(reader.GetInt32(1), origin.Column);
            var regionBottom = Math.Min(
                checked(reader.GetInt32(0) + reader.GetInt32(3)),
                bottom);
            var regionRight = Math.Min(
                checked(reader.GetInt32(1) + reader.GetInt32(2)),
                right);
            for (var row = top; row < regionBottom; row++)
            {
                for (var column = left; column < regionRight; column++)
                {
                    pixels[row - origin.Row][column - origin.Column] =
                        PixelBoardConstants.DefaultColor;
                }
            }
        }
    }

    public async ValueTask<IReadOnlyList<ModerationReport>> ListReportsAsync(
        int limit,
        CancellationToken cancellationToken = default)
    {
        const string sql =
            """
            SELECT report_id, status, region_top, region_left, region_width, region_height,
                   reason, note, snapshot::text, evidence_hash, submitted_at
            FROM pixelboard.reports
            ORDER BY
                CASE status WHEN 'received' THEN 0 WHEN 'under_review' THEN 1 ELSE 2 END,
                submitted_at
            LIMIT $1;
            """;
        await using var command = dataSource.CreateCommand(sql);
        command.Parameters.AddWithValue(Math.Clamp(limit, 1, 100));
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var reports = new List<ModerationReport>();
        while (await reader.ReadAsync(cancellationToken))
        {
            reports.Add(ReadReport(reader));
        }

        return reports;
    }

    public async ValueTask<ModerationReport?> GetReportAsync(
        ReportId reportId,
        CancellationToken cancellationToken = default)
    {
        const string sql =
            """
            SELECT report_id, status, region_top, region_left, region_width, region_height,
                   reason, note, snapshot::text, evidence_hash, submitted_at
            FROM pixelboard.reports
            WHERE report_id = $1;
            """;
        await using var command = dataSource.CreateCommand(sql);
        command.Parameters.AddWithValue(reportId.Value);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? ReadReport(reader) : null;
    }

    public async ValueTask<ModerationActionResult> ExecuteAsync(
        ModerationActionCommand command,
        CancellationToken cancellationToken = default)
    {
        IReadOnlyCollection<AccountId> accounts = command.TargetAccountId is { } target
            ? [command.ActorAccountId, target]
            : [command.ActorAccountId];
        await using var accountOperation =
            await new PostgresAccountOperationGuard(dataSource).AcquireIfActiveAsync(
                accounts,
                cancellationToken);
        if (accountOperation is null)
        {
            throw new ModerationAccountDeletedException();
        }

        var details = JsonSerializer.Serialize(new
        {
            reportId = command.ReportId?.Value,
            targetAccountId = command.TargetAccountId?.Value,
            placementIds = command.PlacementIds.Select(id => id.Value),
            command.ExpiresAt
        }, JsonOptions);
        var admission = await AdmitAsync(command, details, cancellationToken);
        if (admission.IsReplay)
        {
            return admission;
        }

        try
        {
            await ApplyAsync(command, cancellationToken);
            await CompleteAsync(command, "completed", cancellationToken);
            return new ModerationActionResult(command.ActionId, "completed", false);
        }
        catch
        {
            await CompleteAsync(command, "failed", CancellationToken.None);
            throw;
        }
    }

    public async ValueTask<ModerationActionResult> SetSafetyStateAsync(
        ModerationActionCommand command,
        PlatformSafetyState state,
        CancellationToken cancellationToken = default)
    {
        await using var accountOperation =
            await new PostgresAccountOperationGuard(dataSource).AcquireIfActiveAsync(
                [command.ActorAccountId],
                cancellationToken);
        if (accountOperation is null)
        {
            throw new ModerationAccountDeletedException();
        }

        var details = JsonSerializer.Serialize(state, JsonOptions);
        var admission = await AdmitAsync(command, details, cancellationToken);
        if (admission.IsReplay)
        {
            return admission;
        }

        try
        {
            const string sql =
                """
                UPDATE pixelboard.platform_safety_state
                SET placements_frozen = $1,
                    ads_disabled = $2,
                    reason = $3,
                    updated_by = $4,
                    updated_at = $5
                WHERE singleton = true;
                """;
            await using var update = dataSource.CreateCommand(sql);
            update.Parameters.AddWithValue(state.PlacementsFrozen);
            update.Parameters.AddWithValue(state.AdsDisabled);
            update.Parameters.AddWithValue(command.Reason);
            update.Parameters.AddWithValue(command.ActorAccountId.Value);
            update.Parameters.AddWithValue(command.CreatedAt);
            if (await update.ExecuteNonQueryAsync(cancellationToken) != 1)
            {
                throw new InvalidOperationException("Platform safety state is unavailable.");
            }

            await CompleteAsync(command, "completed", cancellationToken);
            return new ModerationActionResult(command.ActionId, "completed", false);
        }
        catch
        {
            await CompleteAsync(command, "failed", CancellationToken.None);
            throw;
        }
    }

    private async ValueTask<ModerationActionResult> AdmitAsync(
        ModerationActionCommand command,
        string details,
        CancellationToken cancellationToken)
    {
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        const string insertAction =
            """
            INSERT INTO pixelboard.moderation_actions (
                moderation_action_id, report_id, actor_firebase_uid, action_type, reason,
                details, created_at, idempotency_key, status)
            VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, 'pending')
            ON CONFLICT (actor_firebase_uid, idempotency_key) DO NOTHING;
            """;
        await using var action = new NpgsqlCommand(insertAction, connection, transaction);
        action.Parameters.AddWithValue(command.ActionId.Value);
        action.Parameters.AddWithValue(command.ReportId?.Value ?? (object)DBNull.Value);
        action.Parameters.AddWithValue(command.ActorAccountId.Value);
        action.Parameters.AddWithValue(command.ActionType);
        action.Parameters.AddWithValue(command.Reason);
        action.Parameters.AddWithValue(details);
        action.Parameters.AddWithValue(command.CreatedAt);
        action.Parameters.AddWithValue(command.IdempotencyKey);
        var inserted = await action.ExecuteNonQueryAsync(cancellationToken) == 1;
        if (inserted)
        {
            const string insertAudit =
                """
                INSERT INTO pixelboard.audit_events (
                    audit_event_id, actor_firebase_uid, event_type, subject_type,
                    subject_id, details, occurred_at)
                VALUES ($1, $2, 'moderation_action_requested', 'moderation_action',
                    $3, $4::jsonb, $5);
                """;
            await using var audit = new NpgsqlCommand(insertAudit, connection, transaction);
            audit.Parameters.AddWithValue(Guid.NewGuid());
            audit.Parameters.AddWithValue(command.ActorAccountId.Value);
            audit.Parameters.AddWithValue(command.ActionId.Value.ToString("N"));
            audit.Parameters.AddWithValue(details);
            audit.Parameters.AddWithValue(command.CreatedAt);
            await audit.ExecuteNonQueryAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return new ModerationActionResult(command.ActionId, "pending", false);
        }

        const string selectExisting =
            """
            SELECT moderation_action_id, status, action_type, reason, details::text
            FROM pixelboard.moderation_actions
            WHERE actor_firebase_uid = $1 AND idempotency_key = $2;
            """;
        await using var existing = new NpgsqlCommand(selectExisting, connection, transaction);
        existing.Parameters.AddWithValue(command.ActorAccountId.Value);
        existing.Parameters.AddWithValue(command.IdempotencyKey);
        await using var reader = await existing.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            throw new InvalidOperationException("The moderation action could not be admitted.");
        }

        var existingActionType = reader.GetString(2);
        var existingReason = reader.GetString(3);
        var existingDetails = reader.GetString(4);
        if (!string.Equals(existingActionType, command.ActionType, StringComparison.Ordinal)
            || !string.Equals(existingReason, command.Reason, StringComparison.Ordinal)
            || !JsonEquivalent(existingDetails, details))
        {
            throw new ModerationConflictException(
                "The idempotency key was already used for another moderation action.");
        }

        var result = new ModerationActionResult(
            ModerationActionId.From(reader.GetGuid(0)),
            reader.GetString(1),
            true);
        await reader.CloseAsync();
        await transaction.CommitAsync(cancellationToken);
        return result;
    }

    private async ValueTask ApplyAsync(
        ModerationActionCommand command,
        CancellationToken cancellationToken)
    {
        switch (command.ActionType)
        {
            case "dismiss":
                await UpdateReportStatusAsync(command, "closed", cancellationToken);
                return;
            case "quarantine":
                await QuarantineAsync(command, cancellationToken);
                return;
            case "rollback":
                await RollbackAsync(command, cancellationToken);
                return;
            case "warn":
                await WarnAsync(command, cancellationToken);
                return;
            case "suspend":
            case "ban":
                await BanAsync(command, cancellationToken);
                return;
            default:
                throw new ArgumentOutOfRangeException(
                    nameof(command),
                    $"Unknown moderation action '{command.ActionType}'.");
        }
    }

    private async ValueTask QuarantineAsync(
        ModerationActionCommand command,
        CancellationToken cancellationToken)
    {
        const string sql =
            """
            INSERT INTO pixelboard.hidden_regions (
                hidden_region_id, report_id, region_top, region_left, region_width,
                region_height, reason, created_by, created_at)
            SELECT $1, report_id, region_top, region_left, region_width, region_height,
                   $2, $3, $4
            FROM pixelboard.reports
            WHERE report_id = $5;
            """;
        await using var insert = dataSource.CreateCommand(sql);
        insert.Parameters.AddWithValue(Guid.NewGuid());
        insert.Parameters.AddWithValue(command.Reason);
        insert.Parameters.AddWithValue(command.ActorAccountId.Value);
        insert.Parameters.AddWithValue(command.CreatedAt);
        insert.Parameters.AddWithValue(RequireReport(command).Value);
        if (await insert.ExecuteNonQueryAsync(cancellationToken) != 1)
        {
            throw new InvalidOperationException("The report does not exist.");
        }

        await UpdateReportStatusAsync(command, "actioned", cancellationToken);
    }

    private async ValueTask WarnAsync(
        ModerationActionCommand command,
        CancellationToken cancellationToken)
    {
        const string sql =
            """
            INSERT INTO pixelboard.account_warnings (
                warning_id, firebase_uid, reason, report_id, created_by, created_at)
            VALUES ($1, $2, $3, $4, $5, $6);
            """;
        await using var insert = dataSource.CreateCommand(sql);
        insert.Parameters.AddWithValue(Guid.NewGuid());
        insert.Parameters.AddWithValue(RequireTarget(command).Value);
        insert.Parameters.AddWithValue(command.Reason);
        insert.Parameters.AddWithValue(command.ReportId?.Value ?? (object)DBNull.Value);
        insert.Parameters.AddWithValue(command.ActorAccountId.Value);
        insert.Parameters.AddWithValue(command.CreatedAt);
        await insert.ExecuteNonQueryAsync(cancellationToken);
        await UpdateReportStatusAsync(command, "actioned", cancellationToken);
    }

    private async ValueTask BanAsync(
        ModerationActionCommand command,
        CancellationToken cancellationToken)
    {
        const string sql =
            """
            INSERT INTO pixelboard.account_bans (
                ban_id, firebase_uid, reason, starts_at, expires_at, created_by, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $4);
            """;
        await using var insert = dataSource.CreateCommand(sql);
        insert.Parameters.AddWithValue(Guid.NewGuid());
        insert.Parameters.AddWithValue(RequireTarget(command).Value);
        insert.Parameters.AddWithValue(command.Reason);
        insert.Parameters.AddWithValue(command.CreatedAt);
        insert.Parameters.AddWithValue(
            command.ActionType == "suspend"
                ? command.ExpiresAt ?? throw new ArgumentException(
                    "A suspension expiry is required.",
                    nameof(command))
                : (object)DBNull.Value);
        insert.Parameters.AddWithValue(command.ActorAccountId.Value);
        await insert.ExecuteNonQueryAsync(cancellationToken);
        await UpdateReportStatusAsync(command, "actioned", cancellationToken);
    }

    private async ValueTask RollbackAsync(
        ModerationActionCommand command,
        CancellationToken cancellationToken)
    {
        if (command.PlacementIds.Count is < 1 or > 4096)
        {
            throw new ArgumentException(
                "Rollback requires between 1 and 4096 placements.",
                nameof(command));
        }

        const string query =
            """
            SELECT p.placement_id, p.board_row, p.board_column, p.color,
                   p.prior_color, p.prior_placement_id
            FROM pixelboard.placements p
            JOIN pixelboard.current_pixels current
              ON current.board_row = p.board_row
             AND current.board_column = p.board_column
             AND current.placement_id = p.placement_id
            WHERE p.placement_id = ANY($1)
            FOR UPDATE OF current;
            """;
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        await using var select = new NpgsqlCommand(query, connection, transaction);
        select.Parameters.AddWithValue(command.PlacementIds.Select(id => id.Value).ToArray());
        await using var reader = await select.ExecuteReaderAsync(cancellationToken);
        var pixels = new List<RollbackPixel>();
        while (await reader.ReadAsync(cancellationToken))
        {
            pixels.Add(new RollbackPixel(
                reader.GetGuid(0),
                reader.GetInt32(1),
                reader.GetInt32(2),
                reader.GetString(3),
                reader.GetString(4),
                reader.IsDBNull(5) ? null : reader.GetGuid(5)));
        }

        await reader.CloseAsync();
        if (pixels.Count == 0)
        {
            throw new ModerationConflictException(
                "None of the selected placements are still current.");
        }

        var rolledBack = 0;
        var redisMutations = new List<RollbackPixel>();
        try
        {
            foreach (var pixel in pixels)
            {
                if (!await TrySetRedisPixelAsync(
                        pixel,
                        pixel.PlacementId,
                        pixel.PriorColor,
                        pixel.PriorPlacementId,
                        cancellationToken))
                {
                    continue;
                }

                redisMutations.Add(pixel);
                if (await UpdateCurrentPixelAsync(
                        connection,
                        transaction,
                        pixel,
                        cancellationToken) != 1)
                {
                    throw new ModerationConflictException(
                        $"Placement '{pixel.PlacementId:N}' is no longer current.");
                }
                rolledBack++;
            }

            if (rolledBack == 0)
            {
                throw new ModerationConflictException(
                    "None of the selected placements are still current.");
            }

            if (command.ReportId is not null)
            {
                await UpdateReportStatusAsync(
                    command,
                    "actioned",
                    connection,
                    transaction,
                    cancellationToken);
            }

        }
        catch (Exception exception)
        {
            var compensationFailures = new List<Exception>();
            try
            {
                await transaction.RollbackAsync(CancellationToken.None);
            }
            catch (Exception rollbackException)
            {
                compensationFailures.Add(rollbackException);
            }

            foreach (var pixel in Enumerable.Reverse(redisMutations))
            {
                try
                {
                    await RestoreRedisPixelAsync(pixel);
                }
                catch (Exception compensationException)
                {
                    compensationFailures.Add(compensationException);
                }
            }

            if (compensationFailures.Count > 0)
            {
                compensationFailures.Insert(0, exception);
                throw new AggregateException(
                    "The rollback failed and could not be fully compensated.",
                    compensationFailures);
            }
            throw;
        }

        try
        {
            await transaction.CommitAsync(CancellationToken.None);
        }
        catch (Exception exception)
        {
            Exception? cleanupFailure = null;
            try
            {
                await transaction.DisposeAsync();
                await connection.DisposeAsync();
            }
            catch (Exception cleanupException)
            {
                cleanupFailure = cleanupException;
            }

            var outcome = await DetermineRollbackCommitOutcomeAsync(redisMutations);
            if (outcome == RollbackCommitOutcome.Committed)
            {
                if (cleanupFailure is not null)
                {
                    throw new AggregateException(
                        "The rollback committed, but database cleanup failed.",
                        exception,
                        cleanupFailure);
                }
                return;
            }
            if (outcome == RollbackCommitOutcome.NotCommitted)
            {
                var compensationFailures = await RestoreRedisPixelsAsync(redisMutations);
                if (compensationFailures.Count > 0)
                {
                    compensationFailures.Insert(0, exception);
                    if (cleanupFailure is not null)
                    {
                        compensationFailures.Add(cleanupFailure);
                    }
                    throw new AggregateException(
                        "The rollback commit failed and Redis could not be fully compensated.",
                        compensationFailures);
                }
            }

            if (cleanupFailure is not null)
            {
                throw new AggregateException(
                    outcome == RollbackCommitOutcome.NotCommitted
                        ? "The rollback was not committed and database cleanup failed."
                        : "The rollback commit outcome is unknown and database cleanup failed.",
                    exception,
                    cleanupFailure);
            }
            throw new InvalidOperationException(
                outcome == RollbackCommitOutcome.NotCommitted
                    ? "The rollback was not committed."
                    : "The rollback commit outcome could not be determined safely.",
                exception);
        }
    }

    private async ValueTask<RollbackCommitOutcome> DetermineRollbackCommitOutcomeAsync(
        IReadOnlyList<RollbackPixel> pixels)
    {
        const string sql =
            """
            SELECT placement_id
            FROM pixelboard.current_pixels
            WHERE board_row = $1 AND board_column = $2;
            """;
        var committed = 0;
        var notCommitted = 0;
        try
        {
            foreach (var pixel in pixels)
            {
                await using var command = dataSource.CreateCommand(sql);
                command.Parameters.AddWithValue(pixel.Row);
                command.Parameters.AddWithValue(pixel.Column);
                var value = await command.ExecuteScalarAsync(CancellationToken.None);
                var currentPlacementId = value is Guid id ? id : (Guid?)null;
                if (currentPlacementId == pixel.PriorPlacementId)
                {
                    committed++;
                }
                else if (currentPlacementId == pixel.PlacementId)
                {
                    notCommitted++;
                }
                else
                {
                    return RollbackCommitOutcome.Unknown;
                }
            }
        }
        catch
        {
            return RollbackCommitOutcome.Unknown;
        }

        if (committed == pixels.Count)
        {
            return RollbackCommitOutcome.Committed;
        }
        if (notCommitted == pixels.Count)
        {
            return RollbackCommitOutcome.NotCommitted;
        }
        return RollbackCommitOutcome.Unknown;
    }

    private async ValueTask<List<Exception>> RestoreRedisPixelsAsync(
        IReadOnlyList<RollbackPixel> pixels)
    {
        var failures = new List<Exception>();
        foreach (var pixel in Enumerable.Reverse(pixels))
        {
            try
            {
                await RestoreRedisPixelAsync(pixel);
            }
            catch (Exception exception)
            {
                failures.Add(exception);
            }
        }
        return failures;
    }

    private async ValueTask<int> UpdateCurrentPixelAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        RollbackPixel pixel,
        CancellationToken cancellationToken)
    {
        const string updateCurrent =
            """
            UPDATE pixelboard.current_pixels
            SET placement_id = $1
            WHERE board_row = $2 AND board_column = $3 AND placement_id = $4;
            """;
        const string deleteCurrent =
            """
            DELETE FROM pixelboard.current_pixels
            WHERE board_row = $1 AND board_column = $2 AND placement_id = $3;
            """;
        await using var update = pixel.PriorPlacementId is not null
            ? new NpgsqlCommand(updateCurrent, connection, transaction)
            : new NpgsqlCommand(deleteCurrent, connection, transaction);
        if (pixel.PriorPlacementId is { } priorId)
        {
            update.Parameters.AddWithValue(priorId);
            update.Parameters.AddWithValue(pixel.Row);
            update.Parameters.AddWithValue(pixel.Column);
            update.Parameters.AddWithValue(pixel.PlacementId);
        }
        else
        {
            update.Parameters.AddWithValue(pixel.Row);
            update.Parameters.AddWithValue(pixel.Column);
            update.Parameters.AddWithValue(pixel.PlacementId);
        }
        return await update.ExecuteNonQueryAsync(cancellationToken);
    }

    private ValueTask<bool> RestoreRedisPixelAsync(RollbackPixel pixel) =>
        TrySetRedisPixelAsync(
            pixel,
            pixel.PriorPlacementId,
            pixel.Color,
            pixel.PlacementId,
            CancellationToken.None);

    private async ValueTask<bool> TrySetRedisPixelAsync(
        RollbackPixel pixel,
        Guid? expectedPlacementId,
        string replacementColor,
        Guid? replacementPlacementId,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var location = BoardGeometry.Locate(new BoardPosition(pixel.Row, pixel.Column));
        var prefix = redisOptions.Value.InstanceName;
        var result = await redis.GetDatabase().ScriptEvaluateAsync(
            CompareAndSetPixelScript,
            [
                $"{prefix}{BoardGeometry.GetTilePartitionKey(location.Tile)}",
                $"{prefix}{RedisAtomicPlacementStore.CurrentOwnersKey}"
            ],
            [
                location.Offset.Row + 1,
                location.Offset.Column + 1,
                $"{pixel.Row}:{pixel.Column}",
                expectedPlacementId?.ToString("N") ?? string.Empty,
                replacementColor,
                replacementPlacementId?.ToString("N") ?? string.Empty
            ]);
        var status = (int)result;
        if (status < 0)
        {
            throw new InvalidOperationException(
                $"Redis tile for placement '{pixel.PlacementId:N}' is unavailable.");
        }
        return status == 1;
    }

    private async ValueTask UpdateReportStatusAsync(
        ModerationActionCommand command,
        string status,
        CancellationToken cancellationToken)
    {
        if (command.ReportId is not { } reportId)
        {
            return;
        }

        const string sql =
            """
            UPDATE pixelboard.reports
            SET status = $1, updated_at = $2
            WHERE report_id = $3;
            """;
        await using var update = dataSource.CreateCommand(sql);
        update.Parameters.AddWithValue(status);
        update.Parameters.AddWithValue(command.CreatedAt);
        update.Parameters.AddWithValue(reportId.Value);
        if (await update.ExecuteNonQueryAsync(cancellationToken) != 1)
        {
            throw new InvalidOperationException("The report does not exist.");
        }
    }

    private static async ValueTask UpdateReportStatusAsync(
        ModerationActionCommand command,
        string status,
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        CancellationToken cancellationToken)
    {
        const string sql =
            """
            UPDATE pixelboard.reports
            SET status = $1, updated_at = $2
            WHERE report_id = $3;
            """;
        await using var update = new NpgsqlCommand(sql, connection, transaction);
        update.Parameters.AddWithValue(status);
        update.Parameters.AddWithValue(command.CreatedAt);
        update.Parameters.AddWithValue(
            command.ReportId?.Value
            ?? throw new ArgumentException("This action requires a report.", nameof(command)));
        if (await update.ExecuteNonQueryAsync(cancellationToken) != 1)
        {
            throw new InvalidOperationException("The report does not exist.");
        }
    }

    private async ValueTask CompleteAsync(
        ModerationActionCommand command,
        string status,
        CancellationToken cancellationToken)
    {
        const string sql =
            """
            UPDATE pixelboard.moderation_actions
            SET status = $1, completed_at = $2
            WHERE moderation_action_id = $3;
            """;
        await using var update = dataSource.CreateCommand(sql);
        update.Parameters.AddWithValue(status);
        update.Parameters.AddWithValue(DateTimeOffset.UtcNow);
        update.Parameters.AddWithValue(command.ActionId.Value);
        await update.ExecuteNonQueryAsync(cancellationToken);
    }

    private static ModerationReport ReadReport(NpgsqlDataReader reader) =>
        new(
            ReportId.From(reader.GetGuid(0)),
            ParseStatus(reader.GetString(1)),
            new ReportRegion(
                reader.GetInt32(2),
                reader.GetInt32(3),
                reader.GetInt32(4),
                reader.GetInt32(5)),
            ParseReason(reader.GetString(6)),
            reader.IsDBNull(7) ? null : reader.GetString(7),
            reader.GetString(8),
            reader.GetFieldValue<byte[]>(9),
            reader.GetFieldValue<DateTimeOffset>(10));

    private static bool JsonEquivalent(string left, string right)
    {
        return JsonNode.DeepEquals(JsonNode.Parse(left), JsonNode.Parse(right));
    }

    private static ReportId RequireReport(ModerationActionCommand command) =>
        command.ReportId ?? throw new ArgumentException(
            "This action requires a report.",
            nameof(command));

    private static AccountId RequireTarget(ModerationActionCommand command) =>
        command.TargetAccountId ?? throw new ArgumentException(
            "This action requires a target account.",
            nameof(command));

    private static ReportStatus ParseStatus(string value) =>
        value switch
        {
            "received" => ReportStatus.Received,
            "under_review" => ReportStatus.UnderReview,
            "actioned" => ReportStatus.Actioned,
            "closed" => ReportStatus.Closed,
            _ => throw new InvalidOperationException($"Unknown report status '{value}'.")
        };

    private static ReportReason ParseReason(string value) =>
        value switch
        {
            "explicit_sexual_content" => ReportReason.ExplicitSexualContent,
            "graphic_violence" => ReportReason.GraphicViolence,
            "hate_or_harassment" => ReportReason.HateOrHarassment,
            "threat" => ReportReason.Threat,
            "illegal_content" => ReportReason.IllegalContent,
            "copyright" => ReportReason.Copyright,
            "other" => ReportReason.Other,
            _ => throw new InvalidOperationException($"Unknown report reason '{value}'.")
        };

    private sealed record RollbackPixel(
        Guid PlacementId,
        int Row,
        int Column,
        string Color,
        string PriorColor,
        Guid? PriorPlacementId);

    private enum RollbackCommitOutcome
    {
        Committed,
        NotCommitted,
        Unknown
    }
}
