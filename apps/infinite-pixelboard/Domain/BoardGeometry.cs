namespace PixelBoard.Domain;

public readonly record struct BoardPosition(int Row, int Column);

public readonly record struct TileAddress(int Row, int Column);

public readonly record struct TileOffset(int Row, int Column);

public readonly record struct LocatedPixel(
    BoardPosition Position,
    TileAddress Tile,
    TileOffset Offset);

public static class BoardGeometry
{
    public static LocatedPixel Locate(BoardPosition position)
    {
        var tile = new TileAddress(
            FloorDivide(position.Row, PixelBoardConstants.TileRows),
            FloorDivide(position.Column, PixelBoardConstants.TileCols));
        var offset = new TileOffset(
            PositiveModulo(position.Row, PixelBoardConstants.TileRows),
            PositiveModulo(position.Column, PixelBoardConstants.TileCols));

        return new LocatedPixel(position, tile, offset);
    }

    public static BoardPosition GetTileOrigin(TileAddress tile)
    {
        return new BoardPosition(
            checked(tile.Row * PixelBoardConstants.TileRows),
            checked(tile.Column * PixelBoardConstants.TileCols));
    }

    public static string GetTilePartitionKey(TileAddress tile)
    {
        return $"{PixelBoardConstants.BoardCacheKey}_{tile.Row}_{tile.Column}";
    }

    private static int FloorDivide(int value, int divisor)
    {
        var quotient = Math.DivRem(value, divisor, out var remainder);
        return remainder < 0 ? quotient - 1 : quotient;
    }

    private static int PositiveModulo(int value, int modulus)
    {
        var remainder = value % modulus;
        return remainder < 0 ? remainder + modulus : remainder;
    }
}
