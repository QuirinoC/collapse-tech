import Foundation

public actor PlacementCoordinator {
    public enum State: Equatable, Sendable {
        case idle
        case submitting(PlacementRequest)
        case cooldown(until: Date)
    }

    private let api: PixelboardAPIClient
    private let clientContext: ClientContext
    public private(set) var state: State = .idle

    public init(api: PixelboardAPIClient, appVersion: String) {
        self.api = api
        clientContext = ClientContext(appVersion: appVersion)
    }

    public func place(row: Int, column: Int, color: String, now: Date = Date()) async throws -> PlacementResult {
        if case let .cooldown(until) = state, until > now {
            throw APIErrorPayload(code: "cooldown_active", message: "Wait for the placement cooldown to finish.")
        }
        if case .submitting = state {
            throw APIErrorPayload(code: "duplicate_request", message: "A placement is already in progress.")
        }

        let command = PlacementRequest(
            row: row,
            column: column,
            color: color.uppercased(),
            idempotencyKey: UUID().uuidString.lowercased(),
            client: clientContext
        )
        state = .submitting(command)
        do {
            let result = try await api.place(command)
            state = result.cooldown.nextPlacementAt.map(State.cooldown) ?? .idle
            return result
        } catch {
            state = .idle
            throw error
        }
    }
}
