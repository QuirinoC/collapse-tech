using Xunit;

namespace CoachGG.Tests;

public sealed class RedisIntegrationFactAttribute : FactAttribute
{
    public RedisIntegrationFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("COACHGG_TEST_REDIS")))
            Skip = "COACHGG_TEST_REDIS is not configured.";
    }
}
