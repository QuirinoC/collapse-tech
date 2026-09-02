import Foundation

@MainActor
public final class DemoTrustService: ObservableObject {
    @Published public private(set) var you: Person
    @Published public private(set) var partner: Person?
    @Published public private(set) var pair: TrustPair?
    @Published public var previewAsPartner = false
    @Published public private(set) var presenceYou: PresenceSnapshot
    @Published public private(set) var presencePartner: PresenceSnapshot?
    @Published public private(set) var lookLog: [LookEvent] = []
    @Published public private(set) var activeSession: LookSession?
    @Published public private(set) var lastReceipt: LookReceipt?
    @Published public private(set) var lastPlacePing: LookReceipt?
    @Published public private(set) var extraPeople: [Person] = []
    @Published public private(set) var pendingInviteName: String = "Jordan"
    @Published public private(set) var inboundLive: Set<UUID> = []

    private var youVault = EscrowVault()
    private var partnerVault = EscrowVault()
    private var extraVaults: [UUID: EscrowVault] = [:]
    private var extraPresence: [UUID: PresenceSnapshot] = [:]
    @Published private var shares: [UUID: PersonShareState] = [:]
    private var tickPhase: Double = 0
    private let clock: TrustClock

    public init(clock: TrustClock = SystemClock(), displayName: String = "Sam") {
        self.clock = clock
        let now = clock.now()
        you = Person(displayName: displayName)
        presenceYou = PresenceSnapshot(
            lastActiveAt: now.addingTimeInterval(-90),
            batteryPercent: 81,
            isCharging: false
        )
    }

    public var actingAs: Person {
        if previewAsPartner, let partner {
            return partner
        }
        return you
    }

    public var counterpart: Person? {
        if previewAsPartner {
            return you
        }
        return partner
    }

    public var actingPresence: PresenceSnapshot {
        if previewAsPartner {
            return presencePartner ?? presenceYou
        }
        return presenceYou
    }

    /// Presence of the person you are paired with (not you). Never includes coordinates.
    public var counterpartPresence: PresenceSnapshot? {
        if previewAsPartner {
            return presenceYou
        }
        return presencePartner
    }

    public var isWatching: Bool {
        guard let session = activeSession else { return false }
        return session.event.viewerID == actingAs.id
    }

    public var isBeingWatched: Bool {
        guard let session = activeSession else { return false }
        return session.event.subjectID == actingAs.id
    }

    public var pairIsActive: Bool {
        pair?.status == .active && partner != nil
    }

    public var coverage: CircleCoverage {
        let sponsor: Person?
        if you.hasPro {
            sponsor = you
        } else if let partner, partner.hasPro {
            sponsor = partner
        } else {
            sponsor = nil
        }
        return CircleCoverage(
            isCovered: sponsor != nil,
            sponsorName: sponsor?.displayName,
            actingIsSponsor: sponsor?.id == actingAs.id
        )
    }

    public var trustedCount: Int {
        (partner == nil ? 0 : 1) + extraPeople.count
    }

    public var circle: [TrustedPerson] {
        var members: [TrustedPerson] = []
        if let partner {
            members.append(trustedPerson(from: partner, presence: presencePartner))
        }
        for person in extraPeople {
            members.append(trustedPerson(from: person, presence: extraPresence[person.id]))
        }
        return members
    }

    public func shareState(for personID: UUID) -> PersonShareState {
        expireTimedShares()
        return shares[personID] ?? PersonShareState()
    }

    public func isLocationVisible(_ personID: UUID) -> Bool {
        if inboundLive.contains(personID) { return true }
        if let session = activeSession, session.event.subjectID == personID { return true }
        return false
    }

    /// Coordinates only when this person is already visible to you — never a sealed peek.
    public func sharedLivePoint(for personID: UUID) -> LocationPoint? {
        guard isLocationVisible(personID) else { return nil }
        return vault(for: personID).latest(now: clock.now())
    }

    public var visibleLookLog: [LookEvent] {
        let cutoff = clock.now().addingTimeInterval(
            -TimeInterval(coverage.lookLogRetentionDays * 86_400)
        )
        return lookLog.filter { $0.at >= cutoff }.sorted { $0.at > $1.at }
    }

    public var retainedLookLogCount: Int {
        max(0, lookLog.count - visibleLookLog.count)
    }

