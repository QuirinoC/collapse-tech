using PixelBoard.Application;

namespace PixelBoard.Tests;

public sealed class ReferralCodeTests
{
    [Fact]
    public void CreatedCodesAreEightAlphabetCharacters()
    {
        var code = ReferralCode.Create();
        Assert.Equal(8, code.Length);
        Assert.True(ReferralCode.TryNormalize(code, out var normalized));
        Assert.Equal(code, normalized);
    }

    [Theory]
    [InlineData("ab-cd 23-45", "ABCD2345")]
    [InlineData("ABCD2345", "ABCD2345")]
    public void CodesNormalizeCaseAndSeparators(string raw, string expected)
    {
        Assert.True(ReferralCode.TryNormalize(raw, out var code));
        Assert.Equal(expected, code);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("SHORT")]
    [InlineData("IIIIIIII")]
    [InlineData("ABCD23456")]
    public void InvalidCodesAreRejected(string? raw)
    {
        Assert.False(ReferralCode.TryNormalize(raw, out _));
    }
}
