using TrustApi.Domain;

namespace TrustApi.Infrastructure.Notifications;

public interface ILookReceiptPublisher
{
    Task NotifyLookAsync(LookEvent look, CancellationToken cancellationToken);
}

public sealed class LookReceiptPublisher(
    IPushDeviceStore devices,
    ApnsClient apns,
    ILogger<LookReceiptPublisher> logger) : ILookReceiptPublisher
{
    public async Task NotifyLookAsync(LookEvent look, CancellationToken cancellationToken)
    {
        IReadOnlyList<PushDevice> registrations;
        try
        {
            registrations = await devices.ListActiveAsync(look.SubjectId, cancellationToken);
        }
        catch (Exception exception)
        {
            logger.LogWarning(exception, "Could not load push devices for look {LookId}.", look.Id);
            return;
        }

        if (registrations.Count == 0)
        {
            logger.LogInformation("No push devices registered for the looked-at person {SubjectId}.", look.SubjectId);
            return;
        }

        foreach (var device in registrations)
        {
            try
            {
                var outcome = await apns.SendLookReceiptAsync(
                    device,
                    look.ViewerName + " viewed your location",
                    "They can see your live location and the last " + look.HistoryWindowHours + " hours of history.",
                    cancellationToken);
                if (outcome.Result == ApnsDeliveryResult.InvalidToken)
                {
                    await devices.InvalidateTokenAsync(device.Token, cancellationToken);
                }
                else if (outcome.Result == ApnsDeliveryResult.Retry)
                {
                    logger.LogWarning(
                        "APNs did not deliver look {LookId} to {InstallationId}: {Error}",
                        look.Id,
                        device.InstallationId,
                        outcome.Error);
                }
            }
            catch (Exception exception)
            {
                logger.LogWarning(
                    exception,
                    "APNs failed for look {LookId} installation {InstallationId}.",
                    look.Id,
                    device.InstallationId);
            }
        }
    }
}

public sealed class NoOpLookReceiptPublisher : ILookReceiptPublisher
{
    public Task NotifyLookAsync(LookEvent look, CancellationToken cancellationToken) => Task.CompletedTask;
}
