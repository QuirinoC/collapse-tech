using Npgsql;
using PixelBoard.Configuration;

namespace PixelBoard.Tests;

public sealed class PostgresConnectionStringTests
{
    [Fact]
    public void RenderUriIsConvertedToNpgsqlConnectionString()
    {
        var normalized = PostgresConnectionString.Normalize(
            "postgresql://pixelboard_runtime:p%40ss%3Aword@postgres.internal:5433/pixelboard_db?sslmode=require&application_name=pixelboard");
        var builder = new NpgsqlConnectionStringBuilder(normalized);

        Assert.Equal("postgres.internal", builder.Host);
        Assert.Equal(5433, builder.Port);
        Assert.Equal("pixelboard_db", builder.Database);
        Assert.Equal("pixelboard_runtime", builder.Username);
        Assert.Equal("p@ss:word", builder.Password);
        Assert.Equal(SslMode.Require, builder.SslMode);
        Assert.Equal("pixelboard", builder.ApplicationName);
    }

    [Fact]
    public void NpgsqlConnectionStringIsPreserved()
    {
        const string connectionString =
            "Host=localhost;Database=pixelboard;Username=runtime;Password=test";

        Assert.Equal(
            connectionString,
            PostgresConnectionString.Normalize(connectionString));
    }

    [Fact]
    public void UriWithoutCredentialsIsRejected()
    {
        Assert.Throws<InvalidOperationException>(() =>
            PostgresConnectionString.Normalize(
                "postgresql://postgres.internal/pixelboard"));
    }
}
