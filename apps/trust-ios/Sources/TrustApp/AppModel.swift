import Combine
import Foundation
import StoreKit
import SwiftUI
import TrustCore
import UIKit

enum AppPhase: Equatable {
    case login
    case onboarding
    case home
}

@MainActor
final class AppearanceStore: ObservableObject {
    @Published var nightEdition: Bool {
        didSet { UserDefaults.standard.set(nightEdition, forKey: Self.key) }
    }

    private static let key = "trust.nightEdition"

    init() {
        nightEdition = UserDefaults.standard.bool(forKey: Self.key)
    }
}

@MainActor
final class AppModel: ObservableObject {
    let client = TrustClient()
    let store: StoreManager
    let location: LocationCoordinator
    let receipts: LookReceiptNotifier
    let auth: AuthSession
    let appearance: AppearanceStore
    private let ingestStore: LocationIngestStore
    private var isFlushingIngest = false
    private var ingestFlushTask: Task<Void, Never>?

    @Published var phase: AppPhase
    @Published var showingSettings = false
    @Published var showingLookLog = false
    @Published var showingLookConfirm = false
    @Published var showingMap = false
    @Published var showingPaywall = false
    @Published var showingShareSheet = false
    @Published var showingTimedShare = false
    @Published var shareSubject: Person?
    @Published var lookSubject: Person?
    @Published var inviteCodeDraft = ""
    @Published var pairingNotice: String?
    @Published var quietBanner: LookReceipt?
    @Published var isSigningIn = false
    @Published var isDemoMode = false
    @Published var snapshot: CircleSnapshot?
    @Published var localSession: LookSession?
    @Published var onboardingHandle = ""
    @Published var onboardingNotice: String?
    @Published var handleAvailability: Bool?
    @Published var isOnboardingBusy = false
    private var handleCheckTask: Task<Void, Never>?
    private var demo: DemoTrustService?
    private var demoTickTask: Task<Void, Never>?

    private var cancellables: Set<AnyCancellable> = []

    var authNotice: String? { auth.notice }

    var you: Person {
        snapshot?.you ?? Person(displayName: auth.account?.displayName ?? "You")
    }

    var circle: [TrustedPerson] { snapshot?.members ?? [] }
    var coverage: CircleCoverage {
        snapshot?.coverage ?? CircleCoverage(isCovered: false, sponsorName: nil, actingIsSponsor: false)
    }

    var pairIsActive: Bool { !circle.isEmpty }
    var isSharingLocation: Bool { OutboundLocationSharing.isActive(trustedCount: circle.count) }
    var activeSession: LookSession? { localSession ?? snapshot?.activeSession }
    var lookLog: [LookEvent] { snapshot?.lookLog ?? [] }
    var pendingInviteCode: String? { snapshot?.pendingInviteCode }
    var beingWatched: LookEvent? { snapshot?.beingWatched }

    var nightEditionBinding: Binding<Bool> {
        Binding(
            get: { self.appearance.nightEdition },
            set: { self.appearance.nightEdition = $0 }
        )
    }

    var signedInSummary: String {
        guard let account = auth.account else {
            return TrustCopy.signedOutSummary
        }
        let method = account.provider == .apple ? "Apple" : "Google"
        return TrustCopy.signedInSummary(method: method, name: you.identity)
    }

    init() {
        let auth = AuthSession()
        self.auth = auth
        store = StoreManager()
        location = LocationCoordinator()
        receipts = LookReceiptNotifier()
        LookReceiptNotifier.shared = receipts
        appearance = AppearanceStore()
        ingestStore = LocationIngestStore()
        client.token = auth.sessionToken
        phase = auth.isAuthenticated ? .home : .login
        bind()
    }

    func start() async {
        await client.prepare()
        #if DEBUG
        if auth.sessionToken == "demo" {
            enterDemo()
            await store.loadProducts()
            return
        }
        #endif
        await auth.validateRestoredAppleCredential()
        if auth.isAuthenticated {
            await refresh(enterHome: true)
        } else {
            phase = .login
            if let warning = client.reachabilityNotice {
                auth.notice = warning
            }
        }
        await store.loadProducts()
        receipts.prepare(client: client)
        await store.refreshEntitlement()
        if auth.isAuthenticated {
            await refreshStoreKitToken()
            await syncCircleEntitlement()
        }
        receipts.refreshStatus()
        UIDevice.current.isBatteryMonitoringEnabled = true
        if phase == .home, ProcessInfo.processInfo.environment["TRUST_SCREENSHOT"] == nil {
            await receipts.requestPermission()
        }
        applyScreenshotLaunch()
    }

