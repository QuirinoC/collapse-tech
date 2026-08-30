using Microsoft.Extensions.Options;
using PixelBoard.Application;
using PixelBoard.Configuration;

namespace PixelBoard.Infrastructure.Notifications;

public sealed class NotificationOutboxWorker(
    INotificationStore store,
    ApnsClient apns,
    IOptions<ApnsOptions> options,
    ILogger<NotificationOutboxWorker> logger) : BackgroundService
{
    private const int MaximumAttempts = 8;
    private readonly ApnsOptions apnsOptions = options.Value;
    private readonly string workerId = $"{Environment.MachineName}:{Guid.NewGuid():N}";

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!apnsOptions.Enabled)
        {
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var notification = await store.ClaimNextAsync(workerId, stoppingToken);
                if (notification is null)
                {
                    await Task.Delay(
                        TimeSpan.FromSeconds(apnsOptions.PollSeconds),
                        stoppingToken);
                    continue;
                }

                await DeliverAsync(notification, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception exception)
            {
                logger.LogError(exception, "Notification outbox worker failed; retrying.");
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
            }
        }
    }

    private async Task DeliverAsync(
        NotificationOutboxItem notification,
        CancellationToken cancellationToken)
    {
        if (notification.ExpiresAt is { } expiresAt
            && expiresAt <= DateTimeOffset.UtcNow)
        {
            await store.MarkSentAsync(
                notification.NotificationId,
                workerId,
                cancellationToken);
            return;
        }

        var devices = await store.GetActiveDevicesAsync(
            notification.RecipientFirebaseUid,
            cancellationToken);
        if (devices.Count == 0)
        {
            await store.MarkSentAsync(
                notification.NotificationId,
                workerId,
                cancellationToken);
            return;
        }

        var shouldRetry = false;
        foreach (var device in devices)
        {
            var outcome = await apns.SendAsync(device, notification, cancellationToken);
            switch (outcome.Result)
            {
                case ApnsDeliveryResult.Delivered:
                    break;
                case ApnsDeliveryResult.InvalidToken:
                    await store.InvalidateDeviceAsync(
                        device.InstallationId,
                        device.Token,
                        cancellationToken);
                    break;
                case ApnsDeliveryResult.Retry:
                    shouldRetry = true;
                    logger.LogWarning(
                        "APNs delivery for notification {NotificationId} will retry: {Error}",
                        notification.NotificationId,
                        outcome.Error);
                    break;
            }
        }

        if (shouldRetry && notification.AttemptCount < MaximumAttempts)
        {
            var delay = TimeSpan.FromSeconds(
                Math.Min(3_600, Math.Pow(2, notification.AttemptCount) * 5));
            await store.RescheduleAsync(
                notification.NotificationId,
                workerId,
                "One or more APNs deliveries failed.",
                delay,
                cancellationToken);
            return;
        }

        await store.MarkSentAsync(
            notification.NotificationId,
            workerId,
            cancellationToken);
    }
}
