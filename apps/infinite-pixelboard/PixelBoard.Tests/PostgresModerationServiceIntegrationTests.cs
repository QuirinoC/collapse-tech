using Microsoft.Extensions.Options;
using Npgsql;
using PixelBoard.Application;
using PixelBoard.Configuration;
using PixelBoard.Contracts.V1;
using PixelBoard.Domain;
using PixelBoard.Infrastructure.Board;
using PixelBoard.Infrastructure.Ledger;
using PixelBoard.Infrastructure.Moderation;
using PixelBoard.Infrastructure.Postgres;
using StackExchange.Redis;

namespace PixelBoard.Tests;

public sealed class PostgresModerationServiceIntegrationTests
{
    [PostgresRedisFact]
    [Trait("Category", "Integration")]
    public async Task SafetyUpdatesAreAuditedIdempotentAndConflictOnChangedInput()
    {
        await using var fixture = await Fixture.CreateAsync();
        var actor = new AccountId($"moderator-{Guid.NewGuid():N}");
        var key = $"safety-{Guid.NewGuid():N}";
        var command = Command(actor, "safety_update", key, "Emergency safety test");

        var result = await fixture.Service.SetSafetyStateAsync(
            command,
            new PlatformSafetyState(true, true));
        var replay = await fixture.Service.SetSafetyStateAsync(
            command with { ActionId = ModerationActionId.New() },
            new PlatformSafetyState(true, true));

        Assert.Equal("completed", result.Status);
        Assert.True(replay.IsReplay);
        Assert.Equal(result.ActionId, replay.ActionId);
        Assert.Equal(new PlatformSafetyState(true, true), await fixture.Service.GetStateAsync());
        Assert.Equal(1, await fixture.ScalarAsync<int>(
            """
            SELECT count(*)::integer
            FROM pixelboard.audit_events
            WHERE subject_id = $1;
            """,
            result.ActionId.Value.ToString("N")));

        await Assert.ThrowsAsync<ModerationConflictException>(
            async () => await fixture.Service.SetSafetyStateAsync(
                command with { ActionId = ModerationActionId.New() },
                new PlatformSafetyState(false, true)));

        await fixture.Service.SetSafetyStateAsync(
            Command(
                actor,
                "safety_update",
                $"restore-{Guid.NewGuid():N}",
                "Restore test safety state"),
            new PlatformSafetyState(false, true));
    }

    [PostgresRedisFact]
    [Trait("Category", "Integration")]
    public async Task BanIsDurableAndEnforcedByAccountPolicy()
    {
        await using var fixture = await Fixture.CreateAsync();
        var actor = new AccountId($"moderator-{Guid.NewGuid():N}");
        var target = new AccountId($"target-{Guid.NewGuid():N}");
        var command = Command(actor, "ban", $"ban-{Guid.NewGuid():N}", "Abuse")
            with
        { TargetAccountId = target };

        var result = await fixture.Service.ExecuteAsync(command);
        var policy = await new PostgresAccountStateService(fixture.DataSource).GetAsync(
            target,
            "test-version");

        Assert.Equal("completed", result.Status);
        Assert.True(policy.IsBanned);
        Assert.Equal(1, await fixture.ScalarAsync<int>(
            """
            SELECT count(*)::integer
            FROM pixelboard.audit_events
            WHERE subject_id = $1;
            """,
            result.ActionId.Value.ToString("N")));
    }

