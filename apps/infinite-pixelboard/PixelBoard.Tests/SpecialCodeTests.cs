using PixelBoard.Application;

namespace PixelBoard.Tests;

public sealed class SpecialCodeTests
{
    [Theory]
    [InlineData("party", "PARTY")]
    [InlineData("ab-cd", "ABCD")]
    [InlineData("  party24  ", "PARTY24")]
    public void TryNormalizeAcceptsValidCodes(string raw, string expected)
    {
        Assert.True(SpecialCode.TryNormalize(raw, out var code));
        Assert.Equal(expected, code);
    }

    [Theory]
    [InlineData("")]
    [InlineData("AB")]
    [InlineData("TOOOLONGCODEVALUE1")]
    [InlineData("BAD0CODE")]
    public void TryNormalizeRejectsInvalidCodes(string raw)
    {
        Assert.False(SpecialCode.TryNormalize(raw, out _));
    }

    [Fact]
    public void CreateUsesAlphabetAndLength()
    {
        var code = SpecialCode.Create(10);
        Assert.Equal(10, code.Length);
        Assert.All(code, character => Assert.Contains(character, SpecialCode.Alphabet));
    }
}
