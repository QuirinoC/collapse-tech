using System.Diagnostics.Metrics;
using System.Text.Json;
using Microsoft.Extensions.Options;
using PixelBoard.Configuration;
using StackExchange.Redis;

namespace PixelBoard.Infrastructure.Ledger;

public sealed class PlacementOutboxWorker(
    IConnectionMultiplexer redis,
    IPlacementLedger ledger,
    IOptions<RedisOptions> redisOptions,
    IOptions<PlacementOutboxOptions> outboxOptions,
    ILogger<PlacementOutboxWorker> logger) : BackgroundService
{
    private const string ConsumerGroup = "postgres-ledger";
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly Meter Meter = new("PixelBoard.PlacementOutbox");
    private static readonly Counter<long> IngestedCounter =
        Meter.CreateCounter<long>("pixelboard.placement_outbox.ingested");
    private static readonly Counter<long> FailedCounter =
        Meter.CreateCounter<long>("pixelboard.placement_outbox.failed");
    private static readonly Counter<long> ReclaimedCounter =
        Meter.CreateCounter<long>("pixelboard.placement_outbox.reclaimed");
    private readonly RedisKey _streamKey =
        $"{redisOptions.Value.InstanceName}{RedisAtomicPlacementStore.OutboxKey}";
    private readonly string _consumerName =
        $"{Environment.MachineName}-{Guid.NewGuid():N}";
    private readonly PlacementOutboxOptions _outboxOptions = outboxOptions.Value;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var database = redis.GetDatabase();
        await EnsureConsumerGroupAsync(database);
        RedisValue reclaimStartId = "0-0";

        while (!stoppingToken.IsCancellationRequested)
        {
            var reclaimed = await database.StreamAutoClaimAsync(
                _streamKey,
                ConsumerGroup,
                _consumerName,
                _outboxOptions.ClaimIdleMilliseconds,
                reclaimStartId,
                _outboxOptions.BatchSize);
            reclaimStartId = reclaimed.NextStartId;
            var entries = reclaimed.ClaimedEntries;

            if (entries.Length > 0)
            {
                ReclaimedCounter.Add(entries.Length);
            }
            else
            {
                entries = await database.StreamReadGroupAsync(
                    _streamKey,
                    ConsumerGroup,
                    _consumerName,
                    StreamPosition.NewMessages,
                    count: _outboxOptions.BatchSize);
            }

            if (entries.Length == 0)
            {
                await Task.Delay(
                    TimeSpan.FromMilliseconds(_outboxOptions.EmptyPollMilliseconds),
                    stoppingToken);
                continue;
            }

            await ProcessEntriesAsync(database, entries, stoppingToken);
        }
    }

    private async Task ProcessEntriesAsync(
        IDatabase database,
        StreamEntry[] entries,
        CancellationToken stoppingToken)
    {
        foreach (var entry in entries)
        {
            try
            {
                var payload = entry.Values.Single(value => value.Name == "payload").Value;
                var placement = JsonSerializer.Deserialize<PlacementLedgerEvent>(
                    payload.ToString(),
                    JsonOptions) ?? throw new JsonException("Placement event was empty.");

                await ledger.IngestAsync(placement, entry.Id!, stoppingToken);
                var transaction = database.CreateTransaction();
                var acknowledge = transaction.StreamAcknowledgeAsync(
                    _streamKey,
                    ConsumerGroup,
                    entry.Id);
                var delete = transaction.StreamDeleteAsync(_streamKey, [entry.Id]);
                if (!await transaction.ExecuteAsync())
                {
                    throw new RedisException(
                        $"Could not acknowledge outbox entry '{entry.Id}'.");
                }

                await Task.WhenAll(acknowledge, delete);
                IngestedCounter.Add(1);
            }
            catch (Exception exception) when (!stoppingToken.IsCancellationRequested)
            {
                FailedCounter.Add(1);
                logger.LogError(
                    exception,
                    "Failed to ingest placement outbox entry {StreamEntryId}.",
                    entry.Id);
            }
        }
    }

    private async Task EnsureConsumerGroupAsync(IDatabase database)
    {
        try
        {
            await database.StreamCreateConsumerGroupAsync(
                _streamKey,
                ConsumerGroup,
                StreamPosition.Beginning,
                createStream: true);
        }
        catch (RedisServerException exception)
            when (exception.Message.StartsWith("BUSYGROUP", StringComparison.Ordinal))
        {
            logger.LogDebug("Placement outbox consumer group already exists.");
        }
    }
}
