using PixelBoard.Api.V1;
using PixelBoard.Contracts.V1;
using PixelBoard.Domain;
using PixelBoard.Infrastructure.Board;

namespace PixelBoard.Tests;

public sealed class BoardApiTests
{
    [Fact]
    public void MetadataDescribesFrozenBoardContract()
    {
        var response = BoardApi.GetMetadata();

        Assert.Equal(ApiVersions.V1, response.ApiVersion);
        Assert.Equal(PixelBoardConstants.TileRows, response.TileRows);
        Assert.Equal(PixelBoardConstants.TileCols, response.TileColumns);
        Assert.Equal(PixelBoardConstants.DefaultColor, response.DefaultColor);
        Assert.Equal("row-column", response.CoordinateConvention);
        Assert.Equal(BoardAccessMode.Open, response.AccessMode);
    }

    [Fact]
    public async Task TileSnapshotPreservesAddressPixelsAndCaptureTime()
    {
        var capturedAt = DateTimeOffset.FromUnixTimeSeconds(1_700_000_000);
        var pixels = BoardTileSerializer.CreateDefault();
        pixels[127][0] = "#123456";
        var boardStore = new RecordingBoardStore(pixels);

        var response = await BoardApi.GetTileAsync(
            -1,
            4,
            boardStore,
            new FixedTimeProvider(capturedAt),
            CancellationToken.None);

        Assert.Equal(ApiVersions.V1, response.ApiVersion);
        Assert.Equal(-1, response.TileRow);
        Assert.Equal(4, response.TileColumn);
        Assert.Same(pixels, response.Pixels);
        Assert.Equal(capturedAt, response.CapturedAt);
        Assert.Equal(new TileAddress(-1, 4), boardStore.RequestedTile);
    }

    private sealed class RecordingBoardStore(string[][] pixels) : IBoardStore
    {
        public TileAddress? RequestedTile { get; private set; }

        public ValueTask<string[][]> GetTileAsync(
            TileAddress tile,
            CancellationToken cancellationToken = default)
        {
            RequestedTile = tile;
            return ValueTask.FromResult(pixels);
        }

        public ValueTask SetPixelAsync(
            BoardPosition position,
            string color,
            CancellationToken cancellationToken = default)
        {
            throw new NotSupportedException();
        }

        public ValueTask CheckHealthAsync(CancellationToken cancellationToken = default)
        {
            return ValueTask.CompletedTask;
        }
    }

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }
}
