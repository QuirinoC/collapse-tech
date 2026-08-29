using System.Security.Cryptography;

namespace PixelBoard.Application;

public static class ReferralCode
{
    public const int Length = 8;
    public const string Alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    public static string Create()
    {
        Span<char> buffer = stackalloc char[Length];
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

        Span<char> buffer = stackalloc char[Length];
        var written = 0;
        foreach (var character in value)
        {
            if (character is '-' or ' ' or '\t')
            {
                continue;
            }

            var normalized = char.ToUpperInvariant(character);
            if (Alphabet.IndexOf(normalized) < 0 || written >= Length)
            {
                return false;
            }

            buffer[written] = normalized;
            written++;
        }

        if (written != Length)
        {
            return false;
        }

        code = new string(buffer);
        return true;
    }
}
