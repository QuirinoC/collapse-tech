using System.Collections.ObjectModel;
using System.Text.RegularExpressions;
using PixelBoard.Contracts.V1;

namespace PixelBoard.Application;

public static partial class PixelPalette
{
    public static IReadOnlyList<string> FreeColors { get; } =
        new ReadOnlyCollection<string>(
        [
            "#171714",
            "#F7F3EA",
            "#D3523C",
            "#DC9B32",
            "#E1C94A",
            "#587554",
            "#356B76",
            "#425B8C",
            "#7E5078"
        ]);

    public static IReadOnlyList<string> ProColors { get; } =
        new ReadOnlyCollection<string>(
        [
            ..FreeColors,
            "#5B4636",
            "#B94E48",
            "#F08A6A",
            "#F2C14E",
            "#9AA66F",
            "#2F8F83",
            "#6D7FB3",
            "#A45A9C",
            "#C7A6D8",
            "#D8B4A0",
            "#E5E5D8",
            "#9B9B93",
            "#FFFFFF",
            "#000000",
            "#F4A261"
        ]);

    private static readonly HashSet<string> FreeColorSet =
        new(FreeColors, StringComparer.OrdinalIgnoreCase);

    public static IReadOnlyList<string> ForTier(AccountTier tier) =>
        tier == AccountTier.Pro ? ProColors : FreeColors;

    public static bool Allows(AccountTier tier, string? color)
    {
        if (!IsHexColor(color))
        {
            return false;
        }

        return tier == AccountTier.Pro || FreeColorSet.Contains(color!);
    }

    public static bool IsHexColor(string? color) =>
        color is not null
        && HexColorPattern().IsMatch(color);

    [GeneratedRegex("^#[0-9A-Fa-f]{6}$")]
    private static partial Regex HexColorPattern();
}
