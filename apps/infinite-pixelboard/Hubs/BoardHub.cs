using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Caching.Distributed;
using System.Linq.Expressions;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Threading.Tasks;

public class BoardHub : Hub, IDisposable
{
    private static readonly object _lock = new();
    private readonly IDistributedCache _cache;
    private const string BoardCacheKey = "MainBoard";

    private List<Task> tasks = new List<Task>();

    public BoardHub(IDistributedCache cache)
    {
        _cache = cache;
        tiles = new();
    }

    // juanito - A Board is a 2d set of 128x128 tiles
    private static Dictionary<string, Tile> tiles = new();

    private static string[][] InitializeBoard(int rows, int cols)
    {
        var board = new string[rows][];
        for (int i = 0; i < rows; i++)
        {
            board[i] = new string[cols];
            for (int j = 0; j < cols; j++)
            {
                board[i][j] = "#FFFFFF"; // Default color (white)
            }
        }
        return board;
    }

    private static string GetTilePartitionKey(int x, int y)
    {
        return $"{BoardCacheKey}_{x}_{y}";
    }

    private Tile? GetTileFromLocal(int x, int y)
    {
        var tileKey = GetTilePartitionKey(x, y);
        return tiles.GetValueOrDefault(tileKey);
    }

    private Tile? GetTileFromCache(int x, int y)
    {
        var tileKey = GetTilePartitionKey(x, y);

        var cachedTileString = _cache.GetString(tileKey);

        if (cachedTileString == null)
        {
            return null;
        }

        return new Tile(JsonSerializer.Deserialize<string[][]>(cachedTileString) ?? throw new InvalidOperationException("Failed to deserialize tile"))
        {
            X = x,
            Y = y
        };
    }

    private void SaveTileToCache(Tile tile)
    {
        var tileKey = GetTilePartitionKey(tile.X, tile.Y);
        var serializedTile = JsonSerializer.Serialize(tile.Pixels);
        _cache.SetStringAsync(tileKey, serializedTile);
    }

    public async Task SendPixel(int x, int y, string color)
    {
        var tile = GetTileOrDefault(x, y);

        Console.WriteLine($"[SendPixel] Tile: {tile.X}, {tile.Y}");

        // Relative coords
        var relative_x = Mod(x, PixelBoardConstants.TileRows);
        var relative_y = Mod(y, PixelBoardConstants.TileCols);

        relative_x = Math.Abs(relative_x);
        relative_y = Math.Abs(relative_y);

        lock (_lock)
        {
            tile.Pixels[relative_x][relative_y] = color;
        }

        tasks.Add(Task.Run(() => SaveTileToCache(tile)));
        tasks.Add(Clients.All.SendAsync("UpdateBoard", x, y, color));

        await Task.WhenAll(tasks);
    }

    public string[][] RequestTile(int x, int y)
    {
        return GetTileOrDefault(
            x * PixelBoardConstants.TileRows,
            y * PixelBoardConstants.TileCols)
        .Pixels; // juanito - why not have another fn that takes tile coords?
    }

    public override async Task OnConnectedAsync()
    {
        Console.WriteLine("Client connected");
        //await Clients.Caller.SendAsync("SyncBoard", GetTileOrDefault(0, 0));
        await base.OnConnectedAsync();
    }

    private Tile GetTileOrDefault(int x_coord, int y_coord)
    {
        TileSource tileSource = TileSource.Default;

        // Convert coords to tile coords
        var x = (int)Math.Floor((double)x_coord / PixelBoardConstants.TileRows);
        var y = (int)Math.Floor((double)y_coord / PixelBoardConstants.TileCols);

        // Handle negative coords
        //if (x_coord < 0) x--;
        //if (y_coord < 0) y--;

        Tile tile;

        // Try to get the tile from local cache
        if (GetTileFromLocal(x, y) is { } localTile)
        {
            tile = localTile;
            tileSource = TileSource.Local;
        }
        // Try to get the tile from distributed cache
        else if (GetTileFromCache(x, y) is { } cachedTile)
        {
            tile = cachedTile;
            tileSource = TileSource.Cache;
        }
        // Create a new tile if not found in either cache
        else
        {
            tileSource = TileSource.Default;
            tile = new Tile(InitializeBoard(PixelBoardConstants.TileRows, PixelBoardConstants.TileCols))
            {
                X = x,
                Y = y
            };
        }

        // Persist to local
        tiles[GetTilePartitionKey(x, y)] = tile;

        Console.WriteLine($"Tile {x}, {y} for coords {x_coord}, {y_coord} obtained from {tileSource}");

        return tile;
    }

    private int Mod(int n, int m)
    {
        return ((n % m) + m) % m;
    }

    private enum TileSource
    {
        Local,
        Cache,
        Default
    }

    private class Tile
    {
        public string[][] Pixels { get; set; }
        public Tile(string[][] pixels)
        {
            Pixels = pixels;
        }

        public int X { get; set; }
        public int Y { get; set; }
    }
}
