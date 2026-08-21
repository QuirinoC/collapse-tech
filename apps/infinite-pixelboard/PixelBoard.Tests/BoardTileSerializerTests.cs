using PixelBoard.Domain;

namespace PixelBoard.Tests;

public sealed class BoardTileSerializerTests
{
    [Fact]
    public void SerializePreservesRowMajorLegacyJson()
    {
        string[][] pixels =
        [
            ["#010101", "#020202", "#030303"],
            ["#A0A0A0", "#B0B0B0", "#C0C0C0"]
        ];

        var serialized = BoardTileSerializer.Serialize(pixels);

        Assert.Equal(
            """[["#010101","#020202","#030303"],["#A0A0A0","#B0B0B0","#C0C0C0"]]""",
            serialized);
        Assert.Equal(pixels, BoardTileSerializer.Deserialize(serialized));
    }

    [Fact]
    public void DefaultTileMatchesLiveDimensionsAndColor()
    {
        var pixels = BoardTileSerializer.CreateDefault();

        Assert.Equal(128, pixels.Length);
        Assert.All(pixels, row =>
        {
            Assert.Equal(128, row.Length);
            Assert.All(row, color => Assert.Equal("#FFFFFF", color));
        });
    }

    [Fact]
    public void DistinctRowAndColumnValuesAreNotTransposed()
    {
        var pixels = BoardTileSerializer.CreateDefault();
        pixels[1][2] = "#112233";
        pixels[2][1] = "#AABBCC";

        var restored = BoardTileSerializer.Deserialize(
            BoardTileSerializer.Serialize(pixels));

        Assert.Equal("#112233", restored[1][2]);
        Assert.Equal("#AABBCC", restored[2][1]);
    }
}
