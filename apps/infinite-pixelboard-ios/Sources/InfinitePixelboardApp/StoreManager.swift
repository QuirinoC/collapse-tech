import StoreKit
import SwiftUI
import PixelboardCore

@MainActor
final class StoreManager: ObservableObject {
    @Published private(set) var products: [Product] = []
    @Published private(set) var isWorking = false
    @Published var errorMessage: String?

    var onEntitlementChanged: (@MainActor @Sendable () async -> Void)?

    private let api: PixelboardAPIClient
    private let productIDs = [
        AppConfiguration.monthlyProductID,
        AppConfiguration.annualProductID
    ]
    private var updatesTask: Task<Void, Never>?
    private var reconciliationTask: Task<Void, Never>?
    private var deliveryTasks: [UInt64: Task<Void, Never>] = [:]
    private var deliveryTaskGenerations: [UInt64: UInt64] = [:]
    private var activeTransactionIDs: Set<UInt64> = []
    private var completedTransactionIDs: Set<UInt64> = []
    private var permanentlyFailedTransactionIDs: Set<UInt64> = []
    private var accountGeneration: UInt64 = 0
    private var isAuthenticated = false

    init(api: PixelboardAPIClient) {
        self.api = api
        startTransactionUpdates()
    }

    deinit {
        updatesTask?.cancel()
        reconciliationTask?.cancel()
        deliveryTasks.values.forEach { $0.cancel() }
    }

    func startTransactionUpdates() {
        guard updatesTask == nil else { return }
        updatesTask = Task { [weak self] in
            for await result in StoreKit.Transaction.updates {
                guard !Task.isCancelled else { return }
                guard let self else { return }
                self.processTransactionUpdate(result)
            }
        }
    }

    func stopTransactionUpdates() {
        isAuthenticated = false
        updatesTask?.cancel()
        updatesTask = nil
        reconciliationTask?.cancel()
        reconciliationTask = nil
        deliveryTasks.values.forEach { $0.cancel() }
        deliveryTasks.removeAll()
        deliveryTaskGenerations.removeAll()
    }

    func authenticationDidChange(isAuthenticated: Bool) {
        accountGeneration &+= 1
        self.isAuthenticated = isAuthenticated
        reconciliationTask?.cancel()
        reconciliationTask = nil
        deliveryTasks.values.forEach { $0.cancel() }
        deliveryTasks.removeAll()
        deliveryTaskGenerations.removeAll()
        completedTransactionIDs.removeAll()
        permanentlyFailedTransactionIDs.removeAll()
        guard isAuthenticated else { return }

        let generation = accountGeneration
        reconciliationTask = Task { [weak self] in
            for await result in StoreKit.Transaction.unfinished {
                guard !Task.isCancelled, let self else { return }
                guard generation == self.accountGeneration else { return }
                self.processTransactionUpdate(result)
            }
            guard let self, generation == self.accountGeneration else { return }
            self.reconciliationTask = nil
        }
    }

