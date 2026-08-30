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
            "#D3523C",
            "#DC9B32",
            "#E1C94A",
            "#587554",
            "#356B76",
            "#425B8C",
            "#7E5078",
            "#F7F3EA"
        ]);

    public static IReadOnlyList<string> ProColors { get; } =
        new ReadOnlyCollection<string>(
        [
            "#171714",
            "#000000",
            "#5B4636",
            "#B94E48",
            "#D3523C",
            "#F08A6A",
            "#DC9B32",
            "#F4A261",
            "#E1C94A",
            "#F2C14E",
            "#587554",
            "#9AA66F",
            "#356B76",
            "#2F8F83",
            "#425B8C",
            "#6D7FB3",
            "#7E5078",
            "#A45A9C",
            "#C7A6D8",
            "#D8B4A0",
            "#9B9B93",
            "#E5E5D8",
            "#F7F3EA",
            "#FFFFFF"
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
