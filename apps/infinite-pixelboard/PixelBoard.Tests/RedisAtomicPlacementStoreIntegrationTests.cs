using System.Text.Json;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Caching.StackExchangeRedis;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using PixelBoard.Configuration;
using PixelBoard.Contracts.V1;
using PixelBoard.Domain;
using PixelBoard.Infrastructure.Ledger;
using StackExchange.Redis;

namespace PixelBoard.Tests;

public sealed class RedisAtomicPlacementStoreIntegrationTests
{
    [RedisFact]
    [Trait("Category", "Integration")]
    public async Task PlacementUpdatesBoardOwnershipAndOutboxAtomically()
    {
        var connectionString = Environment.GetEnvironmentVariable("PIXELBOARD_TEST_REDIS")!;

        await using var redis = await ConnectionMultiplexer.ConnectAsync(connectionString);
        var instanceName = $"PixelBoardTest_{Guid.NewGuid():N}_";
        using var cache = new RedisCache(Options.Create(new RedisCacheOptions
        {
            Configuration = connectionString,
            InstanceName = instanceName
        }));
        var store = new RedisAtomicPlacementStore(
            redis,
            Options.Create(new RedisOptions
            {
                ConnectionString = connectionString,
                InstanceName = instanceName
            }));
        var seededPixels = BoardTileSerializer.CreateDefault();
        seededPixels[127][0] = "#654321";
        await cache.SetStringAsync(
            "MainBoard_-1_1",
            BoardTileSerializer.Serialize(seededPixels));
        var placementId = PlacementId.New();
        var placement = new PlacementLedgerEvent(
            placementId,
            "firebase-test-user",
            -1,
            128,
            "#ABCDEF",
            DateTimeOffset.UtcNow,
            "test",
            "1.0",
            "request-1",
            null,
            null,
            null,
            null);

        var cooldown = TimeSpan.FromSeconds(10);
        var result = await store.PlaceAsync(placement, cooldown);

        var database = redis.GetDatabase();
        var tileJson = await cache.GetStringAsync("MainBoard_-1_1");
        var pixels = BoardTileSerializer.Deserialize(tileJson!);
        var owner = await database.HashGetAsync(
            $"{instanceName}{RedisAtomicPlacementStore.CurrentOwnersKey}",
            "-1:128");
        var entries = await database.StreamRangeAsync(
            $"{instanceName}{RedisAtomicPlacementStore.OutboxKey}");
        var payload = Assert.Single(entries).Values.Single().Value.ToString();
        using var payloadJson = JsonDocument.Parse(payload);

        Assert.Equal("#ABCDEF", pixels[127][0]);
        Assert.Equal(placementId.Value.ToString("N"), owner);
        Assert.Equal("#654321", result.PriorColor);
        Assert.Equal(placementId, result.PlacementId);
        Assert.False(result.IsDuplicate);
        Assert.Null(result.PriorPlacementId);
        Assert.Equal("#654321", payloadJson.RootElement.GetProperty("priorColor").GetString());
        Assert.Equal(
            placementId.Value.ToString("N"),
            payloadJson.RootElement.GetProperty("placementId").GetString());

        var replacementId = PlacementId.New();
        var replacement = placement with
        {
            PlacementId = replacementId,
            FirebaseUid = "firebase-test-user-2",
            Color = "#123456",
            IdempotencyKey = "request-2"
        };

        var replacementResult = await store.PlaceAsync(replacement, cooldown);
        var replacedEntries = await database.StreamRangeAsync(
            $"{instanceName}{RedisAtomicPlacementStore.OutboxKey}");

        Assert.Equal("#ABCDEF", replacementResult.PriorColor);
        Assert.Equal(placementId, replacementResult.PriorPlacementId);
        Assert.Equal(2, replacedEntries.Length);
        Assert.Equal(
            replacementId.Value.ToString("N"),
            await database.HashGetAsync(
                $"{instanceName}{RedisAtomicPlacementStore.CurrentOwnersKey}",
                "-1:128"));

        var duplicate = replacement with
        {
            PlacementId = PlacementId.New()
        };
        var duplicateResult = await store.PlaceAsync(duplicate, cooldown);
        var finalTile = BoardTileSerializer.Deserialize(
            (await cache.GetStringAsync("MainBoard_-1_1"))!);

        Assert.True(duplicateResult.IsDuplicate);
        Assert.Equal(replacementId, duplicateResult.PlacementId);
        Assert.Equal(replacementResult.StreamEntryId, duplicateResult.StreamEntryId);
        Assert.Equal("#123456", finalTile[127][0]);
        Assert.Equal(
            2,
            await database.StreamLengthAsync(
                $"{instanceName}{RedisAtomicPlacementStore.OutboxKey}"));

        var conflictingDuplicate = duplicate with { Color = "#FEDCBA" };
        var conflictResult = await store.PlaceAsync(conflictingDuplicate, cooldown);

        Assert.False(conflictResult.IsAccepted);
        Assert.True(conflictResult.IsIdempotencyConflict);
        Assert.Null(conflictResult.PlacementId);
        Assert.Equal(
            2,
            await database.StreamLengthAsync(
                $"{instanceName}{RedisAtomicPlacementStore.OutboxKey}"));

        var limited = replacement with
        {
            PlacementId = PlacementId.New(),
            IdempotencyKey = "request-3"
        };
        var limitedResult = await store.PlaceAsync(limited, cooldown);

        Assert.False(limitedResult.IsAccepted);
        Assert.Null(limitedResult.PlacementId);
        Assert.InRange(
            limitedResult.RemainingCooldown,
            TimeSpan.FromMilliseconds(1),
            cooldown);
        Assert.Equal(
            2,
            await database.StreamLengthAsync(
                $"{instanceName}{RedisAtomicPlacementStore.OutboxKey}"));

        await database.KeyDeleteAsync(
        [
            $"{instanceName}MainBoard_-1_1",
            $"{instanceName}{RedisAtomicPlacementStore.CurrentOwnersKey}",
            $"{instanceName}{RedisAtomicPlacementStore.OutboxKey}"
        ]);
    }

