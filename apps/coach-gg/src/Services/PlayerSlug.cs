using System.Text.RegularExpressions;

namespace CoachGG.Services;

public static class PlayerSlug
{
    private static readonly Regex ValidSlug = new(
        "^[a-z0-9][a-z0-9_-]{0,99}$",
        RegexOptions.CultureInvariant | RegexOptions.IgnoreCase,
        TimeSpan.FromMilliseconds(100));

    public static bool TryNormalize(string? value, out string slug)
    {
        slug = value?.Trim() ?? "";
        if (slug.StartsWith("user/", StringComparison.OrdinalIgnoreCase))
            slug = slug["user/".Length..];

        slug = slug.ToLowerInvariant();
        return ValidSlug.IsMatch(slug);
    }
}