    /// Simulator App Store shots. `SIMCTL_CHILD_TRUST_SCREENSHOT=look|log|share|settings|map`
    private func applyScreenshotLaunch() {
        #if DEBUG
        let shot = ProcessInfo.processInfo.environment["TRUST_SCREENSHOT"] ?? ""
        guard !shot.isEmpty, auth.isAuthenticated else { return }
        switch shot {
        case "look":
            lookSubject = circle.first(where: { !$0.inboundLive })?.person ?? circle.first?.person
            showingLookConfirm = true
        case "log":
            showingLookLog = true
        case "share":
            shareSubject = circle.first?.person
            showingShareSheet = true
        case "settings":
            showingSettings = true
        case "map":
            if activeSession != nil {
                showingMap = true
            }
        default:
            break
        }
        #endif
    }

    func prepareLogin() async {
        await client.prepare()
        if let warning = client.reachabilityNotice {
            auth.notice = warning
        }
    }

    /// Offline lean demo — Login → Home with couple / child / elder. DEBUG and Simulator-friendly.
    func enterDemo() {
        #if DEBUG
        let service = DemoTrustService(displayName: "Sam")
        service.startLeanDemo()
        demo = service
        isDemoMode = true
        auth.persist(
            account: AuthAccount(provider: .apple, displayName: "Sam", appleUserID: "demo.sam"),
            token: "demo"
        )
        client.token = "demo"
        publishDemoSnapshot()
        phase = .home
        quietBanner = LookReceipt(
            title: TrustCopy.demoBannerTitle,
            body: TrustCopy.demoBannerBody,
            at: Date()
        )
        startDemoTicks()
        #endif
    }

    private func publishDemoSnapshot() {
        guard let demo else { return }
        let pack = demo.makeCircleSnapshot()
        snapshot = CircleSnapshot(
            you: pack.you,
            members: pack.members,
            coverage: pack.coverage,
            pendingInviteCode: pack.invite,
            activeSession: pack.session,
            beingWatched: nil,
            lookLog: pack.log,
            retainedLookLogCount: pack.retained,
            allowsDevelopmentSignIn: true,
            allowsReviewUnlock: true,
            yourHomePlaceID: nil,
            yourHomeLabel: "Home",
            yourHomeState: .home
        )
        localSession = pack.session
        if let receipt = demo.lastReceipt {
            quietBanner = receipt
        }
    }

