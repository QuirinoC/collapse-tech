using StackExchange.Redis;

namespace CoachGG.Services;

public static class RedisConnectionOptions
{
    public static ConfigurationOptions Parse(string connection)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(connection);

        if (!Uri.TryCreate(connection, UriKind.Absolute, out var uri)
            || (uri.Scheme != "redis" && uri.Scheme != "rediss"))
        {
            return ConfigurationOptions.Parse(connection);
        }

        if (string.IsNullOrWhiteSpace(uri.Host))
            throw new ArgumentException("Redis URL must include a host.", nameof(connection));

        var usesTls = uri.Scheme == "rediss";
        var options = new ConfigurationOptions
        {
            AbortOnConnectFail = false,
            Ssl = usesTls
        };
        options.EndPoints.Add(uri.Host, uri.IsDefaultPort ? usesTls ? 6380 : 6379 : uri.Port);

        if (!string.IsNullOrEmpty(uri.UserInfo))
        {
            var separator = uri.UserInfo.IndexOf(':');
            if (separator >= 0)
            {
                var user = Uri.UnescapeDataString(uri.UserInfo[..separator]);
                options.User = string.IsNullOrEmpty(user) ? null : user;
                options.Password = Uri.UnescapeDataString(uri.UserInfo[(separator + 1)..]);
            }
            else
            {
                options.Password = Uri.UnescapeDataString(uri.UserInfo);
            }
        }

        return options;
    }
}
