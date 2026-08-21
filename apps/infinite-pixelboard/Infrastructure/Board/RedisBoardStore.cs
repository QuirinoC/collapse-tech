using Microsoft.Extensions.Caching.Distributed;
using PixelBoard.Domain;

namespace PixelBoard.Infrastructure.Board;

public sealed class RedisBoardStore(IDistributedCache cache) : IBoardStore, IDisposable
{
    private readonly SemaphoreSlim _legacyWriteLock = new(1, 1);

    public async ValueTask<string[][]> GetTileAsync(
        TileAddress address,
        CancellationToken cancellationToken = default)
    {
        return await GetOrCreateTileCoreAsync(address, cancellationToken);
    }

    public async ValueTask SetPixelAsync(
        BoardPosition position,
        string color,
        CancellationToken cancellationToken = default)
    {
        var location = BoardGeometry.Locate(position);
        await _legacyWriteLock.WaitAsync(cancellationToken);

        try
        {
            var pixels = await GetOrCreateTileCoreAsync(location.Tile, cancellationToken);
            pixels[location.Offset.Row][location.Offset.Column] = color;

            await cache.SetStringAsync(
                BoardGeometry.GetTilePartitionKey(location.Tile),
                BoardTileSerializer.Serialize(pixels),
                cancellationToken);
        }
        finally
        {
            _legacyWriteLock.Release();
        }
    }

    public async ValueTask CheckHealthAsync(CancellationToken cancellationToken = default)
    {
        await cache.GetStringAsync(
            BoardGeometry.GetTilePartitionKey(new TileAddress(0, 0)),
            cancellationToken);
    }

    public void Dispose()
    {
        _legacyWriteLock.Dispose();
    }

    private async ValueTask<string[][]> GetOrCreateTileCoreAsync(
        TileAddress address,
        CancellationToken cancellationToken)
    {
        var serializedTile = await cache.GetStringAsync(
            BoardGeometry.GetTilePartitionKey(address),
            cancellationToken);
        var pixels = serializedTile is null
            ? BoardTileSerializer.CreateDefault()
            : BoardTileSerializer.Deserialize(serializedTile);

        return pixels;
    }
}
