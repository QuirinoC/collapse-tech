using PixelBoard.Application;
using PixelBoard.Contracts.V1;

namespace PixelBoard.Tests;

public sealed class PixelPaletteTests
{
    [Fact]
    public void FreePaletteIsCuratedAndProPaletteExtendsIt()
    {
        Assert.Equal(9, PixelPalette.FreeColors.Count);
        Assert.Equal(24, PixelPalette.ProColors.Count);
        Assert.True(PixelPalette.ProColors.Count > PixelPalette.FreeColors.Count);
        Assert.All(PixelPalette.FreeColors, color => Assert.Contains(
            color,
            PixelPalette.ProColors,
            StringComparer.OrdinalIgnoreCase));
    }

    [Theory]
    [InlineData(AccountTier.Free, "#D3523C", true)]
    [InlineData(AccountTier.Free, "#abcdef", false)]
    [InlineData(AccountTier.Pro, "#abcdef", true)]
    [InlineData(AccountTier.Pro, "#nothex", false)]
    public void AllowsColorsByTier(AccountTier tier, string color, bool expected)
    {
        Assert.Equal(expected, PixelPalette.Allows(tier, color));
    }
}
