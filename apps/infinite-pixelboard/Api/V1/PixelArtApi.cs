using PixelBoard.Domain;
using PixelBoard.Contracts.V1;
using PixelBoard.Infrastructure.Board;

namespace PixelBoard.Api.V1;

public sealed record PixelArtPixel(int Row, int Column, string? Color);

public sealed record PixelArtFillRequest(IReadOnlyList<PixelArtPixel>? Pixels);

public sealed record PixelArtFillResponse(int PixelsWritten);

public static class PixelArtApi
{
    private const int MaximumPixelsPerRequest = 100_000;

    public static async Task<IResult> FillAsync(
        PixelArtFillRequest? request,
        IBoardStore boardStore,
        CancellationToken cancellationToken)
    {
        return await FillCoreAsync(request, boardStore, null, cancellationToken);
    }

    public static async Task<IResult> FillModeratedAsync(
        PixelArtFillRequest? request,
        IBoardStore boardStore,
        CancellationToken cancellationToken)
    {
        return await FillCoreAsync(
            request,
            boardStore,
            MaximumPixelsPerRequest,
            cancellationToken);
    }

    private static async Task<IResult> FillCoreAsync(
        PixelArtFillRequest? request,
        IBoardStore boardStore,
        int? maximumPixels,
        CancellationToken cancellationToken)
    {
        if (request?.Pixels is not { Count: > 0 })
        {
            return Invalid("At least one pixel is required.");
        }

        if (maximumPixels is not null && request.Pixels.Count > maximumPixels.Value)
        {
            return Invalid($"A request can contain at most {maximumPixels} pixels.");
        }

        for (var index = 0; index < request.Pixels.Count; index++)
        {
            var pixel = request.Pixels[index];
            if (pixel is null || !IsHexColor(pixel.Color))
            {
                return Invalid($"Pixel {index} must have a six-digit hex color.");
            }
        }

        foreach (var pixel in request.Pixels)
        {
            await boardStore.SetPixelAsync(
                new BoardPosition(pixel.Row, pixel.Column),
                pixel.Color!.ToUpperInvariant(),
                cancellationToken);
        }

        return Results.Ok(new PixelArtFillResponse(request.Pixels.Count));
    }

    private static IResult Invalid(string message) =>
        Results.BadRequest(new ApiError("invalid_pixel_art", message));

    private static bool IsHexColor(string? color)
    {
        if (color is null || color.Length != 7 || color[0] != '#')
        {
            return false;
        }

        return color.Skip(1).All(IsHexDigit);
    }

    private static bool IsHexDigit(char value) =>
        value is >= '0' and <= '9'
            or >= 'a' and <= 'f'
            or >= 'A' and <= 'F';
}
