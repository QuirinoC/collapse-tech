using Microsoft.Extensions.Diagnostics.HealthChecks;
using Npgsql;
using PixelBoard.Infrastructure.Ledger;

namespace PixelBoard.Tests;

public sealed class PostgresHealthCheckIntegrationTests
{
    [PostgresFact]
    [Trait("Category", "Integration")]
    public async Task ProvisionedRuntimeRolePassesReadinessCheck()
    {
        var connectionString = Environment.GetEnvironmentVariable(
            "PIXELBOARD_TEST_POSTGRES")!;
        await using var dataSource = NpgsqlDataSource.Create(connectionString);
        var healthCheck = new PostgresHealthCheck(dataSource);

        var result = await healthCheck.CheckHealthAsync(
            new HealthCheckContext());

        Assert.Equal(HealthStatus.Healthy, result.Status);
    }
}
