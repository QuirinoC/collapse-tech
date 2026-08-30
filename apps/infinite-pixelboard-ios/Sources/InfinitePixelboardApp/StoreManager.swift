import StoreKit
import SwiftUI
import PixelboardCore

@MainActor
final class StoreManager: ObservableObject {
    enum TrialEligibility: Equatable {
        case unknown
        case eligible
        case unavailable
    }

    @Published private(set) var products: [Product] = []
    @Published private(set) var isWorking = false
    @Published private(set) var trialEligibility: TrialEligibility = .unknown
    @Published private(set) var activeProductID: String?
    @Published private(set) var linkedToAnotherAccount = false
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
    private var pendingTransactions: [UInt64: PendingTransaction] = [:]
    private var accountGeneration: UInt64 = 0
    private var isAuthenticated = false
    private var expectedAppAccountToken: UUID?

    static let manageSubscriptionsURL = URL(string: "https://apps.apple.com/account/subscriptions")!
    static let supportURL = URL(string: "mailto:hello@collapsetechnologies.com")!

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
        expectedAppAccountToken = nil
        activeProductID = nil
        linkedToAnotherAccount = false
        reconciliationTask?.cancel()
        reconciliationTask = nil
        deliveryTasks.values.forEach { $0.cancel() }
        deliveryTasks.removeAll()
        deliveryTaskGenerations.removeAll()
        completedTransactionIDs.removeAll()
        permanentlyFailedTransactionIDs.removeAll()
        pendingTransactions.removeAll()
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

    func refreshEntitlementState() async {
        guard isAuthenticated else {
            activeProductID = nil
            return
        }
        let generation = accountGeneration
        do {
            let token = try await api.storeKitAccountToken()
            guard isAuthenticated, generation == accountGeneration else { return }
            expectedAppAccountToken = token
            reconcilePendingTransactions(for: token, generation: generation)
            await reconcileCurrentEntitlements(for: token, generation: generation)
            guard isAuthenticated, generation == accountGeneration else { return }
            await refreshActiveProduct(for: token)
        } catch {
            guard generation == accountGeneration else { return }
            activeProductID = nil
            expectedAppAccountToken = nil
        }
    }

    func loadProducts() async {
        do {
            let loadedProducts = try await Product.products(for: productIDs)
                .sorted { $0.price < $1.price }
            products = loadedProducts
            guard let subscription = loadedProducts.first?.subscription,
                  subscription.introductoryOffer != nil else {
                trialEligibility = .unavailable
                return
            }
            trialEligibility = await subscription.isEligibleForIntroOffer
                ? .eligible
                : .unavailable
        } catch {
            trialEligibility = .unavailable
            errorMessage = error.localizedDescription
        }
    }

