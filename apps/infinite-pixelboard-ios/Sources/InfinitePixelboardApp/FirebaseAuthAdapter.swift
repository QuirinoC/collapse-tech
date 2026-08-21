import Foundation
import PixelboardCore

#if canImport(FirebaseAuth)
import FirebaseAuth

actor FirebaseAuthAdapter: AuthenticationSession {
    var isAuthenticated: Bool { Auth.auth().currentUser != nil }

    func idToken() async throws -> String? {
        try await Auth.auth().currentUser?.getIDToken()
    }

    func signIn(with provider: AuthenticationProvider) async throws {
        // The release app injects the Apple/Google credential acquired by its provider SDK.
        throw AuthenticationError.providerNotConfigured
    }

    func signOut() throws {
        try Auth.auth().signOut()
    }

    func deleteAccount() async throws {
        guard let user = Auth.auth().currentUser else {
            throw AuthenticationError.authenticationRequired
        }
        try await user.delete()
    }
}

#else

typealias FirebaseAuthAdapter = SignedOutAuthenticationSession

#endif
