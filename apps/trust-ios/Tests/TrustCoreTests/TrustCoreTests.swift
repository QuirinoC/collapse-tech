import Foundation
import TrustCore
import XCTest

final class EscrowVaultTests: XCTestCase {
    func testPeekNeverReturnsCoordinates() {
        let vault = EscrowVault()
        vault.ingest(
            LocationPoint(timestamp: Date(), latitude: 37.75, longitude: -122.41)
        )
        XCTAssertTrue(vault.peekPlaintext().isEmpty)
        XCTAssertEqual(vault.sealedCount, 1)
    }

    func testUnlockReturnsOnlyTheShortWindow() {
        let vault = EscrowVault()
        let now = Date()
        vault.ingest(LocationPoint(timestamp: now.addingTimeInterval(-3 * 3600), latitude: 1, longitude: 1))
        vault.ingest(LocationPoint(timestamp: now.addingTimeInterval(-90 * 60), latitude: 2, longitude: 2))
        vault.ingest(LocationPoint(timestamp: now.addingTimeInterval(-20 * 60), latitude: 3, longitude: 3))
        vault.ingest(LocationPoint(timestamp: now.addingTimeInterval(-48 * 3600), latitude: 9, longitude: 9))

        let trail = vault.unlock(now: now, window: EscrowVault.defaultHistoryWindow)
        XCTAssertEqual(trail.map(\.latitude), [2, 3])
        XCTAssertEqual(EscrowVault.defaultHistoryWindow, 2 * 60 * 60)
    }

    func testDestroyGrantMakesHistoryUnavailable() {
        let vault = EscrowVault()
        let now = Date()
        vault.ingest(LocationPoint(timestamp: now, latitude: 10, longitude: 10))
        XCTAssertFalse(vault.unlock(now: now).isEmpty)
        vault.destroyGrant()
        XCTAssertTrue(vault.unlock(now: now).isEmpty)
        XCTAssertTrue(vault.peekPlaintext().isEmpty)
    }
}

final class LocationIngestBufferTests: XCTestCase {
    func testBufferKeepsTrailAndDropsOlderThanRetention() {
        var buffer = LocationIngestBuffer()
        let now = Date()
        buffer.append([
            LocationPoint(timestamp: now.addingTimeInterval(-30 * 3600), latitude: 1, longitude: 1),
            LocationPoint(timestamp: now.addingTimeInterval(-90 * 60), latitude: 2, longitude: 2),
            LocationPoint(timestamp: now.addingTimeInterval(-10 * 60), latitude: 3, longitude: 3)
        ], now: now)
        XCTAssertEqual(buffer.points.map(\.latitude), [2, 3])
        buffer.removePrefix(1)
        XCTAssertEqual(buffer.points.map(\.latitude), [3])
    }
}

final class LookServiceTests: XCTestCase {
    @MainActor
    func testLookRequiresConfirmAndAppendsLog() throws {
        let service = DemoTrustService(displayName: "Sam")
        service.startDemoPair(partnerName: "Jordan")

        XCTAssertThrowsError(try service.breakTrust(confirmed: false)) { error in
            XCTAssertEqual(error as? LookError, .confirmationRequired)
        }
        XCTAssertTrue(service.lookLog.isEmpty)
        XCTAssertTrue(service.peekEscrow(for: service.partner!.id).isEmpty)

        let session = try service.breakTrust(confirmed: true)
        XCTAssertEqual(session.event.viewerName, "Sam")
        XCTAssertEqual(session.event.subjectName, "Jordan")
        XCTAssertTrue(session.event.includedLive)
        XCTAssertEqual(session.event.historyWindowHours, 2)
        XCTAssertFalse(session.trail.isEmpty)
        XCTAssertEqual(service.lookLog.count, 1)

        let oldest = session.trail.first!
        XCTAssertLessThanOrEqual(
            session.event.at.timeIntervalSince(oldest.timestamp),
            EscrowVault.defaultHistoryWindow + 1
        )
    }

    @MainActor
    func testReceiptCopyIsQuietAndNamesHistory() throws {
        let service = DemoTrustService(displayName: "Sam")
        service.startDemoPair(partnerName: "Jordan")
        _ = try service.breakTrust(confirmed: true)
        XCTAssertEqual(service.lastReceipt?.title, "Sam viewed your location")
        XCTAssertEqual(
            service.lastReceipt?.body,
            "They can see your live location and the last 2 hours of history."
        )
    }

