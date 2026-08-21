using System.Text.Json;
using PixelBoard.Contracts.V1;

namespace PixelBoard.Tests;

public sealed class ApiContractTests
{
    [Fact]
    public void StableIdentifiersSerializeAsOpaqueStrings()
    {
        var value = Guid.Parse("4e70b8e5-83d3-4f6d-9de2-1538ab3d99d2");
        var identifier = PlacementId.From(value);

        var json = JsonSerializer.Serialize(identifier);
        var restored = JsonSerializer.Deserialize<PlacementId>(json);

        Assert.Equal("\"4e70b8e583d34f6d9de21538ab3d99d2\"", json);
        Assert.Equal(identifier, restored);
    }

    [Fact]
    public void PublicAcceptedPixelEventContainsNoPrivateIdentity()
    {
        var eventPayload = new AcceptedPixelEvent(
            "pixel.accepted",
            PlacementId.From(Guid.Parse("4e70b8e5-83d3-4f6d-9de2-1538ab3d99d2")),
            new PixelState(9, 12, "#112233", DateTimeOffset.UnixEpoch));

        var json = JsonSerializer.Serialize(eventPayload);

        Assert.DoesNotContain("firebase", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("uid", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("ip", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("device", json, StringComparison.OrdinalIgnoreCase);
    }
}
