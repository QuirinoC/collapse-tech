using PixelBoard.Contracts.V1;

namespace PixelBoard.Application;

public sealed class PlacementValidator : IPlacementValidator
{
    public const int MaxIdempotencyKeyLength = 128;
    public const int MaxClientPlatformLength = 32;
    public const int MaxClientVersionLength = 32;

    public PlacementValidation Validate(PlacementCommand command)
    {
        if (!IsHexColor(command.Color))
        {
            return Invalid(
                ApiErrorCodes.InvalidColor,
                "Color must use the #RRGGBB format.");
        }

        if (string.IsNullOrWhiteSpace(command.IdempotencyKey)
            || command.IdempotencyKey.Length > MaxIdempotencyKeyLength)
        {
            return Invalid(
                ApiErrorCodes.InvalidIdempotencyKey,
                $"Idempotency key must contain 1 to {MaxIdempotencyKeyLength} characters.");
        }

        if (command.Client is null
            || string.IsNullOrWhiteSpace(command.Client.Platform)
            || command.Client.Platform.Length > MaxClientPlatformLength
            || string.IsNullOrWhiteSpace(command.Client.AppVersion)
            || command.Client.AppVersion.Length > MaxClientVersionLength)
        {
            return Invalid(
                ApiErrorCodes.InvalidClientContext,
                "Client platform and version are required.");
        }

        return new PlacementValidation(true, null);
    }

    private static bool IsHexColor(string? color)
    {
        if (color is null || color.Length != 7 || color[0] != '#')
        {
            return false;
        }

        for (var index = 1; index < color.Length; index++)
        {
            if (!Uri.IsHexDigit(color[index]))
            {
                return false;
            }
        }

        return true;
    }

    private static PlacementValidation Invalid(string code, string message)
    {
        return new PlacementValidation(false, new ApiError(code, message));
    }
}