    func restorePurchases() async {
        isWorking = true
        defer { isWorking = false }
        do {
            try await AppStore.sync()
            await refreshEntitlementState()
            guard isAuthenticated else { return }
            await onEntitlementChanged?()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func stripePortalURL() async -> URL? {
        isWorking = true
        defer { isWorking = false }
        do {
            return try await api.stripePortalURL()
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    func purchase(_ product: Product) async -> Bool {
        isWorking = true
        defer { isWorking = false }
        let generation = accountGeneration
        do {
            let token = try await api.storeKitAccountToken()
            guard isAuthenticated, generation == accountGeneration else { return false }
            expectedAppAccountToken = token
            let result = try await product.purchase(options: [.appAccountToken(token)])
            guard isAuthenticated, generation == accountGeneration else { return false }
            guard case let .success(verification) = result else { return false }
            let transaction = try verified(verification)
            guard transaction.appAccountToken == token else {
                linkedToAnotherAccount = transaction.appAccountToken != nil
                return false
            }
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

    private func refreshActiveProduct(for appAccountToken: UUID) async {
        activeProductID = nil
        linkedToAnotherAccount = false
        for await result in StoreKit.Transaction.currentEntitlements {
            guard case let .verified(transaction) = result,
                  productIDs.contains(transaction.productID),
                  transaction.revocationDate == nil,
                  transaction.expirationDate.map({ $0 > Date() }) ?? true else {
                continue
            }
            guard transaction.appAccountToken == appAccountToken else {
                if transaction.appAccountToken != nil {
                    linkedToAnotherAccount = true
                }
                continue
            }
            linkedToAnotherAccount = false
            activeProductID = transaction.productID
            return
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
        guard let expectedAppAccountToken else {
            pendingTransactions[transaction.id] = PendingTransaction(
                transaction: transaction,
                signedTransactionInfo: result.jwsRepresentation)
            return
        }
        guard transaction.appAccountToken == expectedAppAccountToken else {
            if transaction.appAccountToken != nil {
                linkedToAnotherAccount = true
                activeProductID = nil
            }
            pendingTransactions.removeValue(forKey: transaction.id)
            return
        }
        pendingTransactions.removeValue(forKey: transaction.id)
        activeProductID = transaction.productID
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
            if error.isStoreKitAccountMismatch {
                linkedToAnotherAccount = true
                activeProductID = nil
                errorMessage = nil
            } else {
                errorMessage = error.localizedDescription
            }
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
            PixelboardL10n.storeKitVerificationFailed
        }
    }

    private enum DeliveryOutcome {
        case delivered
        case retryableFailure
        case permanentFailure
    }

    private struct PendingTransaction {
        let transaction: StoreKit.Transaction
        let signedTransactionInfo: String
    }

    private func reconcilePendingTransactions(
        for token: UUID,
        generation: UInt64
    ) {
        for pending in Array(pendingTransactions.values) {
            guard generation == accountGeneration, isAuthenticated else { return }
            if pending.transaction.appAccountToken == token {
                pendingTransactions.removeValue(forKey: pending.transaction.id)
                activeProductID = pending.transaction.productID
                scheduleDeliveryRetry(
                    for: pending.transaction,
                    signedTransactionInfo: pending.signedTransactionInfo)
            } else if pending.transaction.appAccountToken != nil {
                pendingTransactions.removeValue(forKey: pending.transaction.id)
                linkedToAnotherAccount = true
                activeProductID = nil
            } else {
                pendingTransactions.removeValue(forKey: pending.transaction.id)
            }
        }
    }

    private func reconcileCurrentEntitlements(
        for token: UUID,
        generation: UInt64
    ) async {
        for await result in StoreKit.Transaction.currentEntitlements {
            guard !Task.isCancelled,
                  isAuthenticated,
                  generation == accountGeneration else {
                return
            }
            guard case let .verified(transaction) = result,
                  productIDs.contains(transaction.productID),
                  transaction.revocationDate == nil,
                  transaction.expirationDate.map({ $0 > Date() }) ?? true else {
                continue
            }
            guard transaction.appAccountToken == token else {
                if transaction.appAccountToken != nil {
                    linkedToAnotherAccount = true
                    activeProductID = nil
                }
                continue
            }
            activeProductID = transaction.productID
            let outcome = await deliver(
                transaction,
                signedTransactionInfo: result.jwsRepresentation)
            guard generation == accountGeneration, isAuthenticated else { return }
            if outcome == .permanentFailure {
                continue
            }
            if outcome == .retryableFailure {
                scheduleDeliveryRetry(
                    for: transaction,
                    signedTransactionInfo: result.jwsRepresentation)
            }
        }
    }
}

private extension APIClientError {
    var isStoreKitAccountMismatch: Bool {
        guard case let .server(_, payload) = self else { return false }
        return payload?.code == "storekit_account_mismatch"
    }

    var isPermanentStoreKitDeliveryFailure: Bool {
        guard case let .server(status, _) = self else { return false }
        return (400..<500).contains(status) && status != 408 && status != 429
    }
}
