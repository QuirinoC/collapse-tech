import Foundation

public enum AuthenticationProvider: String, Sendable {
    case apple
    case google
}

public protocol AuthenticationSession: Sendable {
    var isAuthenticated: Bool { get async }
    func idToken() async throws -> String?
    func signIn(with provider: AuthenticationProvider) async throws
    func prepareForAccountDeletion() async throws
    func signOut() async throws
    func deleteAccount() async throws
}

public actor SignedOutAuthenticationSession: AuthenticationSession {
    public init() {}
    public var isAuthenticated: Bool { false }
    public func idToken() -> String? { nil }
    public func signIn(with provider: AuthenticationProvider) throws {
        throw AuthenticationError.providerNotConfigured
    }
    public func prepareForAccountDeletion() throws {
        throw AuthenticationError.authenticationRequired
    }
    public func signOut() {}
    public func deleteAccount() throws {
        throw AuthenticationError.authenticationRequired
    }
}

public enum AuthenticationError: LocalizedError {
    case providerNotConfigured
    case authenticationRequired
    case reauthenticationUnavailable

    public var errorDescription: String? {
        switch self {
        case .providerNotConfigured:
            return "Firebase sign-in is not configured for this build."
        case .authenticationRequired:
            return "Sign in before deleting your account."
        case .reauthenticationUnavailable:
            return "Sign in again with Apple or Google before deleting this account."
        }
    }
}
