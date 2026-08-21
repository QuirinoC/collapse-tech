import AuthenticationServices
import CryptoKit
import Foundation
import PixelboardCore
import Security
import UIKit

#if canImport(FirebaseAuth) && canImport(FirebaseCore) && canImport(GoogleSignIn)
import FirebaseAuth
import FirebaseCore
import GoogleSignIn

@MainActor
final class FirebaseAuthAdapter: NSObject, AuthenticationSession, @unchecked Sendable {
    private var appleAuthorization: AppleAuthorizationCoordinator?
    private var isAuthorizing = false

    var isAuthenticated: Bool {
        FirebaseApp.app() != nil && Auth.auth().currentUser != nil
    }

    func idToken() async throws -> String? {
        guard FirebaseApp.app() != nil else { return nil }
        return try await Auth.auth().currentUser?.getIDToken()
    }

    func signIn(with provider: AuthenticationProvider) async throws {
        guard FirebaseApp.app() != nil else {
            throw AuthenticationError.providerNotConfigured
        }
        guard !isAuthorizing else { throw ProviderSignInError.signInInProgress }
        isAuthorizing = true
        defer { isAuthorizing = false }
        switch provider {
        case .apple:
            let credential = try await appleCredential()
            _ = try await Auth.auth().signIn(with: credential)
        case .google:
            let credential = try await googleCredential()
            _ = try await Auth.auth().signIn(with: credential)
        }
    }

    func prepareForAccountDeletion() async throws {
        guard FirebaseApp.app() != nil, let user = Auth.auth().currentUser else {
            throw AuthenticationError.authenticationRequired
        }
        guard !isAuthorizing else { throw ProviderSignInError.signInInProgress }
        isAuthorizing = true
        defer { isAuthorizing = false }
        let providerIDs = Set(user.providerData.map(\.providerID))
        let credential: AuthCredential
        if providerIDs.contains("google.com") {
            credential = try await googleCredential()
        } else if providerIDs.contains("apple.com") {
            credential = try await appleCredential()
        } else {
            throw AuthenticationError.reauthenticationUnavailable
        }
        _ = try await user.reauthenticate(with: credential)
    }

    func signOut() throws {
        guard FirebaseApp.app() != nil else {
            throw AuthenticationError.providerNotConfigured
        }
        GIDSignIn.sharedInstance.signOut()
        try Auth.auth().signOut()
    }

    func deleteAccount() async throws {
        guard FirebaseApp.app() != nil, let user = Auth.auth().currentUser else {
            throw AuthenticationError.authenticationRequired
        }
        try await user.delete()
    }

    private func googleCredential() async throws -> AuthCredential {
        guard let options = FirebaseApp.app()?.options,
              let clientID = options.clientID,
              let reversedClientID = options.reversedClientID,
              Self.registeredURLSchemes.contains(reversedClientID) else {
            throw AuthenticationError.providerNotConfigured
        }
        GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)
        let presenter = try presentingViewController()
        let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presenter)
        guard let idToken = result.user.idToken?.tokenString else {
            throw ProviderSignInError.missingGoogleIDToken
        }
        return GoogleAuthProvider.credential(
            withIDToken: idToken,
            accessToken: result.user.accessToken.tokenString
        )
    }

    private func appleCredential() async throws -> AuthCredential {
        let nonce = try Self.randomNonce()
        let coordinator = AppleAuthorizationCoordinator(
            anchor: try presentationAnchor(),
            hashedNonce: Self.sha256(nonce)
        )
        appleAuthorization = coordinator
        defer {
            if appleAuthorization === coordinator {
                appleAuthorization = nil
            }
        }
        let appleCredential = try await coordinator.authorize()
        guard let identityToken = appleCredential.identityToken,
              let idToken = String(data: identityToken, encoding: .utf8) else {
            throw ProviderSignInError.missingAppleIDToken
        }
        return OAuthProvider.appleCredential(
            withIDToken: idToken,
            rawNonce: nonce,
            fullName: appleCredential.fullName
        )
    }

    private func presentingViewController() throws -> UIViewController {
        guard let scene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first(where: { $0.activationState == .foregroundActive }),
              var presenter = scene.windows.first(where: \.isKeyWindow)?.rootViewController else {
            throw ProviderSignInError.presentationUnavailable
        }
        while let presented = presenter.presentedViewController {
            presenter = presented
        }
        return presenter
    }

    private func presentationAnchor() throws -> ASPresentationAnchor {
        guard let scene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first(where: { $0.activationState == .foregroundActive }),
              let window = scene.windows.first(where: \.isKeyWindow) else {
            throw ProviderSignInError.presentationUnavailable
        }
        return window
    }

    private static func sha256(_ value: String) -> String {
        SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    private static var registeredURLSchemes: Set<String> {
        let urlTypes = Bundle.main.object(forInfoDictionaryKey: "CFBundleURLTypes")
            as? [[String: Any]] ?? []
        return Set(urlTypes.flatMap { $0["CFBundleURLSchemes"] as? [String] ?? [] })
    }

    private static func randomNonce(length: Int = 32) throws -> String {
        precondition(length > 0)
        let characters = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var result = ""
        while result.count < length {
            var random: UInt8 = 0
            guard SecRandomCopyBytes(kSecRandomDefault, 1, &random) == errSecSuccess else {
                throw ProviderSignInError.nonceGenerationFailed
            }
            if Int(random) < characters.count {
                result.append(characters[Int(random)])
            }
        }
        return result
    }
}

@MainActor
private final class AppleAuthorizationCoordinator: NSObject,
    ASAuthorizationControllerDelegate,
    ASAuthorizationControllerPresentationContextProviding {
    private let anchor: ASPresentationAnchor
    private let hashedNonce: String
    private var continuation: CheckedContinuation<ASAuthorizationAppleIDCredential, Error>?

    init(anchor: ASPresentationAnchor, hashedNonce: String) {
        self.anchor = anchor
        self.hashedNonce = hashedNonce
    }

    func authorize() async throws -> ASAuthorizationAppleIDCredential {
        try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = [.fullName, .email]
            request.nonce = hashedNonce
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        anchor
    }

    func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else {
            finish(throwing: ProviderSignInError.invalidAppleCredential)
            return
        }
        continuation?.resume(returning: credential)
        continuation = nil
    }

    func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithError error: Error
    ) {
        finish(throwing: error)
    }

    private func finish(throwing error: Error) {
        continuation?.resume(throwing: error)
        continuation = nil
    }
}

private enum ProviderSignInError: LocalizedError {
    case invalidAppleCredential
    case missingAppleIDToken
    case missingGoogleIDToken
    case nonceGenerationFailed
    case presentationUnavailable
    case signInInProgress

    var errorDescription: String? {
        switch self {
        case .invalidAppleCredential:
            return "Apple returned an unsupported sign-in credential."
        case .missingAppleIDToken:
            return "Apple did not return an identity token."
        case .missingGoogleIDToken:
            return "Google did not return an identity token."
        case .nonceGenerationFailed:
            return "A secure sign-in nonce could not be generated."
        case .presentationUnavailable:
            return "A sign-in window is not available."
        case .signInInProgress:
            return "Another sign-in request is already in progress."
        }
    }
}

#else

typealias FirebaseAuthAdapter = SignedOutAuthenticationSession

#endif
