using PixelBoard.Api.V1;
using PixelBoard.Contracts.V1;
using PixelBoard.Domain;
using PixelBoard.Infrastructure.Board;

namespace PixelBoard.Tests;

public sealed class PixelArtApiTests
{
    [Fact]
    public async Task FillWritesEveryPixelWithoutApplyingPlacementCooldown()
    {
        var store = new RecordingBoardStore();
        var request = new PixelArtFillRequest(
        [
            new PixelArtPixel(-2, -1, "#d3523c"),
            new PixelArtPixel(0, 0, "#DC9B32")
        ]);

        var result = await PixelArtApi.FillAsync(
            request,
            store,
            CancellationToken.None);

        var response = Assert.IsType<Microsoft.AspNetCore.Http.HttpResults.Ok<PixelArtFillResponse>>(result);
        Assert.Equal(2, response.Value!.PixelsWritten);
        Assert.Equal(
            [
                (new BoardPosition(-2, -1), "#D3523C"),
                (new BoardPosition(0, 0), "#DC9B32")
            ],
            store.Writes);
    }

    [Fact]
    public async Task FillValidatesTheWholeBatchBeforeWriting()
    {
        var store = new RecordingBoardStore();
        var request = new PixelArtFillRequest(
        [
            new PixelArtPixel(0, 0, "#D3523C"),
            new PixelArtPixel(0, 1, "red")
        ]);

        var result = await PixelArtApi.FillAsync(
            request,
            store,
            CancellationToken.None);

        Assert.IsType<Microsoft.AspNetCore.Http.HttpResults.BadRequest<ApiError>>(result);
        Assert.Empty(store.Writes);
    }

    private sealed class RecordingBoardStore : IBoardStore
    {
        public List<(BoardPosition Position, string Color)> Writes { get; } = [];

        public ValueTask<string[][]> GetTileAsync(
            TileAddress address,
            CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public ValueTask SetPixelAsync(
            BoardPosition position,
            string color,
            CancellationToken cancellationToken = default)
        {
            Writes.Add((position, color));
            return ValueTask.CompletedTask;
        }

        public ValueTask CheckHealthAsync(
            CancellationToken cancellationToken = default) =>
            ValueTask.CompletedTask;
    }
}
