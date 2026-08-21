using System.Text.Json;

namespace PixelBoard.Domain;

public static class BoardTileSerializer
{
    public static string[][] CreateDefault()
    {
        var pixels = new string[PixelBoardConstants.TileRows][];

        for (var row = 0; row < pixels.Length; row++)
        {
            pixels[row] = new string[PixelBoardConstants.TileCols];
            Array.Fill(pixels[row], PixelBoardConstants.DefaultColor);
        }

        return pixels;
    }

    public static string Serialize(string[][] pixels)
    {
        return JsonSerializer.Serialize(pixels);
    }

    public static string[][] Deserialize(string serializedPixels)
    {
        return JsonSerializer.Deserialize<string[][]>(serializedPixels)
            ?? throw new InvalidOperationException("Failed to deserialize tile.");
    }
}