    [PostgresRedisFact]
    [Trait("Category", "Integration")]
    public async Task RollbackRestoresPriorPixelAtNegativeCoordinates()
    {
        await using var fixture = await Fixture.CreateAsync();
        var priorPlacementId = Guid.NewGuid();
        var currentPlacementId = Guid.NewGuid();
        var row = -Random.Shared.Next(1, 1_000_000);
        var column = -Random.Shared.Next(1, 1_000_000);
        var now = DateTimeOffset.UtcNow;
        await fixture.ExecuteAsync(
            """
            INSERT INTO pixelboard.placements (
                placement_id, firebase_uid, board_row, board_column, color, placed_at,
                client_platform, client_version, idempotency_key, prior_placement_id,
                prior_color, redis_stream_id, stream_timestamp_ms, stream_sequence)
            VALUES
                ($1, 'prior-owner', $10, $11, '#112233', $3, 'test', '1', $4,
                    NULL, '#FFFFFF', $5, $6, 0),
                ($2, 'current-owner', $10, $11, '#AABBCC', $3, 'test', '1', $7,
                    $1, '#112233', $8, $9, 0);
            """,
            priorPlacementId,
            currentPlacementId,
            now,
            $"prior-{Guid.NewGuid():N}",
            $"{now.ToUnixTimeMilliseconds()}-0",
            now.ToUnixTimeMilliseconds(),
            $"current-{Guid.NewGuid():N}",
            $"{now.ToUnixTimeMilliseconds() + 1}-0",
            now.ToUnixTimeMilliseconds() + 1,
            row,
            column);
        await fixture.SetRedisPixelAsync(
            new BoardPosition(row, column),
            "#AABBCC",
            currentPlacementId);
        await fixture.ExecuteAsync(
            """
            INSERT INTO pixelboard.current_pixels (
                board_row, board_column, placement_id, stream_timestamp_ms, stream_sequence)
            VALUES ($3, $4, $1, $2, 0);
            """,
            currentPlacementId,
            now.ToUnixTimeMilliseconds() + 1,
            row,
            column);

        var result = await fixture.Service.ExecuteAsync(
            Command(
                new AccountId($"moderator-{Guid.NewGuid():N}"),
                "rollback",
                $"rollback-{Guid.NewGuid():N}",
                "Restore prior pixel")
            with
            { PlacementIds = [PlacementId.From(currentPlacementId)] });

        Assert.Equal("completed", result.Status);
        Assert.Equal(
            "#112233",
            await fixture.GetRedisPixelAsync(new BoardPosition(row, column)));
        Assert.Equal(priorPlacementId, await fixture.ScalarAsync<Guid>(
            """
            SELECT placement_id
            FROM pixelboard.current_pixels
            WHERE board_row = $1 AND board_column = $2;
            """,
            row,
            column));
        Assert.Equal(
            priorPlacementId.ToString("N"),
            await fixture.Redis.GetDatabase().HashGetAsync(
                $"{fixture.RedisInstanceName}{RedisAtomicPlacementStore.CurrentOwnersKey}",
                $"{row}:{column}"));
    }

    [PostgresRedisFact]
    [Trait("Category", "Integration")]
    public async Task RollbackDoesNotOverwriteNewerRedisPlacement()
    {
        await using var fixture = await Fixture.CreateAsync();
        var currentPlacementId = Guid.NewGuid();
        var newerPlacementId = Guid.NewGuid();
        var row = Random.Shared.Next(1, 1_000_000);
        var column = Random.Shared.Next(1, 1_000_000);
        var now = DateTimeOffset.UtcNow;
        await fixture.ExecuteAsync(
            """
            INSERT INTO pixelboard.placements (
                placement_id, firebase_uid, board_row, board_column, color, placed_at,
                client_platform, client_version, idempotency_key, prior_placement_id,
                prior_color, redis_stream_id, stream_timestamp_ms, stream_sequence)
            VALUES ($1, 'current-owner', $4, $5, '#AABBCC', $2, 'test', '1', $3,
                NULL, '#FFFFFF', $6, $7, 0);
            """,
            currentPlacementId,
            now,
            $"current-{Guid.NewGuid():N}",
            row,
            column,
            $"{now.ToUnixTimeMilliseconds()}-0",
            now.ToUnixTimeMilliseconds());
        await fixture.ExecuteAsync(
            """
            INSERT INTO pixelboard.current_pixels (
                board_row, board_column, placement_id, stream_timestamp_ms, stream_sequence)
            VALUES ($3, $4, $1, $2, 0);
            """,
            currentPlacementId,
            now.ToUnixTimeMilliseconds(),
            row,
            column);
        await fixture.SetRedisPixelAsync(
            new BoardPosition(row, column),
            "#D3523C",
            newerPlacementId);

        await Assert.ThrowsAsync<ModerationConflictException>(
            async () => await fixture.Service.ExecuteAsync(
                Command(
                    new AccountId($"moderator-{Guid.NewGuid():N}"),
                    "rollback",
                    $"rollback-{Guid.NewGuid():N}",
                    "Restore prior pixel")
                with
                { PlacementIds = [PlacementId.From(currentPlacementId)] }));

        Assert.Equal(
            "#D3523C",
            await fixture.GetRedisPixelAsync(new BoardPosition(row, column)));
        Assert.Equal(
            newerPlacementId.ToString("N"),
            await fixture.Redis.GetDatabase().HashGetAsync(
                $"{fixture.RedisInstanceName}{RedisAtomicPlacementStore.CurrentOwnersKey}",
                $"{row}:{column}"));
    }