    public func setPro(personID: UUID, enabled: Bool) {
        if you.id == personID {
            you.hasPro = enabled
        } else if partner?.id == personID {
            partner?.hasPro = enabled
        }
    }

    public func renameYou(_ name: String) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        you.displayName = trimmed
    }

    public func startDemoPair(partnerName: String = "Jordan") {
        let now = clock.now()
        partner = Person(displayName: partnerName)
        pair = TrustPair(
            inviteCode: Self.makeInviteCode(),
            status: .active,
            createdAt: now
        )
        presencePartner = PresenceSnapshot(
            lastActiveAt: now.addingTimeInterval(-4 * 60),
            batteryPercent: 64,
            isCharging: false,
            gotHomeAt: now.addingTimeInterval(-40 * 60)
        )
        seedVaults(now: now)
        extraPeople = []
        extraVaults = [:]
        extraPresence = [:]
        shares = [:]
        inboundLive = []
        if let partner {
            shares[partner.id] = PersonShareState()
        }
        previewAsPartner = false
        activeSession = nil
        lastReceipt = nil
        lastPlacePing = nil
    }

    public func startReviewCircle() {
        startDemoPair(partnerName: "Alex")
        you.hasPro = true
        addReviewMember(name: "Jordan", resting: .always, inboundLive: true)
        if let riley = addReviewMember(name: "Riley", resting: .untilTheyLook, inboundLive: false) {
            shares[riley.id] = PersonShareState(
                resting: .untilTheyLook,
                timedUntil: clock.now().addingTimeInterval(47 * 60)
            )
        }
    }

    public func recordLookForTesting(_ event: LookEvent) {
        lookLog.append(event)
    }

    public func createInvite() {
        pair = TrustPair(
            inviteCode: Self.makeInviteCode(),
            status: .pending,
            createdAt: clock.now()
        )
        partner = nil
        presencePartner = nil
        activeSession = nil
    }

    public func simulatePartnerJoining(name: String? = nil) throws {
        guard let pair, pair.status == .pending else {
            throw PairingError.alreadyPaired
        }
        startDemoPair(partnerName: name ?? pendingInviteName)
    }

    public func joinInvite(code: String, partnerName: String = "Jordan") throws {
        let normalized = code.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        guard let pair else { throw PairingError.invalidCode }
        guard pair.inviteCode == normalized else { throw PairingError.invalidCode }
        startDemoPair(partnerName: partnerName)
    }

    public func looksToday(for viewerID: UUID) -> Int {
        let start = Calendar.current.startOfDay(for: clock.now())
        return lookLog.filter { $0.viewerID == viewerID && $0.at >= start }.count
    }

    public func confirmCopy(for personID: UUID? = nil) -> (title: String, body: String) {
        let subject = resolvedSubject(personID)?.displayName ?? counterpart?.displayName ?? "them"
        return (
            TrustCopy.confirmTitle(subject: subject),
            TrustCopy.confirmBody(subject: subject, looksToday: looksToday(for: actingAs.id))
        )
    }

    public func setUntilTheyLook(personID: UUID) {
        shares[personID] = PersonShareState(resting: .untilTheyLook, timedUntil: nil)
    }

    public func setAlways(personID: UUID) {
        shares[personID] = PersonShareState(resting: .always, timedUntil: nil)
    }

    public func setTimedShare(personID: UUID, duration: TimedShareDuration) {
        expireTimedShares()
        let current = shares[personID] ?? PersonShareState()
        let resting: ShareRestingMode
        switch current.presentation(at: clock.now()) {
        case .always:
            resting = .always
        case .untilTheyLook, .timed(_, .untilTheyLook):
            resting = .untilTheyLook
        case .timed(_, .always):
            resting = .always
        }
        shares[personID] = PersonShareState(
            resting: resting,
            timedUntil: duration.endDate(from: clock.now())
        )
    }

    public func expireTimedShares() {
        let now = clock.now()
        for (id, state) in shares {
            if let until = state.timedUntil, until <= now {
                shares[id] = PersonShareState(resting: state.resting, timedUntil: nil)
            }
        }
    }

    public func breakTrust(confirmed: Bool, subjectID: UUID? = nil) throws -> LookSession {
        guard confirmed else { throw LookError.confirmationRequired }
        guard pairIsActive else { throw LookError.pairInactive }
        guard let subject = resolvedSubject(subjectID) else { throw LookError.pairInactive }
        if let session = activeSession,
           session.event.viewerID == actingAs.id,
           session.event.subjectID == subject.id {
            return session
        }

        let now = clock.now()
        let vault = vault(for: subject.id)
        let trail = vault.unlock(now: now, window: EscrowVault.defaultHistoryWindow)
        guard let live = trail.last ?? vault.latest(now: now) else {
            throw LookError.noPartner
        }

        let event = LookEvent(
            viewerID: actingAs.id,
            viewerName: actingAs.displayName,
            subjectID: subject.id,
            subjectName: subject.displayName,
            at: now,
            historyWindowHours: TrustCopy.historyHours,
            includedLive: true
        )
        lookLog.append(event)
        let session = LookSession(event: event, live: live, trail: trail)
        activeSession = session
        lastReceipt = LookReceipt(
            title: TrustCopy.receiptTitle(viewer: actingAs.displayName),
            body: TrustCopy.receiptBody(),
            at: now
        )
        return session
    }

    public func closeLook() {
        activeSession = nil
    }

    /// Pro / covered circle only. Default look stays 2 hours for everyone.
    public func extendActiveLook(hours: Int = CircleCoverage.proHistoryHours) throws {
        guard coverage.canExtendHistory else { throw CircleError.proRequired }
        guard var session = activeSession, session.event.viewerID == actingAs.id else {
            throw LookError.pairInactive
        }
        let now = clock.now()
        let trail = vault(for: session.event.subjectID)
            .unlock(now: now, window: TimeInterval(hours * 3600))
        guard let live = trail.last else { throw LookError.noPartner }
        session.trail = trail
        session.live = live
        session.event.historyWindowHours = hours
        activeSession = session
    }

    public func sendPlacePing() throws {
        guard coverage.hasPlacePings else { throw CircleError.proRequired }
        let now = clock.now()
        if previewAsPartner {
            presencePartner?.gotHomeAt = now
            presencePartner?.lastActiveAt = now
        } else {
            presenceYou.gotHomeAt = now
            presenceYou.lastActiveAt = now
        }
        lastPlacePing = LookReceipt(
            title: "\(actingAs.displayName) arrived home",
            body: "Place ping — no map was opened.",
            at: now
        )
    }

    public func addExtraPerson(name: String = "Riley") throws {
        guard coverage.isCovered else { throw CircleError.proRequired }
        guard trustedCount < coverage.trustedPeopleLimit else { throw CircleError.seatLimitReached }
        _ = addReviewMember(name: name, resting: .untilTheyLook, inboundLive: false)
    }

    public func checkIn() {
        let now = clock.now()
        if previewAsPartner {
            presencePartner?.checkedInAt = now
            presencePartner?.lastActiveAt = now
        } else {
            presenceYou.checkedInAt = now
            presenceYou.lastActiveAt = now
        }
    }

    public func ingest(personID: UUID, point: LocationPoint) {
        vault(for: personID).ingest(point)
        if personID == you.id {
            presenceYou.lastActiveAt = point.timestamp
            if LocationTrail.isNearHome(point) {
                presenceYou.gotHomeAt = point.timestamp
            }
        } else if personID == partner?.id {
            presencePartner?.lastActiveAt = point.timestamp
            if LocationTrail.isNearHome(point) {
                presencePartner?.gotHomeAt = point.timestamp
            }
        } else if extraPresence[personID] != nil {
            extraPresence[personID]?.lastActiveAt = point.timestamp
            if LocationTrail.isNearHome(point) {
                extraPresence[personID]?.gotHomeAt = point.timestamp
            }
        }
        refreshSessionIfNeeded(now: point.timestamp)
    }

    public func tickSimulator() {
        let now = clock.now()
        tickPhase += 0.35
        let youLive = youVault.latest(now: now) ?? LocationTrail.home
        ingest(
            personID: you.id,
            point: LocationTrail.step(youLive, at: now, phase: tickPhase)
        )
        if let partner {
            let partnerLive = partnerVault.latest(now: now) ?? LocationTrail.home
            ingest(
                personID: partner.id,
                point: LocationTrail.step(partnerLive, at: now, phase: tickPhase + 1.2)
            )
        }
        expireTimedShares()
        var extraPhase = 2.1
        for person in extraPeople {
            let live = extraVaults[person.id]?.latest(now: now) ?? LocationTrail.home
            ingest(
                personID: person.id,
                point: LocationTrail.step(live, at: now, phase: tickPhase + extraPhase)
            )
            extraPhase += 0.8
        }
    }

    public func revoke() {
        activeSession = nil
        youVault.destroyGrant()
        partnerVault.destroyGrant()
        pair?.status = .revoked
        lastReceipt = nil
    }

    public func resetPairing() {
        previewAsPartner = false
        partner = nil
        pair = nil
        presencePartner = nil
        lookLog = []
        extraPeople = []
        extraVaults = [:]
        extraPresence = [:]
        shares = [:]
        inboundLive = []
        activeSession = nil
        lastReceipt = nil
        lastPlacePing = nil
        youVault.replaceGrant()
        partnerVault.replaceGrant()
    }

    public func peekEscrow(for personID: UUID) -> [LocationPoint] {
        vault(for: personID).peekPlaintext()
    }

    public func lookLogExportText() -> String {
        lookLog.map { event in
            let live = event.includedLive ? "live" : "no live"
            return "\(event.at.ISO8601Format())\t\(event.viewerName) looked at \(event.subjectName)\t\(live) + last \(event.historyWindowHours)h"
        }
        .joined(separator: "\n")
    }

    private func vault(for personID: UUID) -> EscrowVault {
        if personID == you.id { return youVault }
        if personID == partner?.id { return partnerVault }
        if let extra = extraVaults[personID] { return extra }
        let created = EscrowVault()
        extraVaults[personID] = created
        return created
    }

    private func resolvedSubject(_ personID: UUID?) -> Person? {
        if previewAsPartner { return you }
        if let personID {
            if let partner, partner.id == personID { return partner }
            return extraPeople.first { $0.id == personID }
        }
        return counterpart
    }

    @discardableResult
    private func addReviewMember(
        name: String,
        resting: ShareRestingMode,
        inboundLive: Bool
    ) -> Person? {
        let person = Person(displayName: name)
        extraPeople.append(person)
        let now = clock.now()
        extraPresence[person.id] = PresenceSnapshot(
            lastActiveAt: now.addingTimeInterval(-180),
            batteryPercent: 58,
            isCharging: true
        )
        shares[person.id] = PersonShareState(resting: resting)
        if inboundLive {
            self.inboundLive.insert(person.id)
        }
        let vault = EscrowVault()
        extraVaults[person.id] = vault
        let origin = LocationPoint(
            timestamp: now,
            latitude: LocationTrail.home.latitude + 0.003,
            longitude: LocationTrail.home.longitude + 0.004
        )
        for point in LocationTrail.seed(around: origin, now: now, hours: 24, intervalMinutes: 15, drift: 0.0007) {
            vault.ingest(point)
        }
        return person
    }

    private func trustedPerson(from person: Person, presence: PresenceSnapshot?) -> TrustedPerson {
        expireTimedShares()
        let visible = isLocationVisible(person.id)
        return TrustedPerson(
            person: person,
            presence: presence ?? PresenceSnapshot(
                lastActiveAt: clock.now().addingTimeInterval(-600),
                batteryPercent: 70,
                isCharging: false
            ),
            share: shares[person.id] ?? PersonShareState(),
            inboundLive: visible,
            livePoint: visible ? vault(for: person.id).latest(now: clock.now()) : nil
        )
    }

    private func seedVaults(now: Date) {
        youVault.replaceGrant()
        partnerVault.replaceGrant()
        let youOrigin = LocationPoint(
            timestamp: now,
            latitude: LocationTrail.home.latitude + 0.006,
            longitude: LocationTrail.home.longitude - 0.004
        )
        for point in LocationTrail.seed(around: youOrigin, now: now, hours: 24, intervalMinutes: 15, drift: 0.0004) {
            youVault.ingest(point)
        }
        for point in LocationTrail.seed(around: LocationTrail.home, now: now, hours: 24, intervalMinutes: 15) {
            partnerVault.ingest(point)
        }
    }

    private func refreshSessionIfNeeded(now: Date) {
        guard var session = activeSession else { return }
        let window = TimeInterval(max(session.event.historyWindowHours, 2) * 3600)
        let vault = vault(for: session.event.subjectID)
        let trail = vault.unlock(now: now, window: window)
        guard let live = trail.last else { return }
        session.live = live
        session.trail = trail
        activeSession = session
    }

    private static func makeInviteCode() -> String {
        let alphabet = Array("ABCDEFGHJKLMNPQRSTUVWXYZ23456789")
        return String((0..<6).map { _ in alphabet.randomElement()! })
    }
}
