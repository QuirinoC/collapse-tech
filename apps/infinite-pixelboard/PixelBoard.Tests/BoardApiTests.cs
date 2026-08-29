using PixelBoard.Api.V1;
using PixelBoard.Application;
using PixelBoard.Contracts.V1;
using PixelBoard.Domain;
using PixelBoard.Infrastructure.Board;
using Microsoft.Extensions.DependencyInjection;

namespace PixelBoard.Tests;

public sealed class BoardApiTests
{
    [Fact]
    public async Task MetadataDescribesOpenBoardWhenSafetyIsUnset()
    {
        using var services = new ServiceCollection().BuildServiceProvider();

        var response = await BoardApi.GetMetadataAsync(services, CancellationToken.None);

        Assert.Equal(ApiVersions.V1, response.ApiVersion);
        Assert.Equal(PixelBoardConstants.TileRows, response.TileRows);
        Assert.Equal(PixelBoardConstants.TileCols, response.TileColumns);
        Assert.Equal(PixelBoardConstants.DefaultColor, response.DefaultColor);
        Assert.Equal("row-column", response.CoordinateConvention);
        Assert.Equal(BoardAccessMode.Open, response.AccessMode);
        Assert.Null(response.StatusMessage);
        Assert.Null(response.MinimumIosVersion);
    }

    [Fact]
    public async Task MetadataIsReadOnlyWhenPlacementsAreFrozen()
    {
        using var services = new ServiceCollection()
            .AddSingleton<IPlatformSafetyService>(new FrozenSafetyService())
            .BuildServiceProvider();

        var response = await BoardApi.GetMetadataAsync(services, CancellationToken.None);

        Assert.Equal(BoardAccessMode.ReadOnly, response.AccessMode);
        Assert.Equal("Painting is paused.", response.StatusMessage);
    }

    [Fact]
    public async Task TileSnapshotPreservesAddressPixelsAndCaptureTime()
    {
        var capturedAt = DateTimeOffset.FromUnixTimeSeconds(1_700_000_000);
        var pixels = BoardTileSerializer.CreateDefault();
        pixels[127][0] = "#123456";
        var boardStore = new RecordingBoardStore(pixels);
        using var services = new ServiceCollection().BuildServiceProvider();

        var response = await BoardApi.GetTileAsync(
            -1,
            4,
            boardStore,
            new FixedTimeProvider(capturedAt),
            services,
            CancellationToken.None);

        Assert.Equal(ApiVersions.V1, response.ApiVersion);
        Assert.Equal(-1, response.TileRow);
        Assert.Equal(4, response.TileColumn);
        Assert.Same(pixels, response.Pixels);
        Assert.Equal(capturedAt, response.CapturedAt);
        Assert.Equal(new TileAddress(-1, 4), boardStore.RequestedTile);
    }

    [Fact]
    public async Task DeleteAccountDeletesAuthenticatedServerData()
    {
        var accountId = new AccountId("firebase-delete-user");
        var deletion = new RecordingAccountDeletionService();
        using var services = new ServiceCollection()
            .AddSingleton<IAccountDeletionService>(deletion)
            .BuildServiceProvider();

        var result = await BoardApi.DeleteAccountAsync(
            new FixedIdentityAccessor(new AuthenticatedAccount(accountId, false, true)),
            services,
            CancellationToken.None);

        Assert.Equal(accountId, deletion.DeletedAccount);
        Assert.IsType<Microsoft.AspNetCore.Http.HttpResults.NoContent>(result);
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

    private sealed class FixedIdentityAccessor(AuthenticatedAccount account)
        : IAccountIdentityAccessor
    {
        public ValueTask<AuthenticatedAccount?> GetCurrentAsync(
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult<AuthenticatedAccount?>(account);
    }

    private sealed class RecordingAccountDeletionService : IAccountDeletionService
    {
        public AccountId? DeletedAccount { get; private set; }

        public ValueTask<bool> IsDeletedAsync(
            AccountId accountId,
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult(DeletedAccount == accountId);

        public ValueTask DeleteAsync(
            AccountId accountId,
            CancellationToken cancellationToken = default)
        {
            DeletedAccount = accountId;
            return ValueTask.CompletedTask;
        }
    }

    private sealed class FrozenSafetyService : IPlatformSafetyService
    {
        public ValueTask<PlatformSafetyState> GetStateAsync(
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult(new PlatformSafetyState(true, false));
    }
}
