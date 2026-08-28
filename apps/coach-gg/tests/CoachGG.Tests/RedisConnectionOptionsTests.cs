using CoachGG.Services;
using System.Net;
using Xunit;

namespace CoachGG.Tests;

public class RedisConnectionOptionsTests
{
    [Fact]
    public void Parse_RedissUrl_ConfiguresTlsAndDecodedAclCredentials()
    {
        var options = RedisConnectionOptions.Parse(
            "rediss://default:encoded%40password@cache.example.test:6380");

        Assert.True(options.Ssl);
        Assert.False(options.AbortOnConnectFail);
        Assert.Equal("default", options.User);
        Assert.Equal("encoded@password", options.Password);
        AssertEndpoint(options, "cache.example.test", 6380);
    }

    [Fact]
    public void Parse_RedisUrl_UsesPlaintextDefaultPort()
    {
        var options = RedisConnectionOptions.Parse("redis://:password@cache.example.test");

        Assert.False(options.Ssl);
        Assert.Null(options.User);
        Assert.Equal("password", options.Password);
        AssertEndpoint(options, "cache.example.test", 6379);
    }

    [Fact]
    public void Parse_ConnectionString_PreservesStackExchangeConfiguration()
    {
        var options = RedisConnectionOptions.Parse("cache.example.test:6379,ssl=true");

        Assert.True(options.Ssl);
        AssertEndpoint(options, "cache.example.test", 6379);
    }

    [Fact]
    public void Parse_ProductionConfiguration_AbortsOnInitialConnectionFailure()
    {
        var options = RedisConnectionOptions.Parse(
            "rediss://:password@cache.example.test",
            abortOnConnectFail: true);

        Assert.True(options.AbortOnConnectFail);
        Assert.True(options.Ssl);
    }

    [Fact]
    public void Parse_ProductionConnectionString_AbortsOnInitialConnectionFailure()
    {
        var options = RedisConnectionOptions.Parse(
            "cache.example.test:6379,ssl=true",
            abortOnConnectFail: true);

        Assert.True(options.AbortOnConnectFail);
        Assert.True(options.Ssl);
    }

    private static void AssertEndpoint(
        StackExchange.Redis.ConfigurationOptions options,
        string expectedHost,
        int expectedPort)
    {
        var endpoint = Assert.IsType<DnsEndPoint>(Assert.Single(options.EndPoints));
        Assert.Equal(expectedHost, endpoint.Host);
        Assert.Equal(expectedPort, endpoint.Port);
    }
}
