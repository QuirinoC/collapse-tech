namespace TrustApi.Infrastructure.StoreKit;

public sealed record VerifiedStoreKitTransaction(
    string TransactionId,
    string OriginalTransactionId,
    string ProductId,
    Guid AppAccountToken,
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
    Task<Guid> GetOrCreateAccountTokenAsync(Guid accountId, CancellationToken cancellationToken);

    Task<StoreKitApplyOutcome> ApplyAsync(
        Guid accountId,
        VerifiedStoreKitTransaction transaction,
        CancellationToken cancellationToken);

    Task<bool> ApplyNotificationAsync(
        VerifiedStoreKitTransaction transaction,
        CancellationToken cancellationToken);
}