    [RedisFact]
    [Trait("Category", "Integration")]
    public async Task OutboxWorkerReclaimsAndIngestsAbandonedPendingEntry()
    {
        var connectionString = Environment.GetEnvironmentVariable("PIXELBOARD_TEST_REDIS")!;

        await using var redis = await ConnectionMultiplexer.ConnectAsync(connectionString);
        var instanceName = $"PixelBoardTest_{Guid.NewGuid():N}_";
        var streamKey = $"{instanceName}{RedisAtomicPlacementStore.OutboxKey}";
        var database = redis.GetDatabase();
        var placement = new PlacementLedgerEvent(
            PlacementId.New(),
            "firebase-test-user",
            100,
            200,
            "#ABCDEF",
            DateTimeOffset.UtcNow,
            "test",
            "1.0",
            "recovery-request",
            null,
            "#FFFFFF",
            null,
            null);
        var payload = JsonSerializer.Serialize(
            placement,
            new JsonSerializerOptions(JsonSerializerDefaults.Web));
        await database.StreamAddAsync(streamKey, "payload", payload);
        await database.StreamAddAsync(streamKey, "payload", payload);
        await database.StreamAddAsync(streamKey, "payload", payload);
        await database.StreamCreateConsumerGroupAsync(
            streamKey,
            "postgres-ledger",
            StreamPosition.Beginning);
        var abandoned = await database.StreamReadGroupAsync(
            streamKey,
            "postgres-ledger",
            "abandoned-consumer",
            StreamPosition.NewMessages,
            count: 3);
        Assert.Equal(3, abandoned.Length);

        await Task.Delay(10);
        var ledger = new RecordingPlacementLedger(expectedCount: 3);
        var worker = new PlacementOutboxWorker(
            redis,
            ledger,
            Options.Create(new RedisOptions
            {
                ConnectionString = connectionString,
                InstanceName = instanceName
            }),
            Options.Create(new PlacementOutboxOptions
            {
                BatchSize = 1,
                ClaimIdleMilliseconds = 1,
                EmptyPollMilliseconds = 10
            }),
            NullLogger<PlacementOutboxWorker>.Instance);

        await worker.StartAsync(CancellationToken.None);
        var ingested = await ledger.Ingested.Task.WaitAsync(TimeSpan.FromSeconds(2));
        await worker.StopAsync(CancellationToken.None);

        Assert.Equal(placement, ingested);
        Assert.Equal(0, await database.StreamLengthAsync(streamKey));
        await database.KeyDeleteAsync(streamKey);
    }

    private sealed class RecordingPlacementLedger(int expectedCount = 1) : IPlacementLedger
    {
        private int _count;

        public TaskCompletionSource<PlacementLedgerEvent> Ingested { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        public ValueTask IngestAsync(
            PlacementLedgerEvent placement,
            string streamEntryId,
            CancellationToken cancellationToken = default)
        {
            if (Interlocked.Increment(ref _count) == expectedCount)
            {
                Ingested.TrySetResult(placement);
            }

            return ValueTask.CompletedTask;
        }
    }
}
