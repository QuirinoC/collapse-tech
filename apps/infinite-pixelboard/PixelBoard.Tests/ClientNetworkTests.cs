using System.Net;
using PixelBoard.Application;

namespace PixelBoard.Tests;

public sealed class ClientNetworkTests
{
    [Fact]
    public void LoopbackAndMissingAddressesAreNotRateLimited()
    {
        Assert.Null(ClientNetwork.RateLimitBucket(null));
        Assert.Null(ClientNetwork.RateLimitBucket(IPAddress.Loopback));
        Assert.Null(ClientNetwork.RateLimitBucket(IPAddress.IPv6Loopback));
    }

    [Fact]
    public void Ipv4MappedAddressesCollapseToIpv4()
    {
        var mapped = IPAddress.Parse("::ffff:203.0.113.9");

        Assert.Equal("203.0.113.9", ClientNetwork.RateLimitBucket(mapped));
    }

    [Fact]
    public void Ipv6AddressesShareASlash64Bucket()
    {
        var first = IPAddress.Parse("2001:db8:1:2:aaaa:bbbb:cccc:dddd");
        var neighbor = IPAddress.Parse("2001:db8:1:2:1111:2222:3333:4444");
        var otherNetwork = IPAddress.Parse("2001:db8:1:3::1");

        Assert.Equal(
            ClientNetwork.RateLimitBucket(first),
            ClientNetwork.RateLimitBucket(neighbor));
        Assert.NotEqual(
            ClientNetwork.RateLimitBucket(first),
            ClientNetwork.RateLimitBucket(otherNetwork));
    }
}
