using CoachGG.Services;
using Xunit;

namespace CoachGG.Tests;

public class PlayerSlugTests
{
    [Theory]
    [InlineData("Bc954A2E", "bc954a2e")]
    [InlineData(" user/MkLeo ", "mkleo")]
    [InlineData("dash-player_01", "dash-player_01")]
    public void TryNormalize_ValidSlug_ReturnsCanonicalSlug(string input, string expected)
    {
        var valid = PlayerSlug.TryNormalize(input, out var slug);

        Assert.True(valid);
        Assert.Equal(expected, slug);
    }

    [Theory]
    [InlineData("")]
    [InlineData("user/")]
    [InlineData("contains/slash")]
    [InlineData("contains space")]
    public void TryNormalize_InvalidSlug_IsRejected(string input)
    {
        Assert.False(PlayerSlug.TryNormalize(input, out _));
    }
}
