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
    private var visibleRefreshTask: Task<Void, Never>?
    private var foregroundRecoveryTask: Task<Void, Never>?
    private var boardReloadTask: Task<Void, Never>?
    private var accountRefreshTask: Task<Void, Never>?
    private var accountRefreshGeneration: UInt64 = 0
    private var authenticationGeneration: UInt64 = 0
    private var isRefreshingVisibleTiles = false
    private var isReconcilingForeground = false
    private var isActive = false
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
        store.onEntitlementChanged = { @MainActor [weak self] in
            guard let self else { return }
            await self.refreshAccount()
        }
    }

    deinit {
        timerTask?.cancel()
        visibleRefreshTask?.cancel()
        foregroundRecoveryTask?.cancel()
        boardReloadTask?.cancel()
        accountRefreshTask?.cancel()
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
        guard metadata?.accessMode == .open,
              cache != nil,
              placement != nil else {
            return false
        }
        return account?.canPlace == true && account?.communityStandardsAccepted == true &&
            remainingCooldown == 0 && !isPlacing
    }

    func start() async {
        guard !started else {
            if isActive {
                startPeriodicWork()
            }
            return
        }
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
        if isActive {
            await realtime.start()
        }
        await reloadBoard()
        store.authenticationDidChange(
            isAuthenticated: await authentication.isAuthenticated
        )
        await refreshAccount()
        await store.loadProducts()
        if isActive {
            startPeriodicWork()
            if metadata == nil || cache == nil || placement == nil {
                scheduleForegroundRecovery()
            }
        }
    }

    func handleScenePhase(_ phase: ScenePhase) async {
        isActive = phase == .active
        guard isActive else {
            timerTask?.cancel()
            timerTask = nil
            visibleRefreshTask?.cancel()
            visibleRefreshTask = nil
            foregroundRecoveryTask?.cancel()
            foregroundRecoveryTask = nil
            await realtime.stop()
            return
        }
        guard started else { return }
        startPeriodicWork()
        scheduleForegroundRecovery()
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
        guard let placement, let cache, metadata?.accessMode == .open else {
            statusMessage = "Placement is not ready"
            return
        }
        isPlacing = true
        defer { isPlacing = false }
        do {
            let result = try await placement.place(
                row: selectedPosition.row,
                column: selectedPosition.column,
                color: selectedColor
            )
            guard result.outcome == .accepted, let pixel = result.pixel else {
                statusMessage = result.error?.message ?? "The pixel placement was rejected."
                return
            }
            await cache.apply(pixel)
            tiles = await cache.snapshot()
            if let current = account {
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
        authenticationGeneration &+= 1
        do {
            try await authentication.signIn(with: provider)
            store.authenticationDidChange(isAuthenticated: true)
            await refreshAccount()
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    func signOut() async {
        authenticationGeneration &+= 1
        do {
            try await authentication.signOut()
            store.authenticationDidChange(isAuthenticated: false)
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
        authenticationGeneration &+= 1
        do {
            try await authentication.prepareForAccountDeletion()
            try await api.deleteAccount()
            try await authentication.deleteAccount()
            store.authenticationDidChange(isAuthenticated: false)
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
        accountRefreshGeneration &+= 1
        if let accountRefreshTask {
            await accountRefreshTask.value
            return
        }
        let task = Task { [weak self] in
            guard let self else { return }
            var handledGeneration: UInt64 = 0
            repeat {
                handledGeneration = self.accountRefreshGeneration
                await self.performAccountRefresh()
            } while handledGeneration != self.accountRefreshGeneration && !Task.isCancelled
            self.accountRefreshTask = nil
        }
        accountRefreshTask = task
        await task.value
    }

    private func performAccountRefresh() async {
        let generation = authenticationGeneration
        guard await authentication.isAuthenticated else {
            if generation == authenticationGeneration {
                account = nil
            }
            return
        }
        do {
            let refreshedAccount = try await api.account()
            guard generation == authenticationGeneration else { return }
            let isStillAuthenticated = await authentication.isAuthenticated
            guard generation == authenticationGeneration, isStillAuthenticated else { return }
            account = refreshedAccount
        } catch {
            guard generation == authenticationGeneration else { return }
            statusMessage = error.localizedDescription
        }
    }

    private func reloadBoard() async {
        if let boardReloadTask {
            await boardReloadTask.value
            return
        }
        let task = Task { [weak self] in
            guard let self else { return }
            await self.performBoardReload()
            self.boardReloadTask = nil
        }
        boardReloadTask = task
        await task.value
    }

    private func performBoardReload() async {
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
            placement = PlacementCoordinator(api: api, appVersion: appVersion)
            boardGeneration += 1
            statusMessage = metadata.accessMode == .open ? "Board ready" : "Board is read-only"
        } catch {
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
        guard isActive, canvasSize != .zero, let cache, !isRefreshingVisibleTiles else {
            return
        }
        isRefreshingVisibleTiles = true
        defer { isRefreshingVisibleTiles = false }
        let addresses = viewport.visibleTiles(
            width: canvasSize.width,
            height: canvasSize.height
        ).addresses
        await cache.refresh(addresses)
        tiles = await cache.snapshot()
    }

    private func startPeriodicWork() {
        guard isActive else { return }
        if timerTask == nil {
            timerTask = Task { [weak self] in
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(1))
                    guard let self, self.isActive else { return }
                    self.now = Date()
                }
            }
        }
        if visibleRefreshTask == nil {
            visibleRefreshTask = Task { [weak self] in
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(30))
                    guard let self, self.isActive else { return }
                    await self.reconcileForeground()
                }
            }
        }
    }

    private func scheduleForegroundRecovery() {
        guard foregroundRecoveryTask == nil else { return }
        foregroundRecoveryTask = Task { [weak self] in
            guard let self else { return }
            await self.recoverForeground()
            self.foregroundRecoveryTask = nil
        }
    }

    private func recoverForeground() async {
        await reconcileForeground()
    }

    private func reconcileForeground() async {
        guard isActive, !Task.isCancelled, !isReconcilingForeground else { return }
        isReconcilingForeground = true
        defer { isReconcilingForeground = false }
        if metadata == nil || cache == nil || placement == nil {
            await reloadBoard()
        }
        guard isActive, !Task.isCancelled else { return }
        await realtime.start()
        await refreshVisibleTiles()
        guard isActive, !Task.isCancelled else { return }
        await refreshAccount()
    }
}
