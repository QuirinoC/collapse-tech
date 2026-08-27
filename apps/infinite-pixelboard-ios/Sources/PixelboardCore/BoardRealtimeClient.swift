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
    private var connectTask: Task<Void, Never>?
    private var reconnectTask: Task<Void, Never>?
    private var handshakeTask: Task<Void, Never>?
    private var stateNotificationTask: Task<Void, Never>?
    private var connectedNotificationTask: Task<Void, Never>?
    private var receivingSocket: URLSessionWebSocketTask?
    private var handshakePending = false
    private var frameBuffer = SignalRFrameBuffer()
    private var stopped = true
    private var connectionGeneration: UInt64 = 0
    private var attempt = 0
    private var lastCursor: RedisStreamCursor?
    private var lastNotifiedState: ConnectionState?

    public var onPixel: (@Sendable (AcceptedPixelEvent) async -> Void)?
    public var onStateChange: (@Sendable (ConnectionState) async -> Void)?
    public var onRecoveryRequired: (@Sendable () async -> Void)?

    public init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    deinit {
        connectTask?.cancel()
        reconnectTask?.cancel()
        handshakeTask?.cancel()
        stateNotificationTask?.cancel()
        connectedNotificationTask?.cancel()
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
        stateNotificationTask?.cancel()
        stateNotificationTask = nil
        connectedNotificationTask?.cancel()
        connectedNotificationTask = nil
        stopped = false
        connectionGeneration &+= 1
        attempt = 0
        lastCursor = nil
        lastNotifiedState = nil
        startConnection()
    }

    public func stop() {
        stopped = true
        connectionGeneration &+= 1
        let generation = connectionGeneration
        connectTask?.cancel()
        connectTask = nil
        reconnectTask?.cancel()
        reconnectTask = nil
        handshakeTask?.cancel()
        handshakeTask = nil
        connectedNotificationTask?.cancel()
        connectedNotificationTask = nil
        receivingSocket = nil
        handshakePending = false
        frameBuffer.reset()
        socket?.cancel(with: .goingAway, reason: nil)
        socket = nil
        stateNotificationTask = Task { [weak self] in
            await self?.notify(.disconnected, generation: generation)
        }
    }

    private func startConnection() {
        guard !stopped, connectTask == nil else { return }
        let generation = connectionGeneration
        connectTask = Task { [weak self] in
            await self?.negotiateAndConnect(generation: generation)
        }
    }

    private func negotiateAndConnect(generation: UInt64) async {
        defer {
            if generation == connectionGeneration {
                connectTask = nil
            }
        }
        guard !stopped, generation == connectionGeneration else { return }
        await notify(
            attempt == 0 ? .connecting : .reconnecting(attempt: attempt),
            generation: generation
        )
        guard !stopped, generation == connectionGeneration else { return }

        var createdSocket: URLSessionWebSocketTask?
        do {
            var request = URLRequest(
                url: baseURL.appending(path: "api/v1/realtime/negotiate")
                    .appending(queryItems: [URLQueryItem(name: "negotiateVersion", value: "1")])
            )
            request.httpMethod = "POST"
            let (data, response) = try await session.data(for: request)
            try Task.checkCancellation()
            guard !stopped, generation == connectionGeneration else { return }
            guard let http = response as? HTTPURLResponse,
                  (200..<300).contains(http.statusCode) else {
                throw URLError(.badServerResponse)
            }
            let negotiation = try JSONDecoder().decode(NegotiationResponse.self, from: data)
            guard let token = negotiation.connectionToken ?? negotiation.connectionId else {
                throw URLError(.cannotParseResponse)
            }
            guard var components = URLComponents(
                url: baseURL.appending(path: "api/v1/realtime"),
                resolvingAgainstBaseURL: false
            ) else {
                throw URLError(.badURL)
            }
            components.scheme = components.scheme == "https" ? "wss" : "ws"
            components.queryItems = [URLQueryItem(name: "id", value: token)]
            guard let socketURL = components.url else { throw URLError(.badURL) }

            let socket = session.webSocketTask(with: socketURL)
            createdSocket = socket
            guard !stopped, generation == connectionGeneration else {
                socket.cancel(with: .goingAway, reason: nil)
                return
            }
            self.socket = socket
            handshakePending = true
            frameBuffer.reset()
            receivingSocket = nil
            socket.resume()
            startHandshakeTimeout(for: socket, generation: generation)
            try await socket.send(.string(#"{"protocol":"json","version":1}"# + "\u{001e}"))
            try Task.checkCancellation()
            guard !stopped,
                  generation == connectionGeneration,
                  self.socket === socket else {
                socket.cancel(with: .goingAway, reason: nil)
                return
            }
            receive(from: socket, generation: generation)
        } catch is CancellationError {
            createdSocket?.cancel(with: .goingAway, reason: nil)
            if generation == connectionGeneration {
                handshakeTask?.cancel()
                handshakeTask = nil
                if self.socket === createdSocket {
                    self.socket = nil
                }
            }
        } catch {
            if let createdSocket {
                createdSocket.cancel(with: .abnormalClosure, reason: nil)
            }
            guard generation == connectionGeneration else { return }
            handshakeTask?.cancel()
            handshakeTask = nil
            if self.socket === createdSocket {
                self.socket = nil
            }
            await scheduleReconnect(generation: generation)
        }
    }

    private func startHandshakeTimeout(
        for socket: URLSessionWebSocketTask,
        generation: UInt64
    ) {
        handshakeTask?.cancel()
        handshakeTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(10))
            guard !Task.isCancelled else { return }
            guard let self else { return }
            await self.handleHandshakeTimeout(for: socket, generation: generation)
        }
    }

    private func handleHandshakeTimeout(
        for socket: URLSessionWebSocketTask,
        generation: UInt64
    ) async {
        guard !stopped,
              generation == connectionGeneration,
              self.socket === socket,
              handshakePending else {
            return
        }
        handshakeTask = nil
        socket.cancel(with: .protocolError, reason: nil)
        self.socket = nil
        receivingSocket = nil
        handshakePending = false
        frameBuffer.reset()
        await scheduleReconnect(generation: generation)
    }

    private func receive(
        from socket: URLSessionWebSocketTask,
        generation: UInt64
    ) {
        guard !stopped,
              generation == connectionGeneration,
              self.socket === socket,
              receivingSocket == nil else {
            return
        }
        receivingSocket = socket
        socket.receive { [weak self] result in
            Task { [weak self] in
                await self?.handle(result, from: socket, generation: generation)
            }
        }
    }

    private func handle(
        _ result: Result<URLSessionWebSocketTask.Message, Error>,
        from socket: URLSessionWebSocketTask,
        generation: UInt64
    ) async {
        guard !stopped,
              generation == connectionGeneration,
              self.socket === socket,
              receivingSocket === socket else {
            return
        }
        receivingSocket = nil

        switch result {
        case let .success(message):
            let text: String
            switch message {
            case let .string(value):
                text = value
            case let .data(data):
                guard let value = String(data: data, encoding: .utf8) else {
                    await failConnection(socket, generation: generation)
                    return
                }
                text = value
            @unknown default:
                await failConnection(socket, generation: generation)
                return
            }

            for frame in frameBuffer.append(text) {
                guard !stopped,
                      generation == connectionGeneration,
                      self.socket === socket else {
                    return
                }
                if handshakePending {
                    guard case .success = SignalRHandshakeResponse.parse(Data(frame.utf8)) else {
                        await failConnection(socket, generation: generation)
                        return
                    }
                    handshakePending = false
                    handshakeTask?.cancel()
                    handshakeTask = nil
                    attempt = 0
                    notifyConnected(generation: generation)
                } else {
                    await decodeSignalRFrame(Data(frame.utf8))
                }
            }
            receive(from: socket, generation: generation)
        case .failure:
            await failConnection(socket, generation: generation)
        }
    }

    private func failConnection(
        _ socket: URLSessionWebSocketTask,
        generation: UInt64
    ) async {
        guard generation == connectionGeneration, self.socket === socket else { return }
        handshakeTask?.cancel()
        handshakeTask = nil
        connectedNotificationTask?.cancel()
        connectedNotificationTask = nil
        socket.cancel(with: .protocolError, reason: nil)
        self.socket = nil
        receivingSocket = nil
        handshakePending = false
        frameBuffer.reset()
        await scheduleReconnect(generation: generation)
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
                if cursor < lastCursor {
                    await notifyRecovery()
                }
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

    private func scheduleReconnect(generation: UInt64) async {
        guard !stopped,
              generation == connectionGeneration,
              reconnectTask == nil else {
            return
        }
        socket = nil
        receivingSocket = nil
        handshakePending = false
        frameBuffer.reset()
        attempt += 1
        let delay = min(pow(2.0, Double(attempt - 1)), 30)
        await notify(.reconnecting(attempt: attempt), generation: generation)
        guard !stopped, generation == connectionGeneration else { return }
        reconnectTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(delay))
            guard !Task.isCancelled else { return }
            await self?.resumeReconnect(generation: generation)
        }
    }

    private func resumeReconnect(generation: UInt64) {
        guard !stopped, generation == connectionGeneration else { return }
        reconnectTask = nil
        startConnection()
    }

    private func notify(_ state: ConnectionState, generation: UInt64) async {
        guard generation == connectionGeneration else { return }
        guard lastNotifiedState != state else { return }
        lastNotifiedState = state
        await onStateChange?(state)
    }

    private func notifyConnected(generation: UInt64) {
        guard generation == connectionGeneration,
              lastNotifiedState != .connected else {
            return
        }
        lastNotifiedState = .connected
        connectedNotificationTask?.cancel()
        let handler = onStateChange
        connectedNotificationTask = Task {
            guard !Task.isCancelled else { return }
            await handler?(.connected)
        }
    }
}

