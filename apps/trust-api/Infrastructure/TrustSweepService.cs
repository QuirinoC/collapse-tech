using TrustApi.Application;
using TrustApi.Domain;
using TrustApi.Infrastructure.StoreKit;

namespace TrustApi.Infrastructure;

/// <summary>
/// Closes Look sessions past ActiveLookTtl, prunes GPS past retention, marks due promises,
/// and recomputes StoreKit Plus from transaction expiry so sticky has_circle cannot linger.
/// </summary>
public sealed class TrustSweepService(
    ITrustStore store,
    TrustEngine engine,
    IStoreKitEntitlementStore storeKit,
    TimeProvider time,
    ILogger<TrustSweepService> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromMinutes(1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await SweepOnceAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                logger.LogWarning(exception, "Trust sweep failed.");
            }

            try
            {
                await Task.Delay(Interval, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
        }
    }

    public async Task SweepOnceAsync(CancellationToken cancellationToken)
    {
        var now = time.GetUtcNow();
        var lookCutoff = now - TrustRules.ActiveLookTtl;
        var expired = await store.ListExpiredActiveLooksAsync(lookCutoff, cancellationToken);
        foreach (var look in expired)
        {
            await store.ClearActiveLookAsync(look.ViewerId, look.SubjectId, cancellationToken);
            logger.LogInformation(
                "Closed expired look {LookId} viewer {ViewerId} subject {SubjectId}.",
                look.LookId,
                look.ViewerId,
                look.SubjectId);
        }

        await store.PruneLocationsByPlanAsync(
            now - TrustRules.LocationRetention(false),
            now - TrustRules.LocationRetention(true),
            cancellationToken);
        await engine.EvaluateDuePromisesAsync(cancellationToken);
        await storeKit.RefreshExpiredCoveragesAsync(cancellationToken);
    }
}
