using PixelBoard.Application;
using PixelBoard.Contracts.V1;
using PixelBoard.Domain;

namespace PixelBoard.Tests;

public sealed class PlacementValidatorTests
{
    private readonly PlacementValidator _validator = new();

    [Theory]
    [InlineData("#000000")]
    [InlineData("#abcdef")]
    [InlineData("#ABCDEF")]
    public void ValidHexColorsAreAccepted(string color)
    {
        var result = _validator.Validate(CreateCommand(color: color));

        Assert.True(result.IsValid);
        Assert.Null(result.Error);
    }

    [Theory]
    [InlineData("")]
    [InlineData("000000")]
    [InlineData("#FFF")]
    [InlineData("#GGGGGG")]
    [InlineData("#1234567")]
    public void InvalidColorsAreRejected(string color)
    {
        var result = _validator.Validate(CreateCommand(color: color));

        Assert.False(result.IsValid);
        Assert.Equal(ApiErrorCodes.InvalidColor, result.Error?.Code);
    }

    [Fact]
    public void EmptyIdempotencyKeyIsRejected()
    {
        var result = _validator.Validate(CreateCommand(idempotencyKey: " "));

        Assert.False(result.IsValid);
        Assert.Equal(ApiErrorCodes.InvalidIdempotencyKey, result.Error?.Code);
    }

    [Theory]
    [InlineData("", "1.0")]
    [InlineData("web", "")]
    public void MissingClientContextIsRejected(string platform, string version)
    {
        var result = _validator.Validate(CreateCommand(platform: platform, version: version));

        Assert.False(result.IsValid);
        Assert.Equal(ApiErrorCodes.InvalidClientContext, result.Error?.Code);
    }

    private static PlacementCommand CreateCommand(
        string color = "#123456",
        string idempotencyKey = "request-1",
        string platform = "web",
        string version = "1.0")
    {
        return new PlacementCommand(
            new AccountId("firebase-user"),
            new BoardPosition(-1, 128),
            color,
            idempotencyKey,
            new ClientContext(platform, version));
    }
}
