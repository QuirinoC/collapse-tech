using System.Text.Json;
using PixelBoard.Application;

namespace PixelBoard.Infrastructure.Notifications;

public enum NotificationCategory
{
    BoardActivity,
    Broadcast
}

public sealed record PushDeviceRegistration(
    Guid InstallationId,
    string Token,
    string Environment,
    string BundleId);

public sealed record NotificationPreferences(
    bool BoardActivityEnabled,
    bool BroadcastEnabled);

public sealed record NotificationOutboxItem(
    Guid NotificationId,
    string RecipientFirebaseUid,
    NotificationCategory Category,
    string Title,
    string Body,
    JsonElement Payload,
    DateTimeOffset? ExpiresAt,
    int AttemptCount);

public sealed record NotificationCampaign(
    Guid CampaignId,
    string Title,
    string Body,
    DateTimeOffset? ExpiresAt,
    int RecipientCount,
    DateTimeOffset CreatedAt);

public sealed record NotificationCampaignRequest(
    string Title,
    string Body,
    IReadOnlyList<string> RecipientAccountIds,
    DateTimeOffset? ExpiresAt);

public interface INotificationStore
{
    ValueTask RegisterDeviceAsync(
        AccountId accountId,
        PushDeviceRegistration registration,
        CancellationToken cancellationToken = default);

    ValueTask RemoveDeviceAsync(
        AccountId accountId,
        Guid installationId,
        CancellationToken cancellationToken = default);

    ValueTask<NotificationPreferences> GetPreferencesAsync(
        AccountId accountId,
        CancellationToken cancellationToken = default);

    ValueTask SavePreferencesAsync(
        AccountId accountId,
        NotificationPreferences preferences,
        CancellationToken cancellationToken = default);

    ValueTask<NotificationCampaign> CreateCampaignAsync(
        AccountId moderatorAccountId,
        string title,
        string body,
        IReadOnlyCollection<AccountId> recipients,
        DateTimeOffset? expiresAt,
        CancellationToken cancellationToken = default);

    ValueTask<NotificationOutboxItem?> ClaimNextAsync(
        string workerId,
        CancellationToken cancellationToken = default);

    ValueTask<IReadOnlyList<PushDeviceRegistration>> GetActiveDevicesAsync(
        string firebaseUid,
        CancellationToken cancellationToken = default);

    ValueTask MarkSentAsync(
        Guid notificationId,
        string workerId,
        CancellationToken cancellationToken = default);

    ValueTask RescheduleAsync(
        Guid notificationId,
        string workerId,
        string error,
        TimeSpan delay,
        CancellationToken cancellationToken = default);

    ValueTask InvalidateDeviceAsync(
        Guid installationId,
        string token,
        CancellationToken cancellationToken = default);

    ValueTask DeleteAccountAsync(
        string firebaseUid,
        CancellationToken cancellationToken = default);
}