    private func startDemoTicks() {
        demoTickTask?.cancel()
        demoTickTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(8))
                guard let self, self.isDemoMode else { return }
                self.publishDemoSnapshot()
            }
        }
    }

    private func stopDemo() {
        demoTickTask?.cancel()
        demoTickTask = nil
        demo = nil
        isDemoMode = false
    }

    func signIn(with provider: AuthenticationProvider) async {
        guard !isSigningIn else { return }
        isSigningIn = true
        defer { isSigningIn = false }
        do {
            switch provider {
            case .apple:
                let apple = try await auth.signInWithApple()
                await client.prepare()
                let session = try await client.appleSession(identityToken: apple.identityToken, displayName: apple.displayName)
                auth.persist(
                    account: AuthAccount(
                        provider: .apple,
                        displayName: apple.displayName ?? "You",
                        appleUserID: apple.userID
                    ),
                    token: client.token ?? ""
                )
                await refresh(enterHome: true, fallbackOnboardingComplete: session.you.model.onboardingComplete)
            case .google:
                auth.notice = TrustCopy.trustUsesSignInWithApple
                return
            }
            receipts.prepare(client: client)
            await refreshStoreKitToken()
            if phase == .home {
                await receipts.requestPermission()
            }
        } catch is CancellationError {
            return
        } catch {
            auth.notice = error.localizedDescription
        }
    }

    func signOut() {
        Task { await receipts.unregister() }
        store.clearAfterSignOut()
        auth.signOut()
        client.token = nil
        stopDemo()
        snapshot = nil
        localSession = nil
        phase = .login
        showingSettings = false
        showingLookLog = false
        showingMap = false
        showingLookConfirm = false
        showingShareSheet = false
        showingTimedShare = false
        shareSubject = nil
        lookSubject = nil
        pairingNotice = nil
        quietBanner = nil
        resetOnboardingDraft()
        ingestStore.clear()
        location.setSharing(false)
        location.setHomeMonitoring(false)
        location.setMapActive(false)
    }

    func refresh(enterHome: Bool = false, fallbackOnboardingComplete: Bool? = nil) async {
        if isDemoMode {
            publishDemoSnapshot()
            if enterHome { phase = .home }
            return
        }
        client.token = auth.sessionToken
        do {
            snapshot = try await client.refreshCircle()
            if enterHome {
                routeAfterAuth(onboardingComplete: snapshot?.you.onboardingComplete ?? fallbackOnboardingComplete ?? true)
            }
            syncLocationSharing()
            syncHomePresenceMonitoring()
            await flushIngestQueue()
            if let watched = snapshot?.beingWatched {
                quietBanner = LookReceipt(
                    title: TrustCopy.receiptTitle(viewer: watched.viewerName),
                    body: TrustCopy.receiptBody(),
                    at: watched.at
                )
            }
        } catch TrustClientError.unauthorized {
            signOut()
        } catch {
            pairingNotice = error.localizedDescription
            syncLocationSharing()
            syncHomePresenceMonitoring()
            if enterHome, auth.isAuthenticated {
                routeAfterAuth(onboardingComplete: fallbackOnboardingComplete ?? snapshot?.you.onboardingComplete ?? true)
            }
        }
    }

    func syncCircleEntitlement(signedTransactionInfo: String? = nil) async {
        do {
            if let signed = signedTransactionInfo, !signed.isEmpty {
                try await client.verifyStoreKitTransaction(signed)
                await refresh()
                return
            }
            if store.reviewUnlocked, snapshot?.allowsReviewUnlock == true {
                try await client.grantCircle(reviewUnlock: true, productID: nil, signedTransactionInfo: nil)
                await refresh()
            }
        } catch {
            pairingNotice = error.localizedDescription
        }
    }

    func refreshStoreKitToken() async {
        do {
            let token = try await client.storeKitAccountToken()
            store.setAppAccountToken(token)
            if let signed = await store.refreshEntitlement() {
                await syncCircleEntitlement(signedTransactionInfo: signed)
            }
        } catch {
            store.setAppAccountToken(nil)
        }
    }

    var onboardingHandleIsValid: Bool {
        if case .valid = TrustHandle.status(of: onboardingHandle) { return true }
        return false
    }

    func setOnboardingHandle(_ raw: String) {
        let next = TrustHandle.sanitizeDraft(raw)
        guard next != onboardingHandle else { return }
        onboardingHandle = next
        handleAvailability = nil
        onboardingNotice = nil
        scheduleHandleAvailabilityCheck()
    }

    func completeOnboarding() async {
        onboardingNotice = nil
        switch TrustHandle.status(of: onboardingHandle) {
        case .invalid:
            onboardingNotice = TrustCopy.enterHandle
            return
        case .reserved:
            onboardingNotice = TrustCopy.handleReserved
            return
        case .valid(let handle):
            isOnboardingBusy = true
            defer { isOnboardingBusy = false }
            do {
                try await client.setHandle(handle)
                await finishOnboardingIfComplete()
                if phase != .home {
                    onboardingNotice = TrustCopy.enterHandle
                }
            } catch {
                onboardingNotice = error.localizedDescription
            }
        }
    }

    private func scheduleHandleAvailabilityCheck() {
        handleCheckTask?.cancel()
        guard case .valid(let handle) = TrustHandle.status(of: onboardingHandle) else { return }
        handleCheckTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 400_000_000)
            guard !Task.isCancelled else { return }
            await self?.checkHandleAvailability(handle)
        }
    }

    private func checkHandleAvailability(_ handle: String) async {
        do {
            let payload = try await client.handleAvailability(handle)
            guard handle == TrustHandle.normalize(onboardingHandle) else { return }
            handleAvailability = payload.available
            if payload.available {
                onboardingNotice = nil
            }
        } catch {
            guard handle == TrustHandle.normalize(onboardingHandle) else { return }
            handleAvailability = nil
        }
    }

    private func finishOnboardingIfComplete() async {
        await refresh()
        let complete = snapshot?.you.onboardingComplete == true
        if complete {
            routeAfterAuth(onboardingComplete: true)
            if phase == .home {
                await receipts.requestPermission()
                if !inviteCodeDraft.isEmpty {
                    joinInvite()
                }
            }
        }
    }

    private func routeAfterAuth(onboardingComplete: Bool) {
        #if DEBUG
        if !(ProcessInfo.processInfo.environment["TRUST_SCREENSHOT"] ?? "").isEmpty {
            phase = .home
            return
        }
        #endif
        if onboardingComplete {
            phase = .home
        } else {
            beginOnboarding()
        }
    }

    private func beginOnboarding() {
        if let existing = snapshot?.you.handle, case .valid(let handle) = TrustHandle.status(of: existing) {
            onboardingHandle = handle
        } else if let suggestion = TrustHandle.suggest(from: snapshot?.you.displayName ?? auth.account?.displayName ?? "") {
            onboardingHandle = suggestion
            scheduleHandleAvailabilityCheck()
        }
        phase = .onboarding
    }

    private func resetOnboardingDraft() {
        handleCheckTask?.cancel()
        onboardingHandle = ""
        onboardingNotice = nil
        handleAvailability = nil
        isOnboardingBusy = false
    }

    func createInvite() {
        beginSharingLocation()
        if let demo {
            demo.createInvite()
            pairingNotice = TrustCopy.shareThisCode
            publishDemoSnapshot()
            return
        }
        Task {
            do {
                let code = try await client.createInvite()
                pairingNotice = TrustCopy.shareThisCode
                await refresh()
                _ = code
            } catch {
                pairingNotice = error.localizedDescription
            }
        }
    }

    func joinInvite() {
        beginSharingLocation()
        if let demo {
            do {
                try demo.joinInvite(code: inviteCodeDraft)
                inviteCodeDraft = ""
                pairingNotice = nil
                publishDemoSnapshot()
                phase = .home
            } catch {
                pairingNotice = error.localizedDescription
            }
            return
        }
        Task {
            do {
                try await client.acceptInvite(code: inviteCodeDraft)
                inviteCodeDraft = ""
                pairingNotice = nil
                await refresh(enterHome: true)
            } catch {
                pairingNotice = error.localizedDescription
            }
        }
    }

    func handleIncomingURL(_ url: URL) {
        guard auth.isAuthenticated else { return }
        let code: String?
        if url.scheme == "https",
           url.host == "trust.collapsetechnologies.com",
           url.path.hasPrefix("/i/") {
            code = url.lastPathComponent
        } else if url.scheme == "trust" {
            let parts = url.pathComponents.filter { $0 != "/" }
            if url.host == "invite" {
                code = parts.first
            } else if parts.first == "invite", parts.count > 1 {
                code = parts[1]
            } else {
                code = nil
            }
        } else {
            code = nil
        }
        guard let code, !code.isEmpty else { return }
        inviteCodeDraft = code
        guard phase == .home else { return }
        joinInvite()
    }

    func prepareMapLocation() {
        location.setMapActive(true)
        location.requestWhenInUse()
    }

    func requestWhenInUseLocation() {
        location.requestWhenInUse()
    }

    func requestAlwaysLocation() {
        location.requestAlways()
    }

    func beginSharingLocation() {
        location.requestAlways()
    }

    func requestPreciseLocation() {
        location.requestPrecise()
    }

    func openSystemSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }

    func requestNotifications() async {
        await receipts.requestPermission()
    }

    func openShare(for person: Person) {
        shareSubject = person
        showingShareSheet = true
    }

    func openLook(for person: Person? = nil) {
        lookSubject = person ?? circle.first?.person
        guard lookSubject != nil else { return }
        showingLookConfirm = true
    }

    func confirmLook() {
        guard let subject = lookSubject else { return }
        if let demo {
            do {
                let session = try demo.breakTrust(confirmed: true, subjectID: subject.id)
                localSession = session
                showingLookConfirm = false
                // Lean: After Look is Home with a live pin — not a second map screen.
                showingMap = false
                publishDemoSnapshot()
                if let receipt = demo.lastReceipt {
                    quietBanner = receipt
                }
            } catch {
                pairingNotice = error.localizedDescription
            }
            return
        }
        Task {
            do {
                let session = try await client.look(subjectID: subject.id, confirmed: true)
                localSession = session
                showingLookConfirm = false
                showingMap = false
                await refresh()
            } catch {
                pairingNotice = error.localizedDescription
            }
        }
    }

    func closeMap() {
        showingMap = false
        let subjectID = localSession?.event.subjectID ?? snapshot?.activeSession?.event.subjectID
        localSession = nil
        if let demo {
            demo.closeLook()
            publishDemoSnapshot()
            return
        }
        Task {
            try? await client.closeLook(subjectID: subjectID)
            await refresh()
        }
    }

    func setUntilTheyLook(personID: UUID) {
        beginSharingLocation()
        if let demo {
            demo.setUntilTheyLook(personID: personID)
            publishDemoSnapshot()
            return
        }
        Task {
            try? await client.setShare(personID: personID, resting: "untilTheyLook", timed: nil)
            await refresh()
        }
    }

    func setAlways(personID: UUID) {
        beginSharingLocation()
        if let demo {
            demo.setAlways(personID: personID)
            publishDemoSnapshot()
            return
        }
        Task {
            try? await client.setShare(personID: personID, resting: "always", timed: nil)
            await refresh()
        }
    }

    func setTimedShare(personID: UUID, duration: TimedShareDuration) {
        beginSharingLocation()
        if let demo {
            demo.setTimedShare(personID: personID, duration: duration)
            publishDemoSnapshot()
            return
        }
        Task {
            try? await client.setShare(personID: personID, resting: nil, timed: duration.rawValue)
            await refresh()
        }
    }

    func setPresenceGrant(personID: UUID, enabled: Bool) {
        if enabled {
            beginSharingLocation()
            ensureHomeConfigured()
        }
        if let demo {
            demo.setPresenceGrant(personID: personID, enabled: enabled)
            publishDemoSnapshot()
            return
        }
        Task {
            do {
                try await client.setPresenceGrant(personID: personID, enabled: enabled)
                await refresh()
            } catch {
                pairingNotice = error.localizedDescription
            }
        }
    }

    func setHomeHere() {
        beginSharingLocation()
        guard let saved = location.setHomeFromCurrentFix() else {
            pairingNotice = TrustCopy.homeNeedsLocation
            return
        }
        Task {
            do {
                try await client.setHomePlace(placeID: saved.placeID, label: saved.label)
                await refresh()
            } catch {
                pairingNotice = error.localizedDescription
            }
        }
    }

    func createPromise(trusteeID: UUID, deadlineAt: Date) {
        beginSharingLocation()
        ensureHomeConfigured()
        Task {
            do {
                try await client.createPromise(trusteeID: trusteeID, deadlineAt: deadlineAt)
                await refresh()
            } catch {
                pairingNotice = error.localizedDescription
            }
        }
    }

    func extendLookHistory() {
        guard let subjectID = activeSession?.event.subjectID else { return }
        Task {
            do {
                localSession = try await client.extendLook(subjectID: subjectID)
                await refresh()
            } catch {
                pairingNotice = error.localizedDescription
            }
        }
    }

    func purchase(_ product: Product) async {
        if let signed = await store.purchase(product) {
            await syncCircleEntitlement(signedTransactionInfo: signed)
        }
    }

    func unlockCircleForReview() {
        guard snapshot?.allowsReviewUnlock == true else { return }
        store.unlockForReview()
        Task { await syncCircleEntitlement() }
    }

    func deleteAccount() async {
        if isDemoMode {
            signOut()
            return
        }
        do {
            try await client.deleteAccount()
            await receipts.unregister()
            store.clearAfterSignOut()
            signOut()
        } catch {
            pairingNotice = error.localizedDescription
        }
    }

    func revoke(_ person: Person) {
        if let demo {
            demo.revoke(personID: person.id)
            showingMap = false
            showingLookConfirm = false
            showingShareSheet = false
            publishDemoSnapshot()
            return
        }
        Task {
            try? await client.revoke(personID: person.id)
            showingMap = false
            showingLookConfirm = false
            await refresh()
        }
    }

    func shareState(for personID: UUID) -> PersonShareState {
        if let demo {
            return demo.shareState(for: personID)
        }
        return circle.first { $0.id == personID }?.share ?? PersonShareState()
    }

    func confirmCopy(for personID: UUID?) -> (title: String, body: String) {
        let subject = circle.first { $0.id == personID }?.displayName
            ?? lookSubject?.identity
            ?? TrustCopy.them
        let looksToday = lookLog.filter {
            $0.viewerID == you.id && Calendar.current.isDateInToday($0.at)
        }.count
        return (
            TrustCopy.confirmTitle(subject: subject),
            TrustCopy.confirmBody(subject: subject, looksToday: looksToday)
        )
    }

    var lookLogExportText: String {
        lookLog.map { event in
            return TrustCopy.lookLogExportRow(
                timestamp: event.at.ISO8601Format(),
                viewer: event.viewerName,
                subject: event.subjectName,
                live: event.includedLive,
                hours: event.historyWindowHours
            )
        }
        .joined(separator: "\n")
    }

    private func bind() {
        auth.objectWillChange
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in self?.objectWillChange.send() }
            .store(in: &cancellables)
        store.objectWillChange
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in self?.objectWillChange.send() }
            .store(in: &cancellables)
        location.objectWillChange
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in self?.objectWillChange.send() }
            .store(in: &cancellables)
        receipts.objectWillChange
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in self?.objectWillChange.send() }
            .store(in: &cancellables)
        appearance.objectWillChange
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in self?.objectWillChange.send() }
            .store(in: &cancellables)

        location.onLocations = { [weak self] points in
            self?.enqueueLocations(points)
        }
        location.onHomePresence = { [weak self] state in
            Task { await self?.postHomePresence(state) }
        }
    }

    private func ensureHomeConfigured() {
        if !location.homeIsSet {
            _ = location.setHomeFromCurrentFix()
        }
        if let placeID = location.homePlaceID {
            Task {
                try? await client.setHomePlace(placeID: placeID, label: location.homeLabel)
            }
        }
    }

    private func syncHomePresenceMonitoring() {
        let grantsPresence = circle.contains(where: \.outboundPresenceGranted)
        let hasPromise = circle.contains { member in
            guard let promise = member.promise else { return false }
            return promise.youAreSubject && (promise.status == .active || promise.status == .overdue || promise.status == .noSignal)
        }
        let shouldMonitor = location.homeIsSet && (grantsPresence || hasPromise)
        location.setHomeMonitoring(shouldMonitor)
    }

    private func postHomePresence(_ state: HomePresenceKind) async {
        guard auth.isAuthenticated else { return }
        do {
            try await client.postHomePresence(state: state)
        } catch {
            // Offline — next transition or refresh will catch up.
        }
    }

    private func syncLocationSharing() {
        location.setSharing(isSharingLocation)
        if isSharingLocation, let point = location.lastFix {
            enqueueLocations([point])
        } else if !isSharingLocation {
            ingestStore.clear()
        }
    }

    private func enqueueLocations(_ points: [LocationPoint]) {
        guard isSharingLocation, location.hasAccess, !points.isEmpty else { return }
        ingestStore.append(points)
        ingestFlushTask?.cancel()
        ingestFlushTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 800_000_000)
            guard !Task.isCancelled else { return }
            await self?.flushIngestQueue()
        }
    }

    private func flushIngestQueue() async {
        guard isSharingLocation, location.hasAccess, auth.isAuthenticated, !isFlushingIngest else { return }
        let pending = ingestStore.points
        guard !pending.isEmpty else { return }
        isFlushingIngest = true
        defer { isFlushingIngest = false }
        let device = UIDevice.current
        do {
            try await client.ingest(
                points: pending,
                battery: Int(device.batteryLevel * 100),
                charging: device.batteryState == .charging || device.batteryState == .full
            )
            ingestStore.removePrefix(pending.count)
        } catch TrustClientError.unauthorized {
            signOut()
        } catch {
            // Keep pending points; the next fix or refresh retries.
        }
    }
}
