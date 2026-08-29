using System.Net;
using System.Net.Sockets;

namespace PixelBoard.Application;

public static class ClientNetwork
{
    public static string? RateLimitBucket(IPAddress? address)
    {
        if (address is null || IPAddress.IsLoopback(address))
        {
            return null;
        }

        if (address.IsIPv4MappedToIPv6)
        {
            address = address.MapToIPv4();
        }

        if (address.AddressFamily == AddressFamily.InterNetwork)
        {
            return address.ToString();
        }

        if (address.AddressFamily == AddressFamily.InterNetworkV6)
        {
            var bytes = address.GetAddressBytes();
            if (bytes.Length != 16)
            {
                return address.ToString();
            }

            Array.Clear(bytes, 8, 8);
            return new IPAddress(bytes).ToString();
        }

        return address.ToString();
    }
}