    @MainActor
    func testConfirmCopyStrengthensAfterRepeatedLooks() throws {
        let service = DemoTrustService(displayName: "Sam")
        service.startDemoPair(partnerName: "Jordan")
        XCTAssertFalse(service.confirmCopy().body.contains("times today"))
        _ = try service.breakTrust(confirmed: true)
        service.closeLook()
        _ = try service.breakTrust(confirmed: true)
        service.closeLook()
        XCTAssertTrue(service.confirmCopy().body.contains("2 times today"))
        XCTAssertTrue(service.confirmCopy().body.contains("will be notified immediately"))
        XCTAssertTrue(service.confirmCopy().title.contains("Jordan"))
    }

    @MainActor
    func testClosingRequiresANewConfirmAndRevokeKeepsTheLog() throws {
        let service = DemoTrustService(displayName: "Sam")
        service.startDemoPair(partnerName: "Jordan")
        _ = try service.breakTrust(confirmed: true)
        service.closeLook()
        XCTAssertNil(service.activeSession)

        let again = try service.breakTrust(confirmed: true)
        XCTAssertEqual(service.lookLog.count, 2)
        XCTAssertEqual(again.event.historyWindowHours, 2)

        service.revoke()
        XCTAssertEqual(service.pair?.status, .revoked)
        XCTAssertNil(service.activeSession)
        XCTAssertEqual(service.lookLog.count, 2)
        XCTAssertThrowsError(try service.breakTrust(confirmed: true)) { error in
            XCTAssertEqual(error as? LookError, .pairInactive)
        }
    }

    @MainActor
    func testPresenceHasNoCoordinates() {
        let presence = PresenceSnapshot(
            lastActiveAt: Date(),
            batteryPercent: 64,
            isCharging: false,
            gotHomeAt: Date()
        )
        let keys = Mirror(reflecting: presence).children.compactMap(\.label)
        XCTAssertFalse(keys.contains { $0.lowercased().contains("lat") })
        XCTAssertFalse(keys.contains { $0.lowercased().contains("lon") })
        XCTAssertFalse(keys.contains { $0.lowercased().contains("coord") })
    }

    @MainActor
    func testJoinInviteRequiresMatchingCode() {
        let service = DemoTrustService(displayName: "Sam")
        service.createInvite()
        XCTAssertThrowsError(try service.joinInvite(code: "NOPE")) { error in
            XCTAssertEqual(error as? PairingError, .invalidCode)
        }
        try? service.joinInvite(code: service.pair!.inviteCode)
        XCTAssertEqual(service.pair?.status, .active)
        XCTAssertEqual(service.partner?.displayName, "Jordan")
    }

    @MainActor
    func testFreeLookIsNotPaywalledAndSponsorCoversPartner() throws {
        let service = DemoTrustService(displayName: "Sam")
        service.startDemoPair(partnerName: "Jordan")
        XCTAssertFalse(service.coverage.isCovered)
        XCTAssertEqual(service.coverage.trustedPeopleLimit, 1)
        XCTAssertEqual(service.coverage.lookLogRetentionDays, 30)
        XCTAssertFalse(service.coverage.hasPlacePings)

        _ = try service.breakTrust(confirmed: true)
        XCTAssertEqual(service.activeSession?.event.historyWindowHours, 2)
        service.closeLook()

        XCTAssertThrowsError(try service.extendActiveLook()) { error in
            XCTAssertEqual(error as? CircleError, .proRequired)
        }
        XCTAssertThrowsError(try service.addExtraPerson()) { error in
            XCTAssertEqual(error as? CircleError, .proRequired)
        }

        service.setPro(personID: service.you.id, enabled: true)
        XCTAssertTrue(service.coverage.isCovered)
        XCTAssertTrue(service.coverage.actingIsSponsor)
        XCTAssertEqual(service.coverage.banner, "Your Circle covers this pair")

        service.previewAsPartner = true
        XCTAssertTrue(service.coverage.isCovered)
        XCTAssertFalse(service.coverage.actingIsSponsor)
        XCTAssertEqual(service.coverage.banner, "Sam’s Pro covers this circle")
        XCTAssertFalse(service.actingAs.hasPro)

        _ = try service.breakTrust(confirmed: true)
        try service.extendActiveLook()
        XCTAssertEqual(service.activeSession?.event.historyWindowHours, 24)
        XCTAssertGreaterThan(service.activeSession?.trail.count ?? 0, 8)
    }