    func loadProducts() async {
        do {
            products = try await Product.products(for: productIDs)
                .sorted { $0.price < $1.price }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func purchase(_ product: Product) async -> Bool {
        isWorking = true
        defer { isWorking = false }
        do {
            let token = try await api.storeKitAccountToken()
            let result = try await product.purchase(options: [.appAccountToken(token)])
            guard case let .success(verification) = result else { return false }
            let transaction = try verified(verification)
            permanentlyFailedTransactionIDs.remove(transaction.id)
            let outcome = await deliver(
                transaction,
                signedTransactionInfo: verification.jwsRepresentation
            )
            if outcome == .delivered {
                return true
            }
            if outcome == .retryableFailure {
                scheduleDeliveryRetry(
                    for: transaction,
                    signedTransactionInfo: verification.jwsRepresentation
                )
            }
            return false
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func restore() async -> Bool {
        isWorking = true
        defer { isWorking = false }
        do {
            try await AppStore.sync()
            var restored = false
            for await result in StoreKit.Transaction.currentEntitlements {
                guard case let .verified(transaction) = result else {
                    errorMessage = StoreError.failedVerification.localizedDescription
                    continue
                }
                guard productIDs.contains(transaction.productID) else { continue }
                permanentlyFailedTransactionIDs.remove(transaction.id)
                let outcome = await deliver(
                    transaction,
                    signedTransactionInfo: result.jwsRepresentation
                )
                if outcome == .delivered {
                    restored = true
                } else if outcome == .retryableFailure {
                    scheduleDeliveryRetry(
                        for: transaction,
                        signedTransactionInfo: result.jwsRepresentation
                    )
                }
            }
            return restored
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func manageSubscriptions(in scene: UIWindowScene) async {
        do {
            try await AppStore.showManageSubscriptions(in: scene)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func verified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case let .verified(value):
            return value
        case .unverified:
            throw StoreError.failedVerification
        }
    }

    private func processTransactionUpdate(
        _ result: VerificationResult<StoreKit.Transaction>
    ) {
        guard isAuthenticated else { return }
        guard case let .verified(transaction) = result else {
            errorMessage = StoreError.failedVerification.localizedDescription
            return
        }
        guard productIDs.contains(transaction.productID) else { return }
        scheduleDeliveryRetry(
            for: transaction,
            signedTransactionInfo: result.jwsRepresentation
        )
    }

    private func deliver(
        _ transaction: StoreKit.Transaction,
        signedTransactionInfo: String
    ) async -> DeliveryOutcome {
        let generation = accountGeneration
        guard !completedTransactionIDs.contains(transaction.id) else { return .delivered }
        guard activeTransactionIDs.insert(transaction.id).inserted else {
            return .retryableFailure
        }
        defer { activeTransactionIDs.remove(transaction.id) }

        do {
            _ = try await api.verifyStoreKitTransaction(signedTransactionInfo)
            await transaction.finish()
            retireDeliveryTask(
                transaction.id,
                completedGeneration: generation
            )
            if generation == accountGeneration {
                completedTransactionIDs.insert(transaction.id)
                permanentlyFailedTransactionIDs.remove(transaction.id)
            }
            errorMessage = nil
            return .delivered
        } catch is CancellationError {
            return .retryableFailure
        } catch let error as APIClientError {
            errorMessage = error.localizedDescription
            if error.isPermanentStoreKitDeliveryFailure {
                if generation == accountGeneration {
                    permanentlyFailedTransactionIDs.insert(transaction.id)
                }
                return .permanentFailure
            }
            return .retryableFailure
        } catch {
            errorMessage = error.localizedDescription
            return .retryableFailure
        }
    }

    private func scheduleDeliveryRetry(
        for transaction: StoreKit.Transaction,
        signedTransactionInfo: String
    ) {
        let transactionID = transaction.id
        let generation = accountGeneration
        guard isAuthenticated,
              !completedTransactionIDs.contains(transactionID),
              !permanentlyFailedTransactionIDs.contains(transactionID),
              deliveryTasks[transactionID] == nil else {
            return
        }

        deliveryTaskGenerations[transactionID] = generation
        deliveryTasks[transactionID] = Task { [weak self] in
            var delay: UInt64 = 0
            while !Task.isCancelled {
                if delay > 0 {
                    try? await Task.sleep(for: .seconds(delay))
                    guard !Task.isCancelled else { return }
                }
                guard let self else { return }
                let outcome = await self.deliver(
                    transaction,
                    signedTransactionInfo: signedTransactionInfo
                )
                if outcome == .delivered {
                    self.clearDeliveryTask(
                        transactionID,
                        generation: generation
                    )
                    if generation == self.accountGeneration {
                        await self.onEntitlementChanged?()
                    }
                    return
                }
                if outcome == .permanentFailure {
                    self.clearDeliveryTask(
                        transactionID,
                        generation: generation
                    )
                    return
                }
                delay = delay == 0 ? 1 : min(delay * 2, 60)
            }
            self?.clearDeliveryTask(transactionID, generation: generation)
        }
    }

    private func clearDeliveryTask(_ transactionID: UInt64, generation: UInt64) {
        guard deliveryTaskGenerations[transactionID] == generation else { return }
        deliveryTasks[transactionID] = nil
        deliveryTaskGenerations[transactionID] = nil
    }

    private func retireDeliveryTask(
        _ transactionID: UInt64,
        completedGeneration: UInt64
    ) {
        if deliveryTaskGenerations[transactionID] != completedGeneration {
            deliveryTasks[transactionID]?.cancel()
        }
        deliveryTasks[transactionID] = nil
        deliveryTaskGenerations[transactionID] = nil
    }

    enum StoreError: LocalizedError {
        case failedVerification

        var errorDescription: String? {
            "The App Store transaction could not be verified on this device."
        }
    }

    private enum DeliveryOutcome {
        case delivered
        case retryableFailure
        case permanentFailure
    }
}

private extension APIClientError {
    var isPermanentStoreKitDeliveryFailure: Bool {
        guard case let .server(status, _) = self else { return false }
        return (400..<500).contains(status) && status != 408 && status != 429
    }
}
