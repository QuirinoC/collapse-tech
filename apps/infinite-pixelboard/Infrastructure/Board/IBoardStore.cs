using PixelBoard.Domain;

namespace PixelBoard.Infrastructure.Board;

public interface IBoardStore
{
    ValueTask<string[][]> GetTileAsync(
        TileAddress address,
        CancellationToken cancellationToken = default);

    ValueTask SetPixelAsync(
        BoardPosition position,
        string color,
        CancellationToken cancellationToken = default);

    ValueTask CheckHealthAsync(CancellationToken cancellationToken = default);
}
