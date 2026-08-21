using System.Collections.Concurrent;
using Microsoft.Extensions.Caching.Distributed;
using PixelBoard.Domain;
using PixelBoard.Infrastructure.Board;

namespace PixelBoard.Tests;

public sealed class RedisBoardStoreTests
{
    [Fact]
    public async Task GetTileReadsTheFrozenRedisKeyAndMatrixOrder()
    {
        var cache = new RecordingDistributedCache();
        var pixels = BoardTileSerializer.CreateDefault();
        pixels[4][9] = "#123456";
        cache.Seed("MainBoard_-2_3", BoardTileSerializer.Serialize(pixels));
        using var store = new RedisBoardStore(cache);

        var result = await store.GetTileAsync(new TileAddress(-2, 3));

        Assert.Equal("#123456", result[4][9]);
        Assert.Equal(["MainBoard_-2_3"], cache.ReadKeys);
    }

    [Fact]
    public async Task SetPixelWritesTheExpectedNegativeTileAndOffset()
    {
        var cache = new RecordingDistributedCache();
        using var store = new RedisBoardStore(cache);

        await store.SetPixelAsync(new BoardPosition(-1, 128), "#ABCDEF");

        var serialized = Assert.Single(cache.Values).Value;
        var pixels = BoardTileSerializer.Deserialize(serialized);
        Assert.Equal("MainBoard_-1_1", Assert.Single(cache.Values).Key);
        Assert.Equal("#ABCDEF", pixels[127][0]);
    }

    private sealed class RecordingDistributedCache : IDistributedCache
    {
        private readonly ConcurrentDictionary<string, byte[]> _values = new();

        public IReadOnlyCollection<string> ReadKeys { get; private set; } = [];

        public IReadOnlyDictionary<string, string> Values =>
            _values.ToDictionary(
                pair => pair.Key,
                pair => System.Text.Encoding.UTF8.GetString(pair.Value));

        public void Seed(string key, string value)
        {
            _values[key] = System.Text.Encoding.UTF8.GetBytes(value);
        }

        public byte[]? Get(string key)
        {
            ReadKeys = [.. ReadKeys, key];
            return _values.GetValueOrDefault(key);
        }

        public Task<byte[]?> GetAsync(
            string key,
            CancellationToken token = default)
        {
            return Task.FromResult(Get(key));
        }

        public void Refresh(string key)
        {
        }

        public Task RefreshAsync(
            string key,
            CancellationToken token = default)
        {
            return Task.CompletedTask;
        }

        public void Remove(string key)
        {
            _values.TryRemove(key, out _);
        }

        public Task RemoveAsync(
            string key,
            CancellationToken token = default)
        {
            Remove(key);
            return Task.CompletedTask;
        }

        public void Set(
            string key,
            byte[] value,
            DistributedCacheEntryOptions options)
        {
            _values[key] = value;
        }

        public Task SetAsync(
            string key,
            byte[] value,
            DistributedCacheEntryOptions options,
            CancellationToken token = default)
        {
            Set(key, value, options);
            return Task.CompletedTask;
        }
    }
}
