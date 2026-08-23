import Foundation
import SwiftUI
import PixelboardCore

@MainActor
final class AppModel: ObservableObject {
    enum ConnectionLabel: String {
        case offline = "Offline"
        case connecting = "Connecting"
        case online = "Live"
        case reconnecting = "Reconnecting"
    }

    @Published var viewport = BoardViewport(width: 1, height: 1)
    @Published var selectedPosition = BoardPosition(row: 0, column: 0)
    @Published var selectedColor = "#D3523C"
    @Published var tiles: [TileAddress: [[String]]] = [:]
    @Published var metadata: BoardMetadata?
    @Published var account: AccountState?
    @Published var connection: ConnectionLabel = .offline
    @Published var statusMessage = "Loading board"
    @Published var isPlacing = false
    @Published var now = Date()
    @Published private(set) var boardGeneration = 0

    let authentication: any AuthenticationSession
    let api: PixelboardAPIClient
    let realtime: BoardRealtimeClient
    let store: StoreManager

    private var cache: TileCache?
    private var placement: PlacementCoordinator?
    private var timerTask: Task<Void, Never>?
    private var started = false
    private var canvasSize = CGSize.zero

    init() {
        let authentication = FirebaseAuthAdapter()
        let api = PixelboardAPIClient(
            baseURL: AppConfiguration.baseURL,
            authentication: authentication
        )
        self.authentication = authentication
        self.api = api
        realtime = BoardRealtimeClient(baseURL: AppConfiguration.baseURL)
        store = StoreManager(api: api)
    }

    var tier: AccountTierView {
        guard let account else { return .anonymous }
        return account.tier == .pro ? .pro : .free
    }

    var remainingCooldown: Int {
        guard let next = account?.cooldown.nextPlacementAt else { return 0 }
        return max(0, Int(ceil(next.timeIntervalSince(now))))
    }

    var canPlace: Bool {
        account?.canPlace == true && account?.communityStandardsAccepted == true &&
            remainingCooldown == 0 && !isPlacing
    }

    func start() async {
        guard !started else { return }
        started = true
        await realtime.setHandlers(
            onPixel: { [weak self] event in
                await self?.applyRealtimePixel(event.pixel)
            },
            onStateChange: { [weak self] state in
                await self?.setConnection(state)
            },
            onRecoveryRequired: { [weak self] in
                await self?.refreshVisibleTiles()
            }
        )
        await realtime.start()
        await reloadBoard()
        await refreshAccount()
        await store.loadProducts()
        timerTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                guard !Task.isCancelled else { return }
                self?.now = Date()
            }
        }
    }

    func resize(to size: CGSize) {
        canvasSize = size
        guard viewport.offsetX == 0.5, viewport.offsetY == 0.5 else { return }
        viewport = BoardViewport(width: size.width, height: size.height)
    }

    func loadVisible(size: CGSize) async {
        guard let cache else { return }
        await cache.ensure(viewport.visibleTiles(width: size.width, height: size.height).addresses)
        tiles = await cache.snapshot()
    }

    func placeSelected() async {
        guard canPlace else {
            statusMessage = account == nil ? "Sign in to place pixels" : "Placement is not ready"
            return
        }
        isPlacing = true
        defer { isPlacing = false }
        do {
            let result = try await placement?.place(
                row: selectedPosition.row,
                column: selectedPosition.column,
                color: selectedColor
            )
            if let pixel = result?.pixel {
                await cache?.apply(pixel)
                tiles = await cache?.snapshot() ?? tiles
            }
            if let result, let current = account {
                account = AccountState(
                    tier: current.tier,
                    canPlace: current.canPlace,
                    communityStandardsAccepted: current.communityStandardsAccepted,
                    cooldown: result.cooldown
                )
            }
            statusMessage = "Pixel placed"
        } catch {
            if case let APIClientError.placement(_, result) = error,
               let current = account {
                account = AccountState(
                    tier: current.tier,
                    canPlace: current.canPlace,
                    communityStandardsAccepted: current.communityStandardsAccepted,
                    cooldown: result.cooldown
                )
            }
            statusMessage = error.localizedDescription
        }
    }

    func signIn(with provider: AuthenticationProvider) async {
        do {
            try await authentication.signIn(with: provider)
            await refreshAccount()
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    func signOut() async {
        do {
            try await authentication.signOut()
            account = nil
            statusMessage = "Signed out; browsing remains available"
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    func acceptStandards() async {
        do {
            try await api.acceptCommunityStandards()
            await refreshAccount()
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    func deleteAccount() async {
        do {
            try await authentication.prepareForAccountDeletion()
            try await api.deleteAccount()
            try await authentication.deleteAccount()
            account = nil
            statusMessage = "Account deleted"
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    func submitReport(reason: ReportReason, note: String) async -> Bool {
        guard account != nil else {
            statusMessage = "Sign in to report content"
            return false
        }
        do {
            _ = try await api.report(CreateReportRequest(
                region: ReportRegion(
                    top: selectedPosition.row,
                    left: selectedPosition.column
                ),
                reason: reason,
                note: note.isEmpty ? nil : note,
                client: ClientContext(appVersion: appVersion)
            ))
            statusMessage = "Report received"
            return true
        } catch {
            statusMessage = error.localizedDescription
            return false
        }
    }

    func refreshAccount() async {
        guard await authentication.isAuthenticated else {
            account = nil
            return
        }
        do {
            account = try await api.account()
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    private func reloadBoard() async {
        do {
            let metadata = try await api.metadata()
            guard metadata.apiVersion == 1,
                  metadata.coordinateConvention == "row-column" else {
                statusMessage = "This board contract is not supported"
                return
            }
            self.metadata = metadata
            let cache = TileCache(
                tileRows: metadata.tileRows,
                tileColumns: metadata.tileColumns,
                defaultColor: metadata.defaultColor,
                maximumTiles: 96,
                loader: { [api] address in try await api.tile(address) }
            )
            self.cache = cache
            boardGeneration += 1
            placement = PlacementCoordinator(api: api, appVersion: appVersion)
            connection = .online
            statusMessage = metadata.accessMode == .open ? "Board ready" : "Board is read-only"
        } catch {
            connection = .offline
            statusMessage = error.localizedDescription
        }
    }

    private var appVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0"
    }

    private func applyRealtimePixel(_ pixel: PixelState) async {
        await cache?.apply(pixel)
        tiles = await cache?.snapshot() ?? tiles
    }

    private func setConnection(_ state: BoardRealtimeClient.ConnectionState) async {
        switch state {
        case .disconnected: connection = .offline
        case .connecting: connection = .connecting
        case .connected:
            connection = .online
            await refreshVisibleTiles()
        case .reconnecting: connection = .reconnecting
        }
    }

    private func refreshVisibleTiles() async {
        guard canvasSize != .zero, let cache else { return }
        let addresses = viewport.visibleTiles(
            width: canvasSize.width,
            height: canvasSize.height
        ).addresses
        await cache.refresh(addresses)
        tiles = await cache.snapshot()
    }
}
