using PixelBoard.Contracts.V1;

namespace PixelBoard.Application;

public sealed class PlacementValidator : IPlacementValidator
{
    public const int MaxIdempotencyKeyLength = 128;
    public const int MaxClientPlatformLength = 32;
    public const int MaxClientVersionLength = 32;

    public PlacementValidation Validate(
        PlacementCommand command,
        AccountTier tier = AccountTier.Free)
    {
        if (!PixelPalette.IsHexColor(command.Color))
        {
            return Invalid(
                ApiErrorCodes.InvalidColor,
                "Color must use the #RRGGBB format.");
        }

        if (!PixelPalette.Allows(tier, command.Color))
        {
            return Invalid(
                ApiErrorCodes.InvalidColor,
                "Free accounts can only use the curated palette. Upgrade to Pro or choose an available color.");
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

    private static PlacementValidation Invalid(string code, string message)
    {
        return new PlacementValidation(false, new ApiError(code, message));
    }
}
