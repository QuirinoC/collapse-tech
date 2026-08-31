import Foundation
import TrustCore
import UIKit

struct SessionPayload: Decodable {
    var token: String
    var you: PersonDTO
}

struct PersonDTO: Decodable {
    var id: UUID
    var displayName: String
    var hasCircle: Bool
    var onboardingComplete: Bool?
    var phoneVerified: Bool?
}

struct SendPhoneCodePayload: Decodable {
    var expiresAt: Date
    var resendAfterSeconds: Int
    var developmentCode: String?
}

struct PresenceDTO: Decodable {
    var lastActiveAt: Date
    var batteryPercent: Int
    var isCharging: Bool
    var gotHomeAt: Date?
    var checkedInAt: Date?
}

struct LocationDTO: Decodable {
    var timestamp: Date
    var latitude: Double
    var longitude: Double
}

struct ShareDTO: Decodable {
    var resting: String
    var timedUntil: Date?
    var presentation: String
    var timedEnds: Date?
    var revertsTo: String?
}

struct MemberDTO: Decodable {
    var person: PersonDTO
    var presence: PresenceDTO
    var share: ShareDTO
    var inboundLive: Bool
    var live: LocationDTO?
}

struct CoverageDTO: Decodable {
    var isCovered: Bool
    var sponsorName: String?
    var actingIsSponsor: Bool
    var seatLimit: Int
    var lookLogDays: Int
    var hasPlacePings: Bool
    var canExtendHistory: Bool
    var canExportLookLog: Bool
    var banner: String?
}

struct LookEventDTO: Decodable {
    var id: UUID
    var viewerId: UUID
    var viewerName: String
    var subjectId: UUID
    var subjectName: String
    var at: Date
    var historyWindowHours: Int
    var includedLive: Bool
}

struct LookSessionDTO: Decodable {
    var event: LookEventDTO
    var live: LocationDTO
    var trail: [LocationDTO]
}

struct CirclePayload: Decodable {
    var you: PersonDTO
    var members: [MemberDTO]
    var coverage: CoverageDTO
    var pendingInviteCode: String?
    var activeSession: LookSessionDTO?
    var beingWatched: LookEventDTO?
    var lookLog: [LookEventDTO]
    var retainedLookLogCount: Int
    var allowsDevelopmentSignIn: Bool
    var allowsReviewUnlock: Bool?
}

struct InvitePayload: Decodable {
    var code: String
}

struct APIErrorPayload: Decodable {
    var code: String?
    var message: String?
}

struct CircleSnapshot {
    var you: Person
    var members: [TrustedPerson]
    var coverage: CircleCoverage
    var pendingInviteCode: String?
    var activeSession: LookSession?
    var beingWatched: LookEvent?
    var lookLog: [LookEvent]
    var retainedLookLogCount: Int
    var allowsDevelopmentSignIn: Bool
    var allowsReviewUnlock: Bool
}

enum TrustClientError: LocalizedError {
    case unauthorized
    case unreachable
    case timeout
    case serverUnavailable(Int)
    case server(String)
    case decoding

    var errorDescription: String? {
        switch self {
        case .unauthorized:
            return "Sign in expired. Please sign in again."
        case .unreachable:
            #if DEBUG
            return "Trust Circle cannot reach \(AppConfiguration.apiHostDescription). Start the API or wait until production is deployed."
            #else
            return "Trust Circle cannot reach the server. Check your connection."
            #endif
        case .timeout:
            #if DEBUG
            return "Sign-in timed out talking to \(AppConfiguration.apiHostDescription)."
            #else
            return "Sign-in timed out. Try again."
            #endif
        case .serverUnavailable(let status):
            #if DEBUG
            return "Trust Circle's server is unavailable (\(status)) at \(AppConfiguration.apiHostDescription)."
            #else
            return "Trust Circle's server is temporarily unavailable. Try again shortly."
            #endif
        case .server(let message):
            return message
        case .decoding:
            return "The server sent a response this app could not read."
        }
    }
}

@MainActor
final class TrustClient {
    var token: String?
    var snapshot: CircleSnapshot?
    private(set) var resolvedBaseURL: URL = AppConfiguration.apiBaseURL
    private(set) var reachabilityNotice: String?

