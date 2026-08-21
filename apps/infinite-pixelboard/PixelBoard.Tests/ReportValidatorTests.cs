using PixelBoard.Application;
using PixelBoard.Contracts.V1;

namespace PixelBoard.Tests;

public sealed class ReportValidatorTests
{
    private readonly ReportValidator _validator = new();
    private readonly AccountId _accountId = new("reporter");

    [Fact]
    public void ValidSinglePixelReportIsNormalized()
    {
        var result = Validate(new CreateReportRequest(
            new ReportRegion(-1, 128, 1, 1),
            ReportReason.Threat,
            "  context  ",
            new ClientContext("web", "1.0")));

        Assert.True(result.IsValid);
        Assert.Equal("context", result.Command?.Note);
        Assert.Equal(-1, result.Command?.Region.Top);
        Assert.Equal(128, result.Command?.Region.Left);
    }

    [Theory]
    [InlineData(0, 1)]
    [InlineData(65, 1)]
    [InlineData(64, 65)]
    public void RejectsUnboundedRegions(int width, int height)
    {
        var result = Validate(ValidRequest() with
        {
            Region = new ReportRegion(0, 0, width, height)
        });

        Assert.False(result.IsValid);
        Assert.Equal(ApiErrorCodes.InvalidReportRegion, result.Error?.Code);
    }

    [Fact]
    public void RejectsUnknownReason()
    {
        var result = Validate(ValidRequest() with { Reason = (ReportReason)999 });

        Assert.False(result.IsValid);
        Assert.Equal(ApiErrorCodes.InvalidReportReason, result.Error?.Code);
    }

    [Fact]
    public void RejectsMissingBodyAndReason()
    {
        Assert.Equal(
            ApiErrorCodes.InvalidReportRegion,
            Validate(null).Error?.Code);
        Assert.Equal(
            ApiErrorCodes.InvalidReportReason,
            Validate(ValidRequest() with { Reason = null }).Error?.Code);
    }

    [Fact]
    public void OtherReasonRequiresNote()
    {
        var result = Validate(ValidRequest() with
        {
            Reason = ReportReason.Other,
            Note = " "
        });

        Assert.False(result.IsValid);
        Assert.Equal(ApiErrorCodes.InvalidReportNote, result.Error?.Code);
    }

    [Fact]
    public void RejectsControlCharactersAndOversizedNotes()
    {
        Assert.Equal(
            ApiErrorCodes.InvalidReportNote,
            Validate(ValidRequest() with { Note = "unsafe\u0000note" }).Error?.Code);
        Assert.Equal(
            ApiErrorCodes.InvalidReportNote,
            Validate(ValidRequest() with { Note = new string('a', 501) }).Error?.Code);
    }

    private ReportValidation Validate(CreateReportRequest? request) =>
        _validator.Validate(
            request,
            _accountId,
            ReportId.New(),
            DateTimeOffset.UnixEpoch);

    private static CreateReportRequest ValidRequest() =>
        new(
            new ReportRegion(10, 20, 8, 8),
            ReportReason.HateOrHarassment,
            null,
            new ClientContext("ios", "1.0"));
}
