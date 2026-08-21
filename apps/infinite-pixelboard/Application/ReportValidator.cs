using PixelBoard.Contracts.V1;

namespace PixelBoard.Application;

public sealed class ReportValidator : IReportValidator
{
    public const int MaxRegionDimension = 64;
    public const int MaxRegionArea = 4_096;
    public const int MaxAbsoluteCoordinate = 1_000_000_000;
    public const int MaxNoteLength = 500;

    public ReportValidation Validate(
        CreateReportRequest? request,
        AccountId reporterAccountId,
        ReportId reportId,
        DateTimeOffset submittedAt)
    {
        if (request?.Region is not { } region
            || region.Width is < 1 or > MaxRegionDimension
            || region.Height is < 1 or > MaxRegionDimension
            || (long)region.Width * region.Height > MaxRegionArea
            || region.Top < -MaxAbsoluteCoordinate
            || region.Left < -MaxAbsoluteCoordinate
            || region.Top > MaxAbsoluteCoordinate
            || region.Left > MaxAbsoluteCoordinate
            || (long)region.Top + region.Height - 1 > MaxAbsoluteCoordinate
            || (long)region.Left + region.Width - 1 > MaxAbsoluteCoordinate)
        {
            return Invalid(
                ApiErrorCodes.InvalidReportRegion,
                $"Region dimensions must be 1 to {MaxRegionDimension}, contain at most " +
                $"{MaxRegionArea} pixels, and remain within supported coordinates.");
        }

        if (request.Reason is not { } reason || !Enum.IsDefined(reason))
        {
            return Invalid(
                ApiErrorCodes.InvalidReportReason,
                "Report reason is not supported.");
        }

        var note = request.Note?.Trim();
        if (note?.Length > MaxNoteLength
            || note is not null && note.Any(char.IsControl))
        {
            return Invalid(
                ApiErrorCodes.InvalidReportNote,
                $"Report note must contain at most {MaxNoteLength} non-control characters.");
        }

        if (reason == ReportReason.Other && string.IsNullOrWhiteSpace(note))
        {
            return Invalid(
                ApiErrorCodes.InvalidReportNote,
                "A note is required when the report reason is Other.");
        }

        if (request.Client is not { } client
            || string.IsNullOrWhiteSpace(client.Platform)
            || client.Platform.Length > PlacementValidator.MaxClientPlatformLength
            || string.IsNullOrWhiteSpace(client.AppVersion)
            || client.AppVersion.Length > PlacementValidator.MaxClientVersionLength)
        {
            return Invalid(
                ApiErrorCodes.InvalidClientContext,
                "Client platform and version are required.");
        }

        return new ReportValidation(
            true,
            new ReportCommand(
                reportId,
                reporterAccountId,
                region,
                reason,
                string.IsNullOrWhiteSpace(note) ? null : note,
                client,
                submittedAt),
            null);
    }

    private static ReportValidation Invalid(string code, string message) =>
        new(false, null, new ApiError(code, message));
}
