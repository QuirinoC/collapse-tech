using System.Security.Cryptography;

namespace PixelBoard.Application;

public static class SpecialCode
{
    public const int MinLength = 4;
    public const int MaxLength = 16;
    public const string Alphabet = ReferralCode.Alphabet;

    public static string Create(int length = 8)
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(length, MinLength);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(length, MaxLength);
        Span<char> buffer = stackalloc char[length];
        for (var index = 0; index < buffer.Length; index++)
        {
            buffer[index] = Alphabet[RandomNumberGenerator.GetInt32(Alphabet.Length)];
        }

        return new string(buffer);
    }

    public static bool TryNormalize(string? value, out string code)
    {
        code = string.Empty;
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        Span<char> buffer = stackalloc char[MaxLength];
        var written = 0;
        foreach (var character in value)
        {
            if (character is '-' or ' ' or '\t')
            {
                continue;
            }

            var normalized = char.ToUpperInvariant(character);
            if (Alphabet.IndexOf(normalized) < 0 || written >= MaxLength)
            {
                return false;
            }

            buffer[written] = normalized;
            written++;
        }

        if (written < MinLength)
        {
            return false;
        }

        code = new string(buffer[..written]);
        return true;
    }
}
