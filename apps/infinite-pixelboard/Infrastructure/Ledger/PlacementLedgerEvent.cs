using PixelBoard.Contracts.V1;

namespace PixelBoard.Infrastructure.Ledger;

public sealed record PlacementLedgerEvent(
    PlacementId PlacementId,
    string FirebaseUid,
    int Row,
    int Column,
    string Color,
    DateTimeOffset PlacedAt,
    string ClientPlatform,
    string ClientVersion,
    string IdempotencyKey,
    PlacementId? PriorPlacementId,
    string? PriorColor,
    byte[]? IpHash,
    byte[]? DeviceHash);

public sealed record AtomicPlacementResult(
    bool IsAccepted,
    string StreamEntryId,
    PlacementId? PlacementId,
    bool IsDuplicate,
    bool IsIdempotencyConflict,
    PlacementId? PriorPlacementId,
    string? PriorColor,
    PixelState? Pixel,
    TimeSpan RemainingCooldown);

public interface IAtomicPlacementStore
{
    ValueTask<AtomicPlacementResult> PlaceAsync(
        PlacementLedgerEvent placement,
        TimeSpan cooldown,
        CancellationToken cancellationToken = default);
}

public interface IPlacementLedger
{
    ValueTask IngestAsync(
        PlacementLedgerEvent placement,
        string streamEntryId,
        CancellationToken cancellationToken = default);
}