    private let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.waitsForConnectivity = false
        config.timeoutIntervalForRequest = AppConfiguration.requestTimeout
        config.timeoutIntervalForResource = AppConfiguration.requestTimeout + 5
        return URLSession(configuration: config)
    }()

    func prepare() async {
        let preferred = AppConfiguration.apiBaseURL
        #if DEBUG
        if let live = await AppConfiguration.firstReachableAPI(preferred: preferred) {
            resolvedBaseURL = live
            reachabilityNotice = nil
            return
        }
        resolvedBaseURL = preferred
        reachabilityNotice = "Trust Circle cannot reach \(preferred.host ?? preferred.absoluteString). Start the API on port 5088, or deploy production."
        #else
        resolvedBaseURL = preferred
        reachabilityNotice = nil
        #endif
    }

    func appleSession(identityToken: String, displayName: String?) async throws -> SessionPayload {
        struct Body: Encodable {
            var identityToken: String
            var displayName: String
        }
        let payload: SessionPayload = try await post(
            path: "/api/v1/session/apple",
            body: Body(identityToken: identityToken, displayName: displayName ?? "You"),
            authorized: false
        )
        token = payload.token
        return payload
    }

    func googleSession(idToken: String?, displayName: String?) async throws {
        struct Body: Encodable {
            var idToken: String?
            var displayName: String
            var provider: String
            var deviceId: String
        }
        let payload: SessionPayload = try await post(
            path: "/api/v1/session/google",
            body: Body(
                idToken: idToken,
                displayName: displayName ?? "You",
                provider: "google",
                deviceId: UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString
            ),
            authorized: false
        )
        token = payload.token
    }

    func refreshCircle() async throws -> CircleSnapshot {
        let payload: CirclePayload = try await get(path: "/api/v1/circle")
        let snapshot = payload.snapshot
        self.snapshot = snapshot
        return snapshot
    }

    func ingest(_ point: LocationPoint, battery: Int?, charging: Bool?) async throws {
        try await ingest(points: [point], battery: battery, charging: charging)
    }

    func ingest(points: [LocationPoint], battery: Int?, charging: Bool?) async throws {
        guard let last = points.last else { return }
        struct Point: Encodable {
            var timestamp: Date
            var latitude: Double
            var longitude: Double
        }
        struct Body: Encodable {
            var timestamp: Date
            var latitude: Double
            var longitude: Double
            var batteryPercent: Int?
            var isCharging: Bool?
            var points: [Point]
        }
        try await postEmpty(
            path: "/api/v1/location",
            body: Body(
                timestamp: last.timestamp,
                latitude: last.latitude,
                longitude: last.longitude,
                batteryPercent: battery,
                isCharging: charging,
                points: points.map { Point(timestamp: $0.timestamp, latitude: $0.latitude, longitude: $0.longitude) }
            )
        )
    }

    func look(subjectID: UUID, confirmed: Bool) async throws -> LookSession {
        struct Body: Encodable {
            var subjectId: UUID
            var confirmed: Bool
        }
        let payload: LookSessionDTO = try await post(
            path: "/api/v1/looks",
            body: Body(subjectId: subjectID, confirmed: confirmed),
            authorized: true
        )
        return payload.model
    }

    func closeLook(subjectID: UUID?) async throws {
        var path = "/api/v1/looks/close"
        if let subjectID {
            path += "?subjectId=\(subjectID.uuidString)"
        }
        try await postEmpty(path: path, body: EmptyBody())
    }

    func extendLook(subjectID: UUID) async throws -> LookSession {
        let payload: LookSessionDTO = try await post(
            path: "/api/v1/looks/\(subjectID.uuidString)/extend",
            body: EmptyBody(),
            authorized: true
        )
        return payload.model
    }

    func setShare(personID: UUID, resting: String?, timed: String?) async throws {
        struct Body: Encodable {
            var resting: String?
            var timed: String?
        }
        try await patchEmpty(path: "/api/v1/people/\(personID.uuidString)/share", body: Body(resting: resting, timed: timed))
    }

    func createInvite() async throws -> String {
        let payload: InvitePayload = try await post(path: "/api/v1/invites", body: EmptyBody(), authorized: true)
        return payload.code
    }

    func acceptInvite(code: String) async throws {
        struct Body: Encodable { var code: String }
        try await postEmpty(path: "/api/v1/invites/accept", body: Body(code: code))
    }

    func checkIn() async throws {
        try await postEmpty(path: "/api/v1/presence/check-in", body: EmptyBody())
    }

    func placePing() async throws {
        try await postEmpty(path: "/api/v1/presence/place-ping", body: EmptyBody())
    }

    func revoke(personID: UUID) async throws {
        try await postEmpty(path: "/api/v1/people/\(personID.uuidString)/revoke", body: EmptyBody())
    }

    func grantCircle(reviewUnlock: Bool, productID: String?, signedTransactionInfo: String?) async throws {
        struct Body: Encodable {
            var productId: String?
            var reviewUnlock: Bool
            var signedTransactionInfo: String?
        }
        try await postEmpty(
            path: "/api/v1/circle/entitlement",
            body: Body(productId: productID, reviewUnlock: reviewUnlock, signedTransactionInfo: signedTransactionInfo)
        )
    }

    func storeKitAccountToken() async throws -> UUID {
        struct Payload: Decodable { var appAccountToken: UUID }
        let payload: Payload = try await get(path: "/api/v1/storekit/account-token")
        return payload.appAccountToken
    }

    func verifyStoreKitTransaction(_ signedTransactionInfo: String) async throws {
        struct Body: Encodable { var signedTransactionInfo: String }
        try await postEmpty(
            path: "/api/v1/storekit/transactions",
            body: Body(signedTransactionInfo: signedTransactionInfo)
        )
    }

    func registerPushDevice(installationId: UUID, token: String, environment: String) async throws {
        struct Body: Encodable {
            var installationId: UUID
            var token: String
            var environment: String
            var bundleId: String
        }
        try await postEmpty(
            path: "/api/v1/push/devices",
            body: Body(
                installationId: installationId,
                token: token,
                environment: environment,
                bundleId: AppConfiguration.bundleIdentifier
            )
        )
    }

    func removePushDevice(installationId: UUID) async throws {
        try await deleteEmpty(path: "/api/v1/push/devices/\(installationId.uuidString)")
    }

    func deleteAccount() async throws {
        try await deleteEmpty(path: "/api/v1/account")
    }

    func rename(_ name: String) async throws {
        struct Body: Encodable { var displayName: String }
        try await patchEmpty(path: "/api/v1/me", body: Body(displayName: name))
    }

    func sendPhoneCode(phone: String) async throws -> SendPhoneCodePayload {
        struct Body: Encodable { var phone: String }
        return try await post(
            path: "/api/v1/me/phone/send",
            body: Body(phone: phone),
            authorized: true
        )
    }

    func verifyPhoneCode(phone: String, code: String) async throws {
        struct Body: Encodable {
            var phone: String
            var code: String
        }
        try await postEmpty(path: "/api/v1/me/phone/verify", body: Body(phone: phone, code: code))
    }

    private func get<T: Decodable>(path: String) async throws -> T {
        var request = try makeRequest(path: path, method: "GET", authorized: true)
        return try await send(request)
    }

    private func post<T: Decodable, B: Encodable>(path: String, body: B, authorized: Bool) async throws -> T {
        var request = try makeRequest(path: path, method: "POST", authorized: authorized)
        if !(body is EmptyBody) {
            request.httpBody = try encoder.encode(body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return try await send(request)
    }

    private func postEmpty<B: Encodable>(path: String, body: B) async throws {
        var request = try makeRequest(path: path, method: "POST", authorized: true)
        if !(body is EmptyBody) {
            request.httpBody = try encoder.encode(body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let _: EmptyPayload = try await send(request, allowEmpty: true)
    }

    private func patchEmpty<B: Encodable>(path: String, body: B) async throws {
        var request = try makeRequest(path: path, method: "PATCH", authorized: true)
        request.httpBody = try encoder.encode(body)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let _: EmptyPayload = try await send(request, allowEmpty: true)
    }

    private func deleteEmpty(path: String) async throws {
        var request = try makeRequest(path: path, method: "DELETE", authorized: true)
        let _: EmptyPayload = try await send(request, allowEmpty: true)
    }

    private func makeRequest(path: String, method: String, authorized: Bool) throws -> URLRequest {
        guard let url = URL(string: path, relativeTo: resolvedBaseURL)?.absoluteURL else {
            throw TrustClientError.unreachable
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = AppConfiguration.requestTimeout
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if authorized {
            guard let token, !token.isEmpty else { throw TrustClientError.unauthorized }
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    private func send<T: Decodable>(_ request: URLRequest, allowEmpty: Bool = false) async throws -> T {
        let data: Data
        let response: URLResponse
        do {
            let session = self.session
            (data, response) = try await withThrowingTaskGroup(of: (Data, URLResponse).self) { group in
                group.addTask {
                    try await session.data(for: request)
                }
                group.addTask {
                    try await Task.sleep(for: .seconds(AppConfiguration.requestTimeout + 2))
                    throw TrustClientError.timeout
                }
                guard let result = try await group.next() else { throw TrustClientError.timeout }
                group.cancelAll()
                return result
            }
        } catch let error as TrustClientError {
            throw error
        } catch let error as URLError where error.code == .timedOut {
            throw TrustClientError.timeout
        } catch is CancellationError {
            throw TrustClientError.timeout
        } catch {
            throw TrustClientError.unreachable
        }
        guard let http = response as? HTTPURLResponse else { throw TrustClientError.unreachable }
        if [502, 503, 504].contains(http.statusCode) {
            throw TrustClientError.serverUnavailable(http.statusCode)
        }
        if http.statusCode == 401 {
            if let error = try? decoder.decode(APIErrorPayload.self, from: data) {
                let message = error.message?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                if !message.isEmpty {
                    throw TrustClientError.server(message)
                }
            }
            throw TrustClientError.unauthorized
        }
        if (200..<300).contains(http.statusCode) {
            if allowEmpty && (data.isEmpty || T.self == EmptyPayload.self) {
                if let empty = EmptyPayload() as? T { return empty }
            }
            if data.isEmpty, let empty = EmptyPayload() as? T { return empty }
            do {
                return try decoder.decode(T.self, from: data)
            } catch {
                throw TrustClientError.decoding
            }
        }
        if let error = try? decoder.decode(APIErrorPayload.self, from: data) {
            throw TrustClientError.server(error.message ?? error.code ?? "Request failed.")
        }
        throw TrustClientError.server("Request failed (\(http.statusCode)).")
    }

    private var decoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let raw = try decoder.singleValueContainer().decode(String.self)
            if let date = TrustJSON.date(from: raw) { return date }
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: raw))
        }
        return decoder
    }

    private var encoder: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .custom { date, encoder in
            var container = encoder.singleValueContainer()
            try container.encode(TrustJSON.string(from: date))
        }
        return encoder
    }
}

private struct EmptyPayload: Decodable {}
private struct EmptyBody: Encodable {}

private enum TrustJSON {
    static func date(from raw: String) -> Date? {
        if let date = iso.date(from: raw) { return date }
        isoFractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return isoFractional.date(from: raw)
    }

    static func string(from date: Date) -> String {
        iso.string(from: date)
    }

    private static let iso: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    private static let isoFractional = ISO8601DateFormatter()
}

extension CirclePayload {
    var snapshot: CircleSnapshot {
        CircleSnapshot(
            you: you.model,
            members: members.map(\.model),
            coverage: CircleCoverage(
                isCovered: coverage.isCovered,
                sponsorName: coverage.sponsorName,
                actingIsSponsor: coverage.actingIsSponsor
            ),
            pendingInviteCode: pendingInviteCode,
            activeSession: activeSession?.model,
            beingWatched: beingWatched?.model,
            lookLog: lookLog.map(\.model),
            retainedLookLogCount: retainedLookLogCount,
            allowsDevelopmentSignIn: allowsDevelopmentSignIn,
            allowsReviewUnlock: allowsReviewUnlock ?? false
        )
    }
}

extension PersonDTO {
    var model: Person {
        Person(
            id: id,
            displayName: displayName,
            hasPro: hasCircle,
            onboardingComplete: onboardingComplete ?? true,
            phoneVerified: phoneVerified ?? false
        )
    }
}

extension PresenceDTO {
    var model: PresenceSnapshot {
        PresenceSnapshot(
            lastActiveAt: lastActiveAt,
            batteryPercent: batteryPercent,
            isCharging: isCharging,
            gotHomeAt: gotHomeAt,
            checkedInAt: checkedInAt
        )
    }
}

extension LocationDTO {
    var model: LocationPoint {
        LocationPoint(timestamp: timestamp, latitude: latitude, longitude: longitude)
    }
}

extension ShareDTO {
    var model: PersonShareState {
        let resting: ShareRestingMode = resting == "always" ? .always : .untilTheyLook
        return PersonShareState(resting: resting, timedUntil: timedEnds ?? timedUntil)
    }
}

extension MemberDTO {
    var model: TrustedPerson {
        TrustedPerson(
            person: person.model,
            presence: presence.model,
            share: share.model,
            inboundLive: inboundLive,
            livePoint: inboundLive ? live?.model : nil
        )
    }
}

extension LookEventDTO {
    var model: LookEvent {
        LookEvent(
            id: id,
            viewerID: viewerId,
            viewerName: viewerName,
            subjectID: subjectId,
            subjectName: subjectName,
            at: at,
            historyWindowHours: historyWindowHours,
            includedLive: includedLive
        )
    }
}

extension LookSessionDTO {
    var model: LookSession {
        LookSession(id: event.id, event: event.model, live: live.model, trail: trail.map(\.model))
    }
}
