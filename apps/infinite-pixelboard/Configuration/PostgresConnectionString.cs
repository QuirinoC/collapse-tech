using Npgsql;

namespace PixelBoard.Configuration;

public static class PostgresConnectionString
{
    public static string Normalize(string value)
    {
        if (!value.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase)
            && !value.StartsWith(
                "postgresql://",
                StringComparison.OrdinalIgnoreCase))
        {
            return value;
        }

        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri)
            || string.IsNullOrWhiteSpace(uri.Host)
            || string.IsNullOrWhiteSpace(uri.AbsolutePath.Trim('/')))
        {
            throw new InvalidOperationException(
                "The PostgreSQL URI is not valid.");
        }

        var userInfoSeparator = uri.UserInfo.IndexOf(':');
        if (userInfoSeparator <= 0)
        {
            throw new InvalidOperationException(
                "The PostgreSQL URI must include a username and password.");
        }

        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.IsDefaultPort ? 5432 : uri.Port,
            Database = Uri.UnescapeDataString(uri.AbsolutePath.TrimStart('/')),
            Username = Uri.UnescapeDataString(uri.UserInfo[..userInfoSeparator]),
            Password = Uri.UnescapeDataString(uri.UserInfo[(userInfoSeparator + 1)..])
        };

        foreach (var pair in uri.Query.TrimStart('?').Split(
                     '&',
                     StringSplitOptions.RemoveEmptyEntries))
        {
            var separator = pair.IndexOf('=');
            var key = Uri.UnescapeDataString(
                separator < 0 ? pair : pair[..separator]);
            var queryValue = Uri.UnescapeDataString(
                separator < 0 ? string.Empty : pair[(separator + 1)..]);
            switch (key.ToLowerInvariant())
            {
                case "sslmode":
                    builder["SSL Mode"] = queryValue;
                    break;
                case "application_name":
                    builder.ApplicationName = queryValue;
                    break;
                case "options":
                    builder.Options = queryValue;
                    break;
                default:
                    throw new InvalidOperationException(
                        $"The PostgreSQL URI query option '{key}' is not supported.");
            }
        }

        return builder.ConnectionString;
    }
}
