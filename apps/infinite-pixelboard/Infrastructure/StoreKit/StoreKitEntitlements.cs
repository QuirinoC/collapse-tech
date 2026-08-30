using PixelBoard.Application;
using PixelBoard.Contracts.V1;

namespace PixelBoard.Infrastructure.StoreKit;

public sealed record VerifiedStoreKitTransaction(
    string TransactionId,
    string OriginalTransactionId,
    string ProductId,
    AppAccountToken AppAccountToken,
    string Environment,
    DateTimeOffset SignedAt,
    DateTimeOffset ExpiresAt,
    DateTimeOffset? RevokedAt);

public sealed record StoreKitVerificationResult(
    VerifiedStoreKitTransaction? Transaction,
    string? Error)
{
    public bool IsValid => Transaction is not null;
}

public sealed record StoreKitNotificationVerificationResult(
    bool IsValid,
    Guid? NotificationId,
    string? NotificationType,
    VerifiedStoreKitTransaction? Transaction,
    string? Error);

public enum StoreKitApplyOutcome
{
    Applied,
    LinkedToAnotherAccount,
    NotApplied
}

public interface IStoreKitTransactionVerifier
{
    StoreKitVerificationResult Verify(string signedTransaction);

    StoreKitNotificationVerificationResult VerifyNotification(string signedPayload);
}

public interface IStoreKitEntitlementStore
{
    ValueTask<AppAccountToken?> GetOrCreateAccountTokenAsync(
        AccountId accountId,
        CancellationToken cancellationToken = default);

    ValueTask<StoreKitApplyOutcome> ApplyAsync(
        AccountId accountId,
        VerifiedStoreKitTransaction transaction,
        CancellationToken cancellationToken = default);

    ValueTask<bool> ApplyNotificationAsync(
        VerifiedStoreKitTransaction transaction,
        CancellationToken cancellationToken = default);
}
