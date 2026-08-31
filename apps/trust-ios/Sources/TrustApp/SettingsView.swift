import StoreKit
import SwiftUI
import TrustCore

struct SettingsView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.trustPalette) private var palette
    @State private var revokeTarget: Person?
    @State private var showingDeleteAccount = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    Text(TrustCopy.appName)
                        .font(TrustTheme.display(28))
                        .foregroundStyle(palette.ink)
                    Text(model.signedInSummary)
                        .font(TrustTheme.ui(14))
                        .foregroundStyle(palette.muted)

                    appearanceCard
                    circleCard
                    membersCard
                    locationCard
                    moreCard

                    TrustWordmark()
                        .padding(.top, 12)
                }
                .padding(20)
            }
            .background(palette.paper.ignoresSafeArea())
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { model.showingSettings = false }
                        .font(TrustTheme.folio(12))
                        .tracking(1)
                        .textCase(.uppercase)
                        .foregroundStyle(palette.ink)
                }
            }
        }
        .confirmationDialog(
            "Revoke this person immediately?",
            isPresented: Binding(
                get: { revokeTarget != nil },
                set: { if !$0 { revokeTarget = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Revoke", role: .destructive) {
                if let person = revokeTarget {
                    model.revoke(person)
                }
                revokeTarget = nil
            }
        }
        .confirmationDialog(
            "Delete your Trust Circle account? Location, looks, and circle membership are removed. This cannot be undone.",
            isPresented: $showingDeleteAccount,
            titleVisibility: .visible
        ) {
            Button("Delete account", role: .destructive) {
                Task { await model.deleteAccount() }
            }
        }
        .task {
            await model.store.loadProducts()
            if let signed = await model.store.refreshEntitlement() {
                await model.syncCircleEntitlement(signedTransactionInfo: signed)
            } else {
                await model.syncCircleEntitlement()
            }
        }
    }

    private var appearanceCard: some View {
        TrustSurface {
            VStack(alignment: .leading, spacing: 12) {
                sectionTitle("Edition")
                Toggle(isOn: model.nightEditionBinding) {
                    Text("Night Edition")
                        .font(TrustTheme.ui(15))
                        .foregroundStyle(palette.ink)
                }
                .tint(palette.accent)
                Text("Paper is the default: white sheet, black streets, one red verb.")
                    .font(TrustTheme.ui(13))
                    .foregroundStyle(palette.muted)
            }
        }
    }

    private var circleCard: some View {
        TrustSurface {
            VStack(alignment: .leading, spacing: 12) {
                TrustFolio(text: TrustCopy.appName)
                sectionTitle(model.coverage.isCovered ? "Circle" : "Get Circle")
                Text(subscriptionNote)
                    .font(TrustTheme.ui(14))
                    .foregroundStyle(palette.muted)

                benefit("Free", "One person, Look, last 2 hours, quiet receipts, 30-day log.")
                benefit("Circle", "More people, 24-hour history, place pings, year-long log + export. One seat covers the unpaid partner.")

                if let banner = model.coverage.banner {
                    TrustFolio(text: banner, color: palette.accent, size: 10)
                }

                if !model.store.hasCircleAccess {
                    ForEach(model.store.products) { product in
                        Button {
                            Task { await model.purchase(product) }
                        } label: {
                            Text(product.id == AppConfiguration.monthlyProductID
                                 ? "Circle monthly — \(product.displayPrice)"
                                 : "Circle annual — \(product.displayPrice)")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(TrustFilledButtonStyle())
                        .disabled(model.store.isWorking)
                    }
                    if model.store.products.isEmpty {
                        Text("Circle \(AppConfiguration.monthlyDisplayPrice)/mo or \(AppConfiguration.annualDisplayPrice)/yr. 7-day trial.")
                            .font(TrustTheme.ui(13))
                            .foregroundStyle(palette.muted)
                    }
                    Text("Circle is an auto-renewing subscription. Payment is charged to your Apple ID at confirmation. It renews unless you cancel at least 24 hours before the period ends. Family Sharing is off. We do not sell location.")
                        .font(TrustTheme.ui(13))
                        .foregroundStyle(palette.muted)
                    HStack(spacing: 6) {
                        Link("Privacy", destination: AppConfiguration.privacyURL)
                        Text("·")
                        Link("Terms", destination: AppConfiguration.termsURL)
                    }
                    .font(TrustTheme.folio(11))
                    .foregroundStyle(palette.muted)
                    if model.snapshot?.allowsReviewUnlock == true {
                        Button("Unlock Circle for review") {
                            model.unlockCircleForReview()
                        }
                        .buttonStyle(TrustOutlineButtonStyle(compact: true))
                    }
                }

                Button("Restore purchases") {
                    Task {
                        if let signed = await model.store.restorePurchases() {
                            await model.syncCircleEntitlement(signedTransactionInfo: signed)
                        }
                    }
                }
                .buttonStyle(TrustTextButtonStyle())
                .disabled(model.store.isWorking)

                if model.store.hasCircleAccess {
                    Link("Manage subscription", destination: StoreManager.manageSubscriptionsURL)
                        .font(TrustTheme.folio(11))
                        .foregroundStyle(palette.muted)
                }

                if model.store.linkedToAnotherAccount {
                    Text("This Apple subscription is linked to another Trust Circle account. Contact hello@collapsetechnologies.com.")
                        .font(TrustTheme.ui(13))
                        .foregroundStyle(palette.accent)
                }

                if let error = model.store.errorMessage, !error.isEmpty {
                    Text(error)
                        .font(TrustTheme.ui(13))
                        .foregroundStyle(palette.accent)
                }
            }
        }
    }

    private var membersCard: some View {
        TrustSurface {
            VStack(alignment: .leading, spacing: 0) {
                sectionTitle("Circle members")
                    .padding(.bottom, 8)
                stateRow("You", model.you.displayName)
                stateRow("Trusted", "\(model.circle.count) / \(model.coverage.trustedPeopleLimit)")
                stateRow("Plan", model.coverage.isCovered ? "Circle" : "Free")
                ForEach(model.circle) { member in
                    HStack {
                        stateRow("Member", member.displayName)
                        Button("Revoke") { revokeTarget = member.person }
                            .font(TrustTheme.folio(10))
                            .foregroundStyle(palette.accent)
                    }
                }
                Text("Invite from the map. Free is one trusted person. Circle adds seats. Looking does not need Circle.")
                    .font(TrustTheme.ui(13))
                    .foregroundStyle(palette.muted)
                    .padding(.top, 10)
            }
        }
    }

    private var locationCard: some View {
        TrustSurface {
            VStack(alignment: .leading, spacing: 12) {
                sectionTitle("Location")
                Text(locationPurposeCopy)
                    .font(TrustTheme.ui(14))
                    .foregroundStyle(palette.muted)
                stateRow("Permission", model.location.statusLabel)
                stateRow("Accuracy", model.location.accuracyLabel)
                stateRow("Sharing", model.isSharingLocation ? "On" : "Off")
                stateRow("Ingest", model.isSharingLocation && model.location.hasAccess ? "On" : "Off")
                stateRow("Feed", model.location.isUsingSimulatorFeed ? "Waiting" : "Device")

                if model.location.isDenied {
                    Text(TrustCopy.locationDeniedBody)
                        .font(TrustTheme.ui(13))
                        .foregroundStyle(palette.muted)
                    Button("Open iOS Settings") {
                        model.openSystemSettings()
                    }
                    .buttonStyle(TrustOutlineButtonStyle(compact: true))
                } else {
                    Button("Allow while using") {
                        model.requestWhenInUseLocation()
                    }
                    .buttonStyle(TrustOutlineButtonStyle(compact: true))
                    Button("Allow always") {
                        if model.location.needsSystemSettings {
                            model.openSystemSettings()
                        } else {
                            model.requestAlwaysLocation()
                        }
                    }
                    .buttonStyle(TrustOutlineButtonStyle(compact: true))
                }

                if model.location.hasAccess && !model.location.isPrecise {
                    Text(TrustCopy.locationReducedAccuracy)
                        .font(TrustTheme.ui(13))
                        .foregroundStyle(palette.muted)
                    Button("Allow precise location") {
                        model.requestPreciseLocation()
                    }
                    .buttonStyle(TrustOutlineButtonStyle(compact: true))
                }

                Button("Allow quiet receipts") {
                    Task { await model.requestNotifications() }
                }
                .buttonStyle(TrustOutlineButtonStyle(compact: true))
            }
        }
    }

    private var locationPurposeCopy: String {
        if model.location.needsAlwaysForSharing && model.location.needsSystemSettings {
            return TrustCopy.keptWhileUsing
        }
        if model.isSharingLocation {
            return TrustCopy.locationAlwaysPurpose
        }
        return TrustCopy.locationWhenInUsePurpose
    }

    private var moreCard: some View {
        TrustSurface {
            VStack(alignment: .leading, spacing: 12) {
                sectionTitle("More")
                Button("Look log") {
                    model.showingLookLog = true
                }
                .buttonStyle(TrustOutlineButtonStyle(compact: true))

                Button(model.coverage.hasPlacePings
                       ? "Place ping — got home"
                       : "Place ping — Circle") {
                    model.sendPlacePing()
                }
                .buttonStyle(TrustOutlineButtonStyle(compact: true))

                Button("Check in") {
                    model.checkIn()
                }
                .buttonStyle(TrustOutlineButtonStyle(compact: true))

                Button("Sign out") {
                    model.signOut()
                }
                .buttonStyle(TrustTextButtonStyle())

                Button("Delete account") {
                    showingDeleteAccount = true
                }
                .buttonStyle(TrustOutlineButtonStyle(compact: true))

                VStack(alignment: .leading, spacing: 8) {
                    Text(TrustCopy.weDoNotSellLocation)
                    HStack(spacing: 6) {
                        Link("Privacy", destination: AppConfiguration.privacyURL)
                        Text("·")
                        Link("Terms", destination: AppConfiguration.termsURL)
                        Text("·")
                        Link("Support", destination: AppConfiguration.supportURL)
                    }
                    #if DEBUG
                    Text("API \(AppConfiguration.apiBaseURL.absoluteString)")
                        .font(TrustTheme.ui(12))
                    #endif
                }
                .font(TrustTheme.ui(13))
                .foregroundStyle(palette.muted)
                .tint(palette.muted)
                .padding(.top, 8)
            }
        }
    }

    private var subscriptionNote: String {
        if model.coverage.isCovered {
            if model.coverage.actingIsSponsor {
                return "You sponsor this circle. Unpaid people do not need to pay to share or look."
            }
            return "\(model.coverage.sponsorName ?? "Your partner")’s Pro covers you. You can share and look without buying Circle."
        }
        if model.store.trialEligibility == .eligible {
            return "7-day trial. Free already includes the 1:1 look. Circle is extras, not a lock on looking."
        }
        return "Free already includes the 1:1 look. Circle is extras: more people, longer history, place pings, full log. One subscription covers two people."
    }

    private func benefit(_ title: String, _ body: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(TrustTheme.label(13))
                .foregroundStyle(palette.ink)
            Text(body)
                .font(TrustTheme.ui(13))
                .foregroundStyle(palette.muted)
        }
    }

    private func stateRow(_ title: String, _ value: String) -> some View {
        HStack {
            Text(title)
                .foregroundStyle(palette.muted)
            Spacer()
            Text(value)
                .foregroundStyle(palette.ink)
        }
        .font(TrustTheme.ui(15))
        .padding(.vertical, 10)
        .overlay(alignment: .bottom) { TrustHairline() }
    }

    private func sectionTitle(_ title: String) -> some View {
        Text(title)
            .font(TrustTheme.display(22))
            .foregroundStyle(palette.ink)
    }
}