enum SignalRHandshakeResult: Equatable {
    case success
    case failure(String)
}

enum SignalRHandshakeResponse {
    static func parse(_ data: Data) -> SignalRHandshakeResult {
        guard let object = try? JSONSerialization.jsonObject(with: data),
              let response = object as? [String: Any] else {
            return .failure("The SignalR handshake response was not a JSON object.")
        }
        if let error = response["error"] {
            guard let message = error as? String else {
                return .failure("The SignalR handshake response contained an invalid error.")
            }
            return .failure(message)
        }
        guard response.isEmpty else {
            return .failure("The SignalR handshake response contained unsupported fields.")
        }
        return .success
    }
}

struct SignalRFrameBuffer {
    private static let recordSeparator: Character = "\u{001e}"
    private var pending = ""

    mutating func append(_ text: String) -> [String] {
        pending.append(text)
        let parts = pending.split(
            separator: Self.recordSeparator,
            omittingEmptySubsequences: false
        )
        if pending.last == Self.recordSeparator {
            pending = ""
            return parts.compactMap { $0.isEmpty ? nil : String($0) }
        }
        guard let partial = parts.last else { return [] }
        pending = String(partial)
        return parts.dropLast().compactMap { $0.isEmpty ? nil : String($0) }
    }

    mutating func reset() {
        pending = ""
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
