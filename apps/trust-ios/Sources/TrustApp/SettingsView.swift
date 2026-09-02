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
            .navigationTitle(TrustCopy.settings)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(TrustCopy.done) { model.showingSettings = false }
                        .font(TrustTheme.folio(12))
                        .tracking(1)
                        .textCase(.uppercase)
                        .foregroundStyle(palette.ink)
                }
            }
        }
        .confirmationDialog(
            TrustCopy.revokePersonConfirm,
            isPresented: Binding(
                get: { revokeTarget != nil },
                set: { if !$0 { revokeTarget = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button(TrustCopy.revoke, role: .destructive) {
                if let person = revokeTarget {
                    model.revoke(person)
                }
                revokeTarget = nil
            }
        }
        .confirmationDialog(
            TrustCopy.deleteAccountConfirm,
            isPresented: $showingDeleteAccount,
            titleVisibility: .visible
        ) {
            Button(TrustCopy.deleteAccount, role: .destructive) {
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
                sectionTitle(TrustCopy.edition)
                Toggle(isOn: model.nightEditionBinding) {
                    Text(TrustCopy.nightEdition)
                        .font(TrustTheme.ui(15))
                        .foregroundStyle(palette.ink)
                }
                .tint(palette.accent)
                Text(TrustCopy.paperDefaultNote)
                    .font(TrustTheme.ui(13))
                    .foregroundStyle(palette.muted)
            }
        }
    }

    private var circleCard: some View {
        TrustSurface {
            VStack(alignment: .leading, spacing: 12) {
                TrustFolio(text: TrustCopy.appName)
                sectionTitle(model.coverage.isCovered ? TrustCopy.circle : TrustCopy.getCircle)
                Text(subscriptionNote)
                    .font(TrustTheme.ui(14))
                    .foregroundStyle(palette.muted)

                benefit(TrustCopy.free, TrustCopy.benefitFree)
                benefit(TrustCopy.circle, TrustCopy.benefitCircle)

                if let banner = model.coverage.banner {
                    TrustFolio(text: banner, color: palette.accent, size: 10)
                }

                if !model.store.hasCircleAccess {
                    ForEach(model.store.products) { product in
                        Button {
                            Task { await model.purchase(product) }
                        } label: {
                            Text(product.id == AppConfiguration.monthlyProductID
                                 ? TrustCopy.circleMonthly(price: product.displayPrice)
                                 : TrustCopy.circleAnnual(price: product.displayPrice))
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(TrustFilledButtonStyle())
                        .disabled(model.store.isWorking)
                    }
                    if model.store.products.isEmpty {
                        Text(TrustCopy.circlePriceFallback(
                            monthly: AppConfiguration.monthlyDisplayPrice,
                            annual: AppConfiguration.annualDisplayPrice
                        ))
                            .font(TrustTheme.ui(13))
                            .foregroundStyle(palette.muted)
                    }
                    Text(TrustCopy.circleLegal)
                        .font(TrustTheme.ui(13))
                        .foregroundStyle(palette.muted)
                    HStack(spacing: 6) {
                        Link(TrustCopy.privacy, destination: AppConfiguration.privacyURL)
                        Text("·")
                        Link(TrustCopy.terms, destination: AppConfiguration.termsURL)
                    }
                    .font(TrustTheme.folio(11))
                    .foregroundStyle(palette.muted)
                    if model.snapshot?.allowsReviewUnlock == true {
                        Button(TrustCopy.unlockCircleForReview) {
                            model.unlockCircleForReview()
                        }
                        .buttonStyle(TrustOutlineButtonStyle(compact: true))
                    }
                }

                Button(TrustCopy.restorePurchases) {
                    Task {
                        if let signed = await model.store.restorePurchases() {
                            await model.syncCircleEntitlement(signedTransactionInfo: signed)
                        }
                    }
                }
                .buttonStyle(TrustTextButtonStyle())
                .disabled(model.store.isWorking)

                if model.store.hasCircleAccess {
                    Link(TrustCopy.manageSubscription, destination: StoreManager.manageSubscriptionsURL)
                        .font(TrustTheme.folio(11))
                        .foregroundStyle(palette.muted)
                }

                if model.store.linkedToAnotherAccount {
                    Text(TrustCopy.subscriptionLinked)
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
                sectionTitle(TrustCopy.circleMembers)
                    .padding(.bottom, 8)
                stateRow(TrustCopy.you, model.you.identity)
                stateRow(TrustCopy.trusted, "\(model.circle.count) / \(model.coverage.trustedPeopleLimit)")
                stateRow(TrustCopy.plan, model.coverage.isCovered ? TrustCopy.circle : TrustCopy.free)
                ForEach(model.circle) { member in
                    HStack {
                        stateRow(TrustCopy.member, member.displayName)
                        Button(TrustCopy.revoke) { revokeTarget = member.person }
                            .font(TrustTheme.folio(10))
                            .foregroundStyle(palette.accent)
                    }
                }
                Text(TrustCopy.inviteFromMap)
                    .font(TrustTheme.ui(13))
                    .foregroundStyle(palette.muted)
                    .padding(.top, 10)
            }
        }
    }

    private var locationCard: some View {
        TrustSurface {
            VStack(alignment: .leading, spacing: 12) {
                sectionTitle(TrustCopy.location)
                Text(locationPurposeCopy)
                    .font(TrustTheme.ui(14))
                    .foregroundStyle(palette.muted)
                stateRow(TrustCopy.permission, model.location.statusLabel)
                stateRow(TrustCopy.accuracy, model.location.accuracyLabel)
                stateRow(TrustCopy.sharing, model.isSharingLocation ? TrustCopy.on : TrustCopy.off)
                stateRow(TrustCopy.ingest, model.isSharingLocation && model.location.hasAccess ? TrustCopy.on : TrustCopy.off)
                stateRow(TrustCopy.feed, model.location.isUsingSimulatorFeed ? TrustCopy.waiting : TrustCopy.device)
                stateRow(TrustCopy.homeChip, model.location.homeIsSet ? TrustCopy.on : TrustCopy.off)

                if model.location.isDenied {
                    Text(TrustCopy.locationDeniedBody)
                        .font(TrustTheme.ui(13))
                        .foregroundStyle(palette.muted)
                    Button(TrustCopy.openIOSSettings) {
                        model.openSystemSettings()
                    }
                    .buttonStyle(TrustOutlineButtonStyle(compact: true))
                } else {
                    Button(TrustCopy.setHomeHere) {
                        model.setHomeHere()
                    }
                    .buttonStyle(TrustOutlineButtonStyle(compact: true))
                    Button(TrustCopy.allowWhileUsing) {
                        model.requestWhenInUseLocation()
                    }
                    .buttonStyle(TrustOutlineButtonStyle(compact: true))
                    Button(TrustCopy.allowAlways) {
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
                    Button(TrustCopy.allowPreciseLocation) {
                        model.requestPreciseLocation()
                    }
                    .buttonStyle(TrustOutlineButtonStyle(compact: true))
                }

                Button(TrustCopy.allowQuietReceipts) {
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
                sectionTitle(TrustCopy.more)
                Button(TrustCopy.lookLog) {
                    model.showingLookLog = true
                }
                .buttonStyle(TrustOutlineButtonStyle(compact: true))

                Button(TrustCopy.signOut) {
                    model.signOut()
                }
                .buttonStyle(TrustTextButtonStyle())

                Button(TrustCopy.deleteAccount) {
                    showingDeleteAccount = true
                }
                .buttonStyle(TrustOutlineButtonStyle(compact: true))

                VStack(alignment: .leading, spacing: 8) {
                    Text(TrustCopy.weDoNotSellLocation)
                    HStack(spacing: 6) {
                        Link(TrustCopy.privacy, destination: AppConfiguration.privacyURL)
                        Text("·")
                        Link(TrustCopy.terms, destination: AppConfiguration.termsURL)
                        Text("·")
                        Link(TrustCopy.support, destination: AppConfiguration.supportURL)
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
                return TrustCopy.sponsorNote
            }
            return TrustCopy.coveredBySponsor(name: model.coverage.sponsorName ?? TrustCopy.yourPartner)
        }
        if model.store.trialEligibility == .eligible {
            return TrustCopy.trialNote
        }
        return TrustCopy.freeIncludesLook
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
