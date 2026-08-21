import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public enum APIClientError: LocalizedError {
    case invalidResponse
    case server(status: Int, payload: APIErrorPayload?)
    case placement(status: Int, result: PlacementResult)

    public var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "The board returned an invalid response."
        case let .server(status, payload):
            return payload?.message ?? "The board request failed with status \(status)."
        case let .placement(_, result):
            return result.error?.message ?? "The pixel placement was rejected."
        }
    }
}

public struct PixelboardAPIClient: Sendable {
    public let baseURL: URL
    public let authentication: any AuthenticationSession
    private let session: URLSession
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    public init(
        baseURL: URL,
        authentication: any AuthenticationSession,
        session: URLSession = .shared
    ) {
        self.baseURL = baseURL
        self.authentication = authentication
        self.session = session
        encoder = JSONEncoder()
        decoder = JSONDecoder()
        encoder.dateEncodingStrategy = .iso8601
        decoder.dateDecodingStrategy = .iso8601
    }

    public func metadata() async throws -> BoardMetadata {
        try await request("board")
    }

    public func tile(_ address: TileAddress) async throws -> TileSnapshot {
        try await request("tiles/\(address.row)/\(address.column)")
    }

    public func account() async throws -> AccountState {
        try await request("account", authorized: true)
    }

    public func acceptCommunityStandards() async throws {
        try await requestWithoutResponse(
            "account/community-standards",
            method: "POST",
            authorized: true
        )
    }

    public func place(_ command: PlacementRequest) async throws -> PlacementResult {
        try await request("placements", method: "POST", body: command, authorized: true)
    }

    public func report(_ report: CreateReportRequest) async throws -> ReportResponse {
        try await request("reports", method: "POST", body: report, authorized: true)
    }

    public func storeKitAccountToken() async throws -> UUID {
        let response: StoreKitAccountTokenResponse = try await request(
            "storekit/account-token",
            authorized: true
        )
        return response.appAccountToken
    }

    public func verifyStoreKitTransaction(_ signedTransactionInfo: String) async throws -> StoreKitEntitlement {
        try await request(
            "storekit/transactions",
            method: "POST",
            body: VerifyStoreKitTransactionRequest(signedTransactionInfo: signedTransactionInfo),
            authorized: true
        )
    }

    private func request<Response: Decodable>(
        _ path: String,
        method: String = "GET",
        authorized: Bool = false
    ) async throws -> Response {
        try await perform(path, method: method, body: Optional<EmptyResponse>.none, authorized: authorized)
    }

    private func requestWithoutResponse(
        _ path: String,
        method: String,
        authorized: Bool
    ) async throws {
        let _: EmptyResponse = try await perform(
            path,
            method: method,
            body: Optional<EmptyResponse>.none,
            authorized: authorized
        )
    }

    private func request<Body: Encodable, Response: Decodable>(
        _ path: String,
        method: String,
        body: Body,
        authorized: Bool
    ) async throws -> Response {
        try await perform(path, method: method, body: body, authorized: authorized)
    }

    private func perform<Body: Encodable, Response: Decodable>(
        _ path: String,
        method: String,
        body: Body?,
        authorized: Bool
    ) async throws -> Response {
        var request = URLRequest(url: baseURL.appending(path: "api/v1/\(path)"))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.httpBody = try encoder.encode(body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if authorized {
            guard let token = try await authentication.idToken() else {
                throw APIClientError.server(
                    status: 401,
                    payload: APIErrorPayload(code: "authentication_required", message: "Sign in to continue.")
                )
            }
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIClientError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            if path == "placements",
               let result = try? decoder.decode(PlacementResult.self, from: data) {
                throw APIClientError.placement(status: http.statusCode, result: result)
            }
            throw APIClientError.server(
                status: http.statusCode,
                payload: try? decoder.decode(APIErrorPayload.self, from: data)
            )
        }
        let responseData = data.isEmpty ? Data("{}".utf8) : data
        return try decoder.decode(Response.self, from: responseData)
    }
}

private struct EmptyResponse: Codable {
    init() {}

    init(from decoder: Decoder) throws {}
}
