using System.Diagnostics.Metrics;
using System.Threading.Channels;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Options;
using PixelBoard.Configuration;
using PixelBoard.Contracts.V1;
using StackExchange.Redis;

namespace PixelBoard.Infrastructure.Realtime;

public enum RealtimePublicationResult
{
    Published,
    Failed
}

public interface IRealtimeEventPublisher
{
    ValueTask<RealtimePublicationResult> PublishAcceptedAsync(
        AcceptedPixelEventData acceptedPixel);
}

public sealed class RedisRealtimeEventPublisher(
    IConnectionMultiplexer redis,
    IOptions<RedisOptions> options,
    ILogger<RedisRealtimeEventPublisher> logger) : IRealtimeEventPublisher
{
    public const string ChannelSuffix = "Realtime:v1";

    private static readonly Meter Meter = new("PixelBoard.Realtime");
    private static readonly Counter<long> PublishedCounter =
        Meter.CreateCounter<long>("pixelboard.realtime.published");
    private static readonly Counter<long> PublicationFailedCounter =
        Meter.CreateCounter<long>("pixelboard.realtime.publication_failed");
    private readonly RedisChannel _channel =
        RedisChannel.Literal($"{options.Value.InstanceName}{ChannelSuffix}");

    public async ValueTask<RealtimePublicationResult> PublishAcceptedAsync(
        AcceptedPixelEventData acceptedPixel)
    {
        var envelope = new RealtimeEventEnvelope(
            RealtimeProtocol.V1,
            RealtimeProtocol.AcceptedPixelType,
            acceptedPixel);

        try
        {
            var subscriberCount = await redis.GetSubscriber().PublishAsync(
                _channel,
                RealtimeEventSerializer.Serialize(envelope));
            if (subscriberCount == 0)
            {
                PublicationFailedCounter.Add(1);
                logger.LogWarning(
                    "Accepted placement {PlacementId} was published with no active Redis subscribers.",
                    acceptedPixel.PlacementId);
                return RealtimePublicationResult.Failed;
            }

            PublishedCounter.Add(1);
            return RealtimePublicationResult.Published;
        }
        catch (RedisException exception)
        {
            PublicationFailedCounter.Add(1);
            logger.LogError(
                exception,
                "Failed to publish accepted placement {PlacementId} to Redis real-time channel.",
                acceptedPixel.PlacementId);
            return RealtimePublicationResult.Failed;
        }
        catch (ObjectDisposedException exception)
        {
            PublicationFailedCounter.Add(1);
            logger.LogError(
                exception,
                "Redis was unavailable while publishing accepted placement {PlacementId}.",
                acceptedPixel.PlacementId);
            return RealtimePublicationResult.Failed;
        }
    }
}

public sealed class RealtimeBoardHub : Hub<IRealtimeBoardClient>
{
}

public interface IRealtimeBoardClient
{
    Task AcceptedPixelV1(RealtimeEventEnvelope envelope);
}

public sealed class RedisRealtimeEventSubscriber(
    IConnectionMultiplexer redis,
    IOptions<RedisOptions> options,
    IHubContext<RealtimeBoardHub, IRealtimeBoardClient> hub,
    IHubContext<BoardHub> legacyHub,
    ILogger<RedisRealtimeEventSubscriber> logger) : BackgroundService
{
    private static readonly Meter Meter = new("PixelBoard.Realtime");
    private static readonly Counter<long> DeliveredCounter =
        Meter.CreateCounter<long>("pixelboard.realtime.delivered");
    private static readonly Counter<long> InvalidCounter =
        Meter.CreateCounter<long>("pixelboard.realtime.invalid");
    private readonly RedisChannel _channel =
        RedisChannel.Literal($"{options.Value.InstanceName}{RedisRealtimeEventPublisher.ChannelSuffix}");
    private readonly ISubscriber _subscriber = redis.GetSubscriber();
    private readonly Channel<string> _messages = Channel.CreateUnbounded<string>(
        new UnboundedChannelOptions
        {
            SingleReader = true,
            SingleWriter = false
        });

    public override async Task StartAsync(CancellationToken cancellationToken)
    {
        await _subscriber.SubscribeAsync(
            _channel,
            (_, value) => _messages.Writer.TryWrite(value.ToString()));
        await base.StartAsync(cancellationToken);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await foreach (var message in _messages.Reader.ReadAllAsync(stoppingToken))
            {
                RealtimeEventEnvelope? envelope;
                try
                {
                    envelope = RealtimeEventSerializer.Deserialize(message);
                }
                catch (System.Text.Json.JsonException exception)
                {
                    InvalidCounter.Add(1);
                    logger.LogWarning(exception, "Discarded malformed Redis real-time event.");
                    continue;
                }

                if (envelope is null
                    || envelope.ProtocolVersion != RealtimeProtocol.V1
                    || envelope.Type != RealtimeProtocol.AcceptedPixelType
                    || envelope.Data is null
                    || envelope.Data.Pixel is null)
                {
                    InvalidCounter.Add(1);
                    logger.LogWarning("Discarded unsupported Redis real-time event.");
                    continue;
                }

                await hub.Clients.All.AcceptedPixelV1(envelope);
                await legacyHub.Clients.All.SendAsync(
                    "UpdateBoard",
                    envelope.Data.Pixel.Row,
                    envelope.Data.Pixel.Column,
                    envelope.Data.Pixel.Color,
                    stoppingToken);
                DeliveredCounter.Add(1);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
        finally
        {
            await _subscriber.UnsubscribeAsync(_channel);
            _messages.Writer.TryComplete();
        }
    }
}
