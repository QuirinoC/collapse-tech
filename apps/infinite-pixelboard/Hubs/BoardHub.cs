using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Options;
using PixelBoard.Configuration;
using PixelBoard.Domain;
using PixelBoard.Infrastructure.Board;

public class BoardHub(
    IBoardStore boardStore,
    IOptions<FirebaseOptions> firebaseOptions,
    IOptions<PostgresOptions> postgresOptions) : Hub
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
        return await boardStore.GetTileAsync(
            new TileAddress(x, y),
            Context.ConnectionAborted);
    }

    public override async Task OnConnectedAsync()
    {
        Console.WriteLine("Client connected");
        //await Clients.Caller.SendAsync("SyncBoard", GetTileOrDefault(0, 0));
        await base.OnConnectedAsync();
    }

}
