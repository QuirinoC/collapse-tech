import StoreKit
import SwiftUI
import PixelboardCore

@MainActor
final class StoreManager: ObservableObject {
    @Published private(set) var products: [Product] = []
    @Published private(set) var isWorking = false
    @Published var errorMessage: String?

    private let api: PixelboardAPIClient
    private let productIDs = [
        AppConfiguration.monthlyProductID,
        AppConfiguration.annualProductID
    ]

    init(api: PixelboardAPIClient) {
        self.api = api
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
            _ = try await api.verifyStoreKitTransaction(verification.jwsRepresentation)
            await transaction.finish()
            return true
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
            for await result in Transaction.currentEntitlements {
                let transaction = try verified(result)
                guard productIDs.contains(transaction.productID) else { continue }
                _ = try await api.verifyStoreKitTransaction(result.jwsRepresentation)
                restored = true
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

    enum StoreError: LocalizedError {
        case failedVerification

        var errorDescription: String? {
            "The App Store transaction could not be verified on this device."
        }
    }
}
