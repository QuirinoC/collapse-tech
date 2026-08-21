using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace PixelBoard.Infrastructure.Board;

public sealed class BoardStorageHealthCheck(IBoardStore boardStore) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        try
        {
            await boardStore.CheckHealthAsync(cancellationToken);
            return HealthCheckResult.Healthy();
        }
        catch (Exception exception)
        {
            return HealthCheckResult.Unhealthy(
                "The Redis board store is unavailable.",
                exception);
        }
    }
}
