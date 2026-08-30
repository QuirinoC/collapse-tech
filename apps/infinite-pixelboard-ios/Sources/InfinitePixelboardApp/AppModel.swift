import Foundation
import SwiftUI
import PixelboardCore

@MainActor
final class AppModel: ObservableObject {
    enum ConnectionLabel: String {
        case offline = "Offline"
        case connecting = "Syncing"
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
    @Published var statusMessage = PixelboardL10n.loadingBoard
    @Published var isPlacing = false
    @Published var showingAccount = false
    @Published var authNotice: String?
    @Published var now = Date()
    @Published private(set) var boardGeneration = 0

    let authentication: any AuthenticationSession
    let api: PixelboardAPIClient
    let realtime: BoardRealtimeClient
    let store: StoreManager
    let pushNotifications = PushNotificationCoordinator.shared

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
    private var pendingCenter: BoardPosition?
    private var didApplyInitialView = false
    private let pendingReferralKey = "pixelboard.pendingReferralCode"
    private let savedViewKey = "pixelboard.savedView"

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
        pushNotifications.onOpenPosition = { [weak self] position in
            self?.center(on: position)
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

    var availableColors: [String] {
        let colors: [String]
        if let account {
            colors = account.allowedColors
                ?? (account.tier == .pro ? PixelboardPalette.proColors : PixelboardPalette.freeColors)
        } else {
            colors = PixelboardPalette.freeColors
        }
        var seen = Set<String>()
        return colors.filter { seen.insert($0.uppercased()).inserted }
    }

    var canUseCustomColors: Bool {
        account?.tier == .pro
    }

    var remainingCooldown: Int {
        guard let next = account?.cooldown.nextPlacementAt else { return 0 }
        return max(0, Int(ceil(next.timeIntervalSince(now))))
    }

    var canPlace: Bool {
        guard metadata?.accessMode == .open,
              !needsAppUpdate,
              cache != nil,
              placement != nil else {
            return false
        }
        return account?.canPlace == true && account?.communityStandardsAccepted == true &&
            remainingCooldown == 0 && !isPlacing
    }

    var isPlaceControlEnabled: Bool {
        if needsAppUpdate { return false }
        if let metadata, metadata.accessMode != .open { return false }
        if account == nil { return true }
        guard cache != nil else { return false }
        return canPlace
    }

    var needsAppUpdate: Bool {
        guard let minimum = metadata?.minimumIosVersion else { return false }
        return compareVersions(appVersion, minimum) == .orderedAscending
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
        let isAuthenticated = await authentication.isAuthenticated
        store.authenticationDidChange(isAuthenticated: isAuthenticated)
        if isAuthenticated {
            await store.refreshEntitlementState()
        }
        await refreshAccount()
        if await authentication.isAuthenticated {
            await pushNotifications.prepare(api: api)
        }
        await redeemPendingInvite()
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
            persistView()
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
        let previous = canvasSize
        canvasSize = size
        if let pendingCenter {
            selectedPosition = pendingCenter
            viewport.center(on: pendingCenter, width: size.width, height: size.height)
            self.pendingCenter = nil
            didApplyInitialView = true
            persistView()
            return
        }
        if !didApplyInitialView {
            didApplyInitialView = true
            if restoreSavedView(size: size) {
                return
            }
            viewport = BoardViewport(width: size.width, height: size.height)
            return
        }
        guard previous != .zero, previous != size else { return }
        let focus = viewport.screenToBoard(x: previous.width / 2, y: previous.height / 2)
        viewport.center(on: focus, width: size.width, height: size.height)
    }

    func loadVisible(size: CGSize) async {
        guard let cache else { return }
        await cache.ensure(viewport.visibleTiles(width: size.width, height: size.height).addresses)
        tiles = await cache.snapshot()
    }

    func placeSelected() async {
        guard canPlace else {
            if remainingCooldown > 0 {
                statusMessage = PixelboardL10n.readyIn(remainingCooldown)
            } else if account == nil {
                statusMessage = PixelboardL10n.signInToPlacePixel
                showingAccount = true
            } else if account?.isBanned == true {
                statusMessage = PixelboardL10n.bannedFromPlacing
            } else if needsAppUpdate {
                statusMessage = PixelboardL10n.updateToKeepPainting
            } else if metadata?.accessMode != .open {
                statusMessage = metadata?.statusMessage ?? PixelboardL10n.readOnlyBoard
            } else {
                statusMessage = PixelboardL10n.placementNotReady
            }
            return
        }
        guard let placement, let cache, metadata?.accessMode == .open else {
            statusMessage = PixelboardL10n.placementNotReady
            return
        }
        let generation = authenticationGeneration
        isPlacing = true
        defer { isPlacing = false }
        do {
            let result = try await placement.place(
                row: selectedPosition.row,
                column: selectedPosition.column,
                color: selectedColor
            )
            guard generation == authenticationGeneration else { return }
            guard result.outcome == .accepted, let pixel = result.pixel else {
                statusMessage = result.error?.message ?? PixelboardL10n.placementRejected
                return
            }
            await cache.apply(pixel)
            tiles = await cache.snapshot()
            if let current = account {
                account = AccountState(
                    tier: current.tier,
                    canPlace: current.canPlace,
                    communityStandardsAccepted: current.communityStandardsAccepted,
                    cooldown: result.cooldown,
                    referralCode: current.referralCode,
                    paintBoost: current.paintBoost,
                    isBanned: current.isBanned,
                    allowedColors: current.allowedColors,
                    entitlementSource: current.entitlementSource
                )
            }
            statusMessage = PixelboardL10n.pixelPlaced
        } catch {
            guard generation == authenticationGeneration else { return }
            if case let APIClientError.placement(_, result) = error,
               let current = account {
                account = AccountState(
                    tier: current.tier,
                    canPlace: current.canPlace,
                    communityStandardsAccepted: current.communityStandardsAccepted,
                    cooldown: result.cooldown,
                    referralCode: current.referralCode,
                    paintBoost: current.paintBoost,
                    isBanned: current.isBanned,
                    allowedColors: current.allowedColors,
                    entitlementSource: current.entitlementSource
                )
            }
            statusMessage = error.localizedDescription
        }
    }

    func signIn(with provider: AuthenticationProvider) async {
        authenticationGeneration &+= 1
        authNotice = nil
        do {
            try await authentication.signIn(with: provider)
            store.authenticationDidChange(isAuthenticated: true)
            await store.refreshEntitlementState()
            await refreshAccount()
            await pushNotifications.prepare(api: api)
            if !pushNotifications.notificationsEnabled {
                showingAccount = true
            }
            await redeemPendingInvite()
        } catch is CancellationError {
            return
        } catch {
            authNotice = error.localizedDescription
            statusMessage = error.localizedDescription
        }
    }

    func signOut() async {
        authenticationGeneration &+= 1
        do {
            try await pushNotifications.unregister(api: api)
            try await authentication.signOut()
            store.authenticationDidChange(isAuthenticated: false)
            account = nil
            authNotice = nil
            syncPaletteSelection()
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    func acceptStandards() async {
        do {
            try await api.acceptCommunityStandards()
            await refreshAccount()
            await redeemPendingInvite()
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    func deleteAccount() async {
        authenticationGeneration &+= 1
        do {
            try await authentication.prepareForAccountDeletion()
            try await api.deleteAccount()
            await pushNotifications.resetAfterAccountDeletion()
            try await authentication.deleteAccount()
            store.authenticationDidChange(isAuthenticated: false)
            account = nil
            syncPaletteSelection()
            statusMessage = PixelboardL10n.accountDeleted
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    func submitReport(reason: ReportReason?, note: String, region: ReportRegion) async -> Bool {
        guard account != nil else {
            statusMessage = PixelboardL10n.signInToReport
            return false
        }
        guard let reason else {
            statusMessage = PixelboardL10n.chooseReportReason
            return false
        }
        do {
            _ = try await api.report(CreateReportRequest(
                region: region,
                reason: reason,
                note: note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : note,
                client: ClientContext(appVersion: appVersion)
            ))
            statusMessage = PixelboardL10n.reportReceived
            return true
        } catch {
            statusMessage = error.localizedDescription
            return false
        }
    }

    func queueReferralCode(_ raw: String?) async {
        guard let code = BoardLinks.normalizeReferralCode(raw) else {
            statusMessage = PixelboardL10n.inviteCodeLength
            return
        }
        UserDefaults.standard.set(code, forKey: pendingReferralKey)
        await redeemPendingInvite()
    }

    func handleIncomingURL(_ url: URL) {
        if let code = BoardLinks.referralCode(from: url) {
            Task { await queueReferralCode(code) }
        }
        if let position = BoardLinks.position(from: url) {
            center(on: position)
        }
    }

    func center(on position: BoardPosition) {
        selectedPosition = position
        guard canvasSize != .zero else {
            pendingCenter = position
            return
        }
        viewport.center(on: position, width: canvasSize.width, height: canvasSize.height)
        pendingCenter = nil
        persistView()
    }

    func zoomAtCenter(factor: Double) {
        guard canvasSize != .zero else { return }
        viewport.zoom(atX: canvasSize.width / 2, y: canvasSize.height / 2, factor: factor)
        persistView()
    }

    func persistView() {
        guard canvasSize != .zero else { return }
        let focus = viewport.screenToBoard(x: canvasSize.width / 2, y: canvasSize.height / 2)
        let saved = SavedBoardView(row: focus.row, column: focus.column, scale: viewport.scale)
        if let data = try? JSONEncoder().encode(saved) {
            UserDefaults.standard.set(data, forKey: savedViewKey)
        }
    }

    @discardableResult
    private func restoreSavedView(size: CGSize) -> Bool {
        guard let data = UserDefaults.standard.data(forKey: savedViewKey),
              let saved = try? JSONDecoder().decode(SavedBoardView.self, from: data) else {
            return false
        }
        let position = BoardPosition(row: saved.row, column: saved.column)
        selectedPosition = position
        viewport.scale = min(BoardViewport.maximumScale, max(BoardViewport.minimumScale, saved.scale))
        viewport.center(on: position, width: size.width, height: size.height)
        return true
    }

    func redeemPendingInvite() async {
        guard let code = UserDefaults.standard.string(forKey: pendingReferralKey),
              account?.communityStandardsAccepted == true else {
            return
        }
        do {
            try await api.claimReferral(code)
            UserDefaults.standard.removeObject(forKey: pendingReferralKey)
            await refreshAccount()
            statusMessage = PixelboardL10n.inviteApplied
        } catch {
            if case let APIClientError.server(_, payload) = error,
               payload?.code == "referral_already_claimed" || payload?.code == "referral_own_code" {
                UserDefaults.standard.removeObject(forKey: pendingReferralKey)
            }
            statusMessage = error.localizedDescription
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

    func enableNotifications() async {
        let granted = await pushNotifications.requestPermission(api: api)
        if !granted {
            authNotice = PixelboardL10n.notificationsDeniedNote
        }
    }

    private func performAccountRefresh() async {
        let generation = authenticationGeneration
        guard await authentication.isAuthenticated else {
            if generation == authenticationGeneration {
                account = nil
                syncPaletteSelection()
            }
            return
        }
        do {
            let refreshedAccount = try await api.account()
            guard generation == authenticationGeneration else { return }
            let isStillAuthenticated = await authentication.isAuthenticated
            guard generation == authenticationGeneration, isStillAuthenticated else { return }
            account = refreshedAccount
            syncPaletteSelection()
        } catch {
            guard generation == authenticationGeneration else { return }
            statusMessage = error.localizedDescription
        }
    }

    private func syncPaletteSelection() {
        guard !canUseCustomColors,
              !availableColors.contains(where: {
                  $0.caseInsensitiveCompare(selectedColor) == .orderedSame
              }),
              let firstColor = availableColors.first else {
            return
        }
        selectedColor = firstColor
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
                statusMessage = PixelboardL10n.boardContractUnsupported
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
            if needsAppUpdate {
                statusMessage = PixelboardL10n.updateToKeepPainting
            } else if let message = metadata.statusMessage, !message.isEmpty {
                statusMessage = message
            } else {
                statusMessage = metadata.accessMode == .open
                    ? ""
                    : PixelboardL10n.boardReadOnly
            }
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

    private func compareVersions(_ lhs: String, _ rhs: String) -> ComparisonResult {
        let left = lhs.split(separator: ".").compactMap { Int($0) }
        let right = rhs.split(separator: ".").compactMap { Int($0) }
        let count = max(left.count, right.count)
        for index in 0..<count {
            let a = index < left.count ? left[index] : 0
            let b = index < right.count ? right[index] : 0
            if a < b { return .orderedAscending }
            if a > b { return .orderedDescending }
        }
        return .orderedSame
    }
}

private struct SavedBoardView: Codable {
    var row: Int
    var column: Int
    var scale: Double
}
