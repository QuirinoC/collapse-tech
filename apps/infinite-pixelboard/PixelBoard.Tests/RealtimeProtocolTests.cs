using Microsoft.Extensions.Logging.Abstractions;
using PixelBoard.Application;
using PixelBoard.Contracts.V1;
using PixelBoard.Domain;
using PixelBoard.Infrastructure.Realtime;

namespace PixelBoard.Tests;

public sealed class RealtimeProtocolTests
{
    [Fact]
    public void AcceptedPixelEnvelopeHasStableV1Shape()
    {
        Assert.Equal(
            RealtimeProtocol.AcceptedPixelClientMethod,
            nameof(IRealtimeBoardClient.AcceptedPixelV1));

        var envelope = new RealtimeEventEnvelope(
            RealtimeProtocol.V1,
            RealtimeProtocol.AcceptedPixelType,
            "1730000000000-0",
            new AcceptedPixelEventData(
                PlacementId.From(Guid.Parse("4e70b8e5-83d3-4f6d-9de2-1538ab3d99d2")),
                new PixelState(9, 12, "#112233", DateTimeOffset.UnixEpoch)));

        var json = RealtimeEventSerializer.Serialize(envelope);

        Assert.Equal(
            """{"protocolVersion":1,"type":"pixel.accepted","cursor":"1730000000000-0","data":{"placementId":"4e70b8e583d34f6d9de21538ab3d99d2","pixel":{"row":9,"column":12,"color":"#112233","placedAt":"1970-01-01T00:00:00+00:00"}}}""",
            json);
        Assert.Equal(envelope, RealtimeEventSerializer.Deserialize(json));
    }

    [Fact]
    public void AcceptedPixelEnvelopeContainsNoPrivatePlacementFields()
    {
        var json = RealtimeEventSerializer.Serialize(
            new RealtimeEventEnvelope(
                RealtimeProtocol.V1,
                RealtimeProtocol.AcceptedPixelType,
                "1730000000000-0",
                new AcceptedPixelEventData(
                    PlacementId.New(),
                    new PixelState(1, 2, "#ABCDEF", DateTimeOffset.UtcNow))));

        string[] privateNames =
        [
            "firebase",
            "uid",
            "ipHash",
            "deviceHash",
            "priorPlacement",
            "priorColor",
            "moderation",
            "account"
        ];

        foreach (var privateName in privateNames)
        {
            Assert.DoesNotContain(privateName, json, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task QuarantinedPixelIsNotEligibleForClientDelivery()
    {
        var visibility = new StubVisibilityFilter(false);
        var policy = new RealtimeEventDeliveryPolicy(
            visibility,
            NullLogger<RealtimeEventDeliveryPolicy>.Instance);
        var envelope = new RealtimeEventEnvelope(
            RealtimeProtocol.V1,
            RealtimeProtocol.AcceptedPixelType,
            "1730000000000-0",
            new AcceptedPixelEventData(
                PlacementId.New(),
                new PixelState(9, 12, "#112233", DateTimeOffset.UnixEpoch)));

        var canDeliver = await policy.CanDeliverAsync(envelope);

        Assert.False(canDeliver);
        Assert.Equal(new BoardPosition(9, 12), visibility.Position);
    }

    private sealed class StubVisibilityFilter(bool isVisible) : IBoardVisibilityFilter
    {
        public BoardPosition? Position { get; private set; }

        public ValueTask<bool> IsVisibleAsync(
            BoardPosition position,
            CancellationToken cancellationToken = default)
        {
            Position = position;
            return ValueTask.FromResult(isVisible);
        }

        public ValueTask ApplyAsync(
            TileAddress tile,
            string[][] pixels,
            CancellationToken cancellationToken = default) =>
            ValueTask.CompletedTask;
    }
}
