namespace PixelBoard.Tests;

public sealed class RedisFactAttribute : FactAttribute
{
    public RedisFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(
                Environment.GetEnvironmentVariable("PIXELBOARD_TEST_REDIS")))
        {
            Skip = "PIXELBOARD_TEST_REDIS is not configured.";
        }
    }
}

public sealed class PostgresFactAttribute : FactAttribute
{
    public PostgresFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(
                Environment.GetEnvironmentVariable("PIXELBOARD_TEST_POSTGRES")))
        {
            Skip = "PIXELBOARD_TEST_POSTGRES is not configured.";
        }
    }
}