    @MainActor
    func testLookLogRetentionAndExtraSeat() throws {
        let service = DemoTrustService(displayName: "Sam")
        service.startDemoPair(partnerName: "Jordan")
        XCTAssertEqual(CircleCoverage.freeLookLogDays, 30)
        XCTAssertFalse(service.coverage.canExportLookLog)

        let recent = LookEvent(
            viewerID: service.you.id,
            viewerName: "Sam",
            subjectID: service.partner!.id,
            subjectName: "Jordan",
            at: Date().addingTimeInterval(-10 * 86_400),
            historyWindowHours: 2,
            includedLive: true
        )
        let old = LookEvent(
            viewerID: service.you.id,
            viewerName: "Sam",
            subjectID: service.partner!.id,
            subjectName: "Jordan",
            at: Date().addingTimeInterval(-40 * 86_400),
            historyWindowHours: 2,
            includedLive: true
        )
        service.recordLookForTesting(recent)
        service.recordLookForTesting(old)
        XCTAssertEqual(service.visibleLookLog.map(\.id), [recent.id])
        XCTAssertEqual(service.retainedLookLogCount, 1)

        service.setPro(personID: service.you.id, enabled: true)
        XCTAssertTrue(service.coverage.canExportLookLog)
        XCTAssertEqual(service.visibleLookLog.count, 2)
        try service.addExtraPerson(name: "Riley")
        XCTAssertEqual(service.trustedCount, 2)
        XCTAssertEqual(service.extraPeople.first?.displayName, "Riley")
    }

    @MainActor
    func testShareDefaultsToUntilTheyLookAndTimedReverts() {
        let service = DemoTrustService(displayName: "Sam")
        service.startDemoPair(partnerName: "Alex")
        let alex = service.partner!.id

        XCTAssertEqual(service.shareState(for: alex).presentation(at: Date()), .untilTheyLook)
        XCTAssertEqual(
            TrustCopy.timedShareSentence(after: "After 1 hour", name: "Alex", revertsToLook: true),
            "After 1 hour, Alex will only see your location if they look — unless you’ve set something else for them."
        )

        service.setAlways(personID: alex)
        XCTAssertEqual(service.shareState(for: alex).presentation(at: Date()), .always)
        service.setTimedShare(personID: alex, duration: .hour)
        if case .timed(_, let revert) = service.shareState(for: alex).presentation(at: Date()) {
            XCTAssertEqual(revert, .always)
        } else {
            XCTFail("expected timed overlay on Always")
        }
        XCTAssertTrue(
            TrustCopy.timedShareSentence(after: "After 1 hour", name: "Alex", revertsToLook: false)
                .contains("goes back to Always")
        )

        service.setUntilTheyLook(personID: alex)
        service.setTimedShare(personID: alex, duration: .hour)
        if case .timed(_, let revert) = service.shareState(for: alex).presentation(at: Date()) {
            XCTAssertEqual(revert, .untilTheyLook)
        } else {
            XCTFail("expected timed overlay on Until they look")
        }
    }

    @MainActor
    func testReviewCircleSeedsShareModes() {
        let service = DemoTrustService(displayName: "Sam")
        service.startReviewCircle()
        XCTAssertEqual(service.partner?.displayName, "Alex")
        XCTAssertEqual(service.circle.count, 3)
        XCTAssertEqual(service.shareState(for: service.partner!.id).presentation(at: Date()), .untilTheyLook)
        let jordan = service.extraPeople.first { $0.displayName == "Jordan" }!
        XCTAssertEqual(service.shareState(for: jordan.id).presentation(at: Date()), .always)
        let riley = service.extraPeople.first { $0.displayName == "Riley" }!
        if case .timed = service.shareState(for: riley.id).presentation(at: Date()) {
            XCTAssertTrue(service.shareState(for: riley.id).chipLabel(at: Date()).contains("m"))
        } else {
            XCTFail("Riley should be on a timed share")
        }
    }
}

final class LocationSharingTests: XCTestCase {
    func testEmptyCircleIsNotSharing() {
        XCTAssertFalse(OutboundLocationSharing.isActive(trustedCount: 0))
        XCTAssertTrue(OutboundLocationSharing.isActive(trustedCount: 1))
    }

    func testLocationPurposeStringsAreEscrowVoice() {
        XCTAssertTrue(TrustCopy.locationWhenInUsePurpose.contains("while the app is open"))
        XCTAssertTrue(TrustCopy.locationWhenInUsePurpose.contains("does not sell"))
        XCTAssertFalse(TrustCopy.locationWhenInUsePurpose.lowercased().contains("emergency"))
        XCTAssertFalse(TrustCopy.locationWhenInUsePurpose.lowercased().contains("family"))
        XCTAssertTrue(TrustCopy.locationAlwaysPurpose.contains("escrow"))
        XCTAssertTrue(TrustCopy.locationAlwaysPurpose.contains("background"))
        XCTAssertTrue(TrustCopy.locationAlwaysPurpose.contains("does not sell"))
        XCTAssertFalse(TrustCopy.locationAlwaysPurpose.lowercased().contains("emergency"))
        XCTAssertFalse(TrustCopy.locationAlwaysPurpose.lowercased().contains("family"))
        XCTAssertTrue(TrustCopy.locationPrecisePurpose.contains("precise"))
    }
}
