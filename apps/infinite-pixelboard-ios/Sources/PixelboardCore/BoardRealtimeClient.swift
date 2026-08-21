import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public actor BoardRealtimeClient {
    public enum ConnectionState: Equatable, Sendable {
        case disconnected
        case connecting
        case connected
        case reconnecting(attempt: Int)
    }

    private struct NegotiationResponse: Decodable {
        let connectionToken: String?
        let connectionId: String?
    }

    private let baseURL: URL
    private let session: URLSession
    private var socket: URLSessionWebSocketTask?
    private var reconnectTask: Task<Void, Never>?
    private var stopped = true
    private var attempt = 0
    private var lastCursor: RedisStreamCursor?

    public var onPixel: (@Sendable (AcceptedPixelEvent) async -> Void)?
    public var onStateChange: (@Sendable (ConnectionState) async -> Void)?
    public var onRecoveryRequired: (@Sendable () async -> Void)?

    public init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    public func setHandlers(
        onPixel: (@Sendable (AcceptedPixelEvent) async -> Void)?,
        onStateChange: (@Sendable (ConnectionState) async -> Void)?,
        onRecoveryRequired: (@Sendable () async -> Void)?
    ) {
        self.onPixel = onPixel
        self.onStateChange = onStateChange
        self.onRecoveryRequired = onRecoveryRequired
    }

    public func start() {
        guard stopped else { return }
        stopped = false
        attempt = 0
        lastCursor = nil
        Task { await negotiateAndConnect() }
    }

    public func stop() {
        stopped = true
        reconnectTask?.cancel()
        reconnectTask = nil
        socket?.cancel(with: .goingAway, reason: nil)
        socket = nil
        notify(.disconnected)
    }

    private func negotiateAndConnect() async {
        guard !stopped else { return }
        notify(attempt == 0 ? .connecting : .reconnecting(attempt: attempt))
        do {
            var request = URLRequest(
                url: baseURL.appending(path: "api/v1/realtime/negotiate")
                    .appending(queryItems: [URLQueryItem(name: "negotiateVersion", value: "1")])
            )
            request.httpMethod = "POST"
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse,
                  (200..<300).contains(http.statusCode) else {
                throw URLError(.badServerResponse)
            }
            let negotiation = try JSONDecoder().decode(NegotiationResponse.self, from: data)
            guard let token = negotiation.connectionToken ?? negotiation.connectionId else {
                throw URLError(.cannotParseResponse)
            }
            var components = URLComponents(
                url: baseURL.appending(path: "api/v1/realtime"),
                resolvingAgainstBaseURL: false
            )!
            components.scheme = components.scheme == "https" ? "wss" : "ws"
            components.queryItems = [URLQueryItem(name: "id", value: token)]
            guard let socketURL = components.url else { throw URLError(.badURL) }
            let socket = session.webSocketTask(with: socketURL)
            self.socket = socket
            socket.resume()
            try await socket.send(.string(#"{"protocol":"json","version":1}"# + "\u{001e}"))
            didConnect()
        } catch {
            scheduleReconnect()
        }
    }

    private func didConnect() {
        attempt = 0
        notify(.connected)
        receive()
    }

    private func receive() {
        socket?.receive { [weak self] result in
            Task { await self?.handle(result) }
        }
    }

    private func handle(_ result: Result<URLSessionWebSocketTask.Message, Error>) async {
        guard !stopped else { return }
        switch result {
        case let .success(message):
            if case let .string(text) = message {
                for frame in text.split(separator: "\u{001e}") {
                    await decodeSignalRFrame(Data(frame.utf8))
                }
            }
            receive()
        case .failure:
            scheduleReconnect()
        }
    }

    private func decodeSignalRFrame(_ data: Data) async {
        struct Invocation: Decodable {
            let type: Int
            let target: String?
            let arguments: [JSONValue]?
        }

        guard let invocation = try? JSONDecoder().decode(Invocation.self, from: data),
              invocation.type == 1 else { return }

        let decoded: (row: Int, column: Int, color: String, placedAt: Date, placementId: String)?
        if invocation.target == "AcceptedPixelV1",
           case let .object(envelope)? = invocation.arguments?.first,
           case let .number(protocolVersion)? = envelope["protocolVersion"],
           protocolVersion == 1,
           case let .string(type)? = envelope["type"],
           type == "pixel.accepted",
           case let .string(cursorValue)? = envelope["cursor"],
           case let .object(eventData)? = envelope["data"],
           case let .string(placementId)? = eventData["placementId"],
           case let .object(pixel)? = eventData["pixel"],
           case let .number(row)? = pixel["row"],
           case let .number(column)? = pixel["column"],
           case let .string(color)? = pixel["color"] {
           guard let cursor = RedisStreamCursor(cursorValue) else {
               await notifyRecovery()
               return
           }
           if let lastCursor, cursor <= lastCursor {
               await notifyRecovery()
               return
           }
           guard case let .string(placedAtValue)? = pixel["placedAt"],
                 let placedAt = Self.decodeDate(placedAtValue) else {
               await notifyRecovery()
               return
           }
           lastCursor = cursor
           decoded = (Int(row), Int(column), color, placedAt, placementId)
        } else if invocation.target == "UpdateBoard",
                  let arguments = invocation.arguments,
                  arguments.count >= 3,
                  case let .number(row) = arguments[0],
                  case let .number(column) = arguments[1],
                  case let .string(color) = arguments[2] {
            decoded = (Int(row), Int(column), color, Date(), "")
        } else {
            decoded = nil
        }
        guard let decoded else { return }
        let event = AcceptedPixelEvent(
            type: "pixel.accepted",
            placementId: decoded.placementId,
            pixel: PixelState(
                row: decoded.row,
                column: decoded.column,
                color: decoded.color,
                placedAt: decoded.placedAt
            )
        )
        await onPixel?(event)
    }

    private static func decodeDate(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }

    private func notifyRecovery() async {
        await onRecoveryRequired?()
    }

    private func scheduleReconnect() {
        guard !stopped, reconnectTask == nil else { return }
        socket = nil
        attempt += 1
        let delay = min(pow(2.0, Double(attempt - 1)), 30)
        notify(.reconnecting(attempt: attempt))
        reconnectTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(delay))
            guard !Task.isCancelled else { return }
            await self?.resumeReconnect()
        }
    }

    private func resumeReconnect() {
        reconnectTask = nil
        Task { await negotiateAndConnect() }
    }

    private func notify(_ state: ConnectionState) {
        Task { await onStateChange?(state) }
    }
}

struct RedisStreamCursor: Comparable {
    let milliseconds: UInt64
    let sequence: UInt64

    init?(_ value: String) {
        let components = value.split(separator: "-", omittingEmptySubsequences: false)
        guard components.count == 2,
              let milliseconds = UInt64(components[0]),
              let sequence = UInt64(components[1]) else {
            return nil
        }
        self.milliseconds = milliseconds
        self.sequence = sequence
    }

    static func < (lhs: RedisStreamCursor, rhs: RedisStreamCursor) -> Bool {
        if lhs.milliseconds != rhs.milliseconds {
            return lhs.milliseconds < rhs.milliseconds
        }
        return lhs.sequence < rhs.sequence
    }
}

private enum JSONValue: Decodable {
    case string(String)
    case number(Double)
    case object([String: JSONValue])
    case array([JSONValue])
    case bool(Bool)
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode([String: JSONValue].self) {
            self = .object(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else {
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Unsupported SignalR JSON value."
            )
        }
    }
}