    [PostgresRedisFact]
    [Trait("Category", "Integration")]
    public async Task QuarantineMasksRegionInPublicTileSnapshot()
    {
        await using var fixture = await Fixture.CreateAsync();
        var reportId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;
        await fixture.ExecuteAsync(
            """
            INSERT INTO pixelboard.reports (
                report_id, reporter_firebase_uid, region_top, region_left,
                region_width, region_height, reason, note, status, snapshot,
                evidence_hash, submitted_at, updated_at, client_platform, client_version)
            VALUES ($1, 'reporter', -1, -1, 1, 1, 'other', NULL, 'received',
                '{}'::jsonb, '\x00'::bytea, $2, $2, 'test', '1');
            """,
            reportId,
            now);
        await fixture.Service.ExecuteAsync(
            Command(
                new AccountId($"moderator-{Guid.NewGuid():N}"),
                "quarantine",
                $"quarantine-{Guid.NewGuid():N}",
                "Hide reported content")
            with
            { ReportId = ReportId.From(reportId) });
        var tile = BoardTileSerializer.CreateDefault();
        tile[127][127] = "#112233";

        await fixture.Service.ApplyAsync(new TileAddress(-1, -1), tile);

        Assert.Equal(PixelBoardConstants.DefaultColor, tile[127][127]);
        Assert.False(await fixture.Service.IsVisibleAsync(new BoardPosition(-1, -1)));
        Assert.True(await fixture.Service.IsVisibleAsync(new BoardPosition(-2, -1)));
    }

    private static ModerationActionCommand Command(
        AccountId actor,
        string actionType,
        string key,
        string reason) =>
        new(
            ModerationActionId.New(),
            key,
            actor,
            actionType,
            reason,
            null,
            null,
            [],
            null,
            DateTimeOffset.UtcNow);

    private sealed class Fixture : IAsyncDisposable
    {
        private Fixture(
            NpgsqlDataSource dataSource,
            ConnectionMultiplexer redis,
            string redisInstanceName,
            PostgresModerationService service)
        {
            DataSource = dataSource;
            Redis = redis;
            RedisInstanceName = redisInstanceName;
            Service = service;
        }

        public NpgsqlDataSource DataSource { get; }

        public ConnectionMultiplexer Redis { get; }

        public string RedisInstanceName { get; }

        public PostgresModerationService Service { get; }

        private readonly HashSet<RedisKey> _testKeys = [];

        public static async Task<Fixture> CreateAsync()
        {
            var dataSource = NpgsqlDataSource.Create(
                Environment.GetEnvironmentVariable("PIXELBOARD_TEST_POSTGRES")!);
            var redis = await ConnectionMultiplexer.ConnectAsync(
                Environment.GetEnvironmentVariable("PIXELBOARD_TEST_REDIS")!);
            var redisInstanceName = $"ModerationTests_{Guid.NewGuid():N}_";
            var service = new PostgresModerationService(
                dataSource,
                redis,
                Options.Create(new RedisOptions
                {
                    ConnectionString = Environment.GetEnvironmentVariable(
                        "PIXELBOARD_TEST_REDIS")!,
                    InstanceName = redisInstanceName
                }));
            return new Fixture(dataSource, redis, redisInstanceName, service);
        }

        public async Task SetRedisPixelAsync(
            BoardPosition position,
            string color,
            Guid placementId)
        {
            var location = BoardGeometry.Locate(position);
            var tile = BoardTileSerializer.CreateDefault();
            tile[location.Offset.Row][location.Offset.Column] = color;
            var tileKey =
                $"{RedisInstanceName}{BoardGeometry.GetTilePartitionKey(location.Tile)}";
            var ownersKey =
                $"{RedisInstanceName}{RedisAtomicPlacementStore.CurrentOwnersKey}";
            _testKeys.Add(tileKey);
            _testKeys.Add(ownersKey);
            var database = Redis.GetDatabase();
            await database.HashSetAsync(
                tileKey,
                "data",
                BoardTileSerializer.Serialize(tile));
            await database.HashSetAsync(
                ownersKey,
                $"{position.Row}:{position.Column}",
                placementId.ToString("N"));
        }

        public async Task<string> GetRedisPixelAsync(BoardPosition position)
        {
            var location = BoardGeometry.Locate(position);
            var serialized = await Redis.GetDatabase().HashGetAsync(
                $"{RedisInstanceName}{BoardGeometry.GetTilePartitionKey(location.Tile)}",
                "data");
            var tile = BoardTileSerializer.Deserialize(serialized!);
            return tile[location.Offset.Row][location.Offset.Column];
        }

        public async Task<T> ScalarAsync<T>(string sql, params object[] values)
        {
            await using var command = DataSource.CreateCommand(sql);
            foreach (var value in values)
            {
                command.Parameters.AddWithValue(value);
            }

            return (T)(await command.ExecuteScalarAsync()
                ?? throw new InvalidOperationException("Expected a scalar value."));
        }

        public async Task ExecuteAsync(string sql, params object[] values)
        {
            await using var command = DataSource.CreateCommand(sql);
            foreach (var value in values)
            {
                command.Parameters.AddWithValue(value);
            }

            await command.ExecuteNonQueryAsync();
        }

        public async ValueTask DisposeAsync()
        {
            if (_testKeys.Count > 0)
            {
                await Redis.GetDatabase().KeyDeleteAsync([.. _testKeys]);
            }
            await Redis.CloseAsync();
            Redis.Dispose();
            await DataSource.DisposeAsync();
        }
    }

}
