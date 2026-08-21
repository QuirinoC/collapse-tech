using System.Security.Claims;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using PixelBoard.Application;
using PixelBoard.Configuration;
using PixelBoard.Domain;
using PixelBoard.Infrastructure.Board;

namespace PixelBoard.Tests;

public sealed class BoardHubTests
{
    [Fact]
    public async Task RequestTile_AppliesVisibilityFilter()
    {
        var pixels = new[]
        {
            new[] { "#112233", "#445566" }
        };
        var boardStore = new StubBoardStore(pixels);
        var visibilityFilter = new StubVisibilityFilter();
        var services = new ServiceCollection()
            .AddSingleton<IBoardVisibilityFilter>(visibilityFilter)
            .BuildServiceProvider();
        var hub = new BoardHub(
            boardStore,
            Options.Create(new FirebaseOptions()),
            Options.Create(new PostgresOptions()),
            services)
        {
            Context = new StubHubCallerContext()
        };

        var result = await hub.RequestTile(-2, 3);

        Assert.Same(pixels, result);
        Assert.Equal(PixelBoardConstants.DefaultColor, result[0][0]);
        Assert.Equal(new TileAddress(-2, 3), boardStore.RequestedTile);
        Assert.Equal(new TileAddress(-2, 3), visibilityFilter.FilteredTile);
    }

    private sealed class StubBoardStore(string[][] pixels) : IBoardStore
    {
        public TileAddress? RequestedTile { get; private set; }

        public ValueTask<string[][]> GetTileAsync(
            TileAddress address,
            CancellationToken cancellationToken = default)
        {
            RequestedTile = address;
            return ValueTask.FromResult(pixels);
        }

        public ValueTask SetPixelAsync(
            BoardPosition position,
            string color,
            CancellationToken cancellationToken = default) =>
            ValueTask.CompletedTask;

        public ValueTask CheckHealthAsync(CancellationToken cancellationToken = default) =>
            ValueTask.CompletedTask;
    }

    private sealed class StubVisibilityFilter : IBoardVisibilityFilter
    {
        public TileAddress? FilteredTile { get; private set; }

        public ValueTask<bool> IsVisibleAsync(
            BoardPosition position,
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult(true);

        public ValueTask ApplyAsync(
            TileAddress tile,
            string[][] pixels,
            CancellationToken cancellationToken = default)
        {
            FilteredTile = tile;
            pixels[0][0] = PixelBoardConstants.DefaultColor;
            return ValueTask.CompletedTask;
        }
    }

    private sealed class StubHubCallerContext : HubCallerContext
    {
        public override string ConnectionId => "test";

        public override string? UserIdentifier => null;

        public override ClaimsPrincipal? User => null;

        public override IDictionary<object, object?> Items { get; } =
            new Dictionary<object, object?>();

        public override IFeatureCollection Features { get; } = new FeatureCollection();

        public override CancellationToken ConnectionAborted => CancellationToken.None;

        public override void Abort()
        {
        }
    }
}
