using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using PixelBoard.Application;
using PixelBoard.Configuration;
using PixelBoard.Domain;
using PixelBoard.Infrastructure.Board;

public class BoardHub(
    IBoardStore boardStore,
    IOptions<FirebaseOptions> firebaseOptions,
    IOptions<PostgresOptions> postgresOptions,
    IServiceProvider services) : Hub
{
    public async Task SendPixel(int x, int y, string color)
    {
        if (firebaseOptions.Value.Enabled || postgresOptions.Value.Enabled)
        {
            throw new HubException(
                "Legacy placement is disabled. Use the authenticated v1 placement API.");
        }

        await boardStore.SetPixelAsync(
            new BoardPosition(x, y),
            color,
            Context.ConnectionAborted);
        await Clients.All.SendAsync(
            "UpdateBoard",
            x,
            y,
            color,
            CancellationToken.None);
    }

    public async Task<string[][]> RequestTile(int x, int y)
    {
        var tile = new TileAddress(x, y);
        var pixels = await boardStore.GetTileAsync(tile, Context.ConnectionAborted);
        var visibilityFilter = services.GetService<IBoardVisibilityFilter>();
        if (visibilityFilter is not null)
        {
            await visibilityFilter.ApplyAsync(tile, pixels, Context.ConnectionAborted);
        }

        return pixels;
    }

    public override async Task OnConnectedAsync()
    {
        Console.WriteLine("Client connected");
        //await Clients.Caller.SendAsync("SyncBoard", GetTileOrDefault(0, 0));
        await base.OnConnectedAsync();
    }

}
