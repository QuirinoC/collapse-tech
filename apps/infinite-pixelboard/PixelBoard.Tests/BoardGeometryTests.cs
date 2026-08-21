using PixelBoard.Domain;

namespace PixelBoard.Tests;

public sealed class BoardGeometryTests
{
    [Theory]
    [InlineData(0, 0, 0, 0, 0, 0)]
    [InlineData(127, 127, 0, 0, 127, 127)]
    [InlineData(128, 129, 1, 1, 0, 1)]
    [InlineData(-1, -1, -1, -1, 127, 127)]
    [InlineData(-128, -128, -1, -1, 0, 0)]
    [InlineData(-129, -129, -2, -2, 127, 127)]
    public void LocatePreservesLegacyTileAndOffsetMapping(
        int row,
        int column,
        int tileRow,
        int tileColumn,
        int offsetRow,
        int offsetColumn)
    {
        var result = BoardGeometry.Locate(new BoardPosition(row, column));

        Assert.Equal(new TileAddress(tileRow, tileColumn), result.Tile);
        Assert.Equal(new TileOffset(offsetRow, offsetColumn), result.Offset);
    }

    [Fact]
    public void PartitionKeyPreservesProductionRedisFormat()
    {
        var key = BoardGeometry.GetTilePartitionKey(new TileAddress(-2, 7));

        Assert.Equal("MainBoard_-2_7", key);
    }

    [Fact]
    public void TileOriginRoundTripsThroughLocation()
    {
        var address = new TileAddress(-3, 4);

        var origin = BoardGeometry.GetTileOrigin(address);
        var location = BoardGeometry.Locate(origin);

        Assert.Equal(address, location.Tile);
        Assert.Equal(new TileOffset(0, 0), location.Offset);
    }
}
