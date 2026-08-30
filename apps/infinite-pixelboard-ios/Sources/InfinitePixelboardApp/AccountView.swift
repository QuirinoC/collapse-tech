import StoreKit
import SwiftUI
import UIKit
import PixelboardCore

struct AccountView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var confirmingDeletion = false
    @State private var showingReport = false
    @State private var showingPro = true
    @State private var showingMore = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                settingsHeading

                authActions
                    .padding(.bottom, 12)

                if let authNote {
                    Text(authNote)
                        .font(PixelboardTheme.mono(10))
                        .foregroundStyle(PixelboardTheme.muted)
                        .lineSpacing(3)
                        .padding(.bottom, 16)
                }

                subscriptionSections
                notificationsPrompt
                boardActions
                moreSection
                PixelboardWordmark()
                    .padding(.top, 48)
            }
            .padding(24)
        }
        .background(PixelboardTheme.paper.ignoresSafeArea())
        .preferredColorScheme(.light)
        .sheet(isPresented: $showingReport) {
            ReportView()
                .environmentObject(model)
                .presentationBackground(PixelboardTheme.paper)
                .presentationDragIndicator(.hidden)
        }
        .confirmationDialog(
            PixelboardL10n.permanentlyDeleteAccount,
            isPresented: $confirmingDeletion,
            titleVisibility: .visible
        ) {
            Button(PixelboardL10n.deleteAccount, role: .destructive) {
                Task { await model.deleteAccount() }
            }
        }
    }

    private var settingsHeading: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                PixelboardEyebrow(text: PixelboardL10n.settings)
                Spacer()
                Button(PixelboardL10n.close) { dismiss() }
                    .buttonStyle(PixelboardTextButtonStyle())
            }
            .padding(.bottom, 20)

            Text(PixelboardL10n.account)
                .font(PixelboardTheme.sans(26, weight: .medium))
                .tracking(-0.8)
                .textCase(.uppercase)
                .foregroundStyle(PixelboardTheme.ink)
        }
        .padding(.bottom, 22)
    }

    private var boardActions: some View {
        HStack(spacing: 8) {
            ShareLink(
                item: BoardLinks.position(
                    row: model.selectedPosition.row,
                    column: model.selectedPosition.column
                )
            ) {
                Text(PixelboardL10n.share)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(PixelboardOutlineButtonStyle(compact: true))
            .accessibilityLabel(PixelboardL10n.shareThisPosition)

            Button {
                showingReport = true
            } label: {
                Text(PixelboardL10n.report)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(PixelboardOutlineButtonStyle(compact: true))
            .accessibilityLabel(PixelboardL10n.reportCurrentPosition)
        }
        .padding(.top, 4)
    }

    @ViewBuilder
    private var authActions: some View {
        VStack(spacing: 8) {
            if model.account == nil {
                Button {
                    Task { await model.signIn(with: .apple) }
                } label: {
                    labeledAction("●", PixelboardL10n.continueWithApple)
                }
                .buttonStyle(PixelboardOutlineButtonStyle())
                Button {
                    Task { await model.signIn(with: .google) }
                } label: {
                    labeledAction("G", PixelboardL10n.continueWithGoogle)
                }
                .buttonStyle(PixelboardOutlineButtonStyle())
            } else {
                if model.account?.communityStandardsAccepted == false {
                    Button {
                        Task { await model.acceptStandards() }
                    } label: {
                        labeledAction("✓", PixelboardL10n.acceptCommunityStandards)
                    }
                    .buttonStyle(PixelboardOutlineButtonStyle())
                }
                Button {
                    Task { await model.signOut() }
                } label: {
                    labeledAction("↗", PixelboardL10n.signOut)
                }
                .buttonStyle(PixelboardOutlineButtonStyle())
                Button {
                    confirmingDeletion = true
                } label: {
                    labeledAction("×", PixelboardL10n.deleteAccount)
                }
                .buttonStyle(PixelboardOutlineButtonStyle())
            }
        }
    }

    private func labeledAction(_ mark: String, _ title: String) -> some View {
        HStack(spacing: 16) {
            Text(mark)
                .font(PixelboardTheme.mono(13))
                .frame(width: 20)
            Text(title)
            Spacer(minLength: 0)
        }
    }

    private var authNote: String? {
        if let notice = model.authNotice, !notice.isEmpty {
            return notice
        }
        if let error = model.store.errorMessage, !error.isEmpty {
            return error
        }
        if model.account?.communityStandardsAccepted == false {
            return PixelboardL10n.acceptStandardsNote
        }
        return nil
    }

    @ViewBuilder
    private var notificationsPrompt: some View {
        if model.account != nil && !model.pushNotifications.notificationsEnabled {
            VStack(alignment: .leading, spacing: 12) {
                sectionLabel(PixelboardL10n.notifications)
                Text(PixelboardL10n.enableNotificationsHeading)
                    .font(PixelboardTheme.sans(19, weight: .medium))
                    .foregroundStyle(PixelboardTheme.ink)
                Text(PixelboardL10n.enableNotificationsNote)
                    .font(PixelboardTheme.sans(14))
                    .foregroundStyle(PixelboardTheme.muted)
                    .lineSpacing(4)
                Button(PixelboardL10n.enableNotifications) {
                    Task { await model.enableNotifications() }
                }
                .buttonStyle(PixelboardOutlineButtonStyle(compact: true))
                if model.pushNotifications.authorizationStatus == .denied {
                    Button(PixelboardL10n.openNotificationSettings) {
                        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
                        UIApplication.shared.open(url)
                    }
                    .buttonStyle(PixelboardTextButtonStyle())
                }
            }
            .padding(.top, 24)
        }
    }

    @ViewBuilder
    private var subscriptionSections: some View {
        DisclosureGroup(isExpanded: $showingPro) {
            VStack(alignment: .leading, spacing: 10) {
                if model.store.linkedToAnotherAccount {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(PixelboardL10n.subscriptionTransferReviewHeading)
                            .font(PixelboardTheme.sans(17, weight: .semibold))
                            .foregroundStyle(PixelboardTheme.ink)
                        Text(PixelboardL10n.subscriptionTransferReviewNote)
                            .font(PixelboardTheme.sans(14))
                            .foregroundStyle(PixelboardTheme.ink)
                            .lineSpacing(4)
                        Link(
                            PixelboardL10n.subscriptionContactSupport,
                            destination: StoreManager.supportURL
                        )
                        .font(PixelboardTheme.mono(10))
                        .foregroundStyle(PixelboardTheme.ink)
                        .underline()
                    }
                    .padding(14)
                    .background(PixelboardTheme.accent.opacity(0.14))
                    .overlay(Rectangle().stroke(PixelboardTheme.accent, lineWidth: 1))
                }
                Text(subscriptionNote)
                    .font(PixelboardTheme.sans(14))
                    .foregroundStyle(PixelboardTheme.muted)
                    .lineSpacing(4)
                if let account = model.account,
                   account.tier != .pro,
                   !model.store.linkedToAnotherAccount {
                    ForEach(model.store.products) { product in
                        Button {
                            Task {
                                if await model.store.purchase(product) {
                                    await model.refreshAccount()
                                }
                            }
                        } label: {
                            Text(product.id == AppConfiguration.monthlyProductID
                                ? PixelboardL10n.subscribeMonthly(price: product.displayPrice)
                                : PixelboardL10n.subscribeAnnually(price: product.displayPrice))
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(PixelboardOutlineButtonStyle(compact: true))
                        .disabled(model.store.isWorking)
                    }
                }
                if model.account?.tier == .pro,
                   model.store.activeProductID == AppConfiguration.monthlyProductID,
                   let annual = model.store.products.first(where: {
                       $0.id == AppConfiguration.annualProductID
                   }) {
                    Button {
                        Task {
                            if await model.store.purchase(annual) {
                                await model.refreshAccount()
                            }
                        }
                    } label: {
                        Text(PixelboardL10n.switchToAnnual(price: annual.displayPrice))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(PixelboardOutlineButtonStyle(compact: true))
                    .disabled(model.store.isWorking)
                } else if model.store.products.isEmpty {
                    Text(PixelboardL10n.subscriptionLoading)
                        .font(PixelboardTheme.mono(10))
                        .foregroundStyle(PixelboardTheme.muted)
                }
                if model.account != nil {
                    Button(PixelboardL10n.restorePurchases) {
                        Task { await model.store.restorePurchases() }
                    }
                    .buttonStyle(PixelboardTextButtonStyle())
                    .disabled(model.store.isWorking)
                    Text(PixelboardL10n.restorePurchasesNote)
                        .font(PixelboardTheme.mono(9.5))
                        .foregroundStyle(PixelboardTheme.muted)
                        .lineSpacing(3)
                    if model.account?.tier == .pro || model.store.linkedToAnotherAccount {
                        if model.account?.entitlementSource == "stripe" {
                            Button(PixelboardL10n.stripeSubscriptionSettings) {
                                Task {
                                    if let url = await model.store.stripePortalURL() {
                                        openURL(url)
                                    }
                                }
                            }
                            .buttonStyle(PixelboardTextButtonStyle())
                            .disabled(model.store.isWorking)
                        } else {
                            Link(
                                PixelboardL10n.subscriptionSettings,
                                destination: StoreManager.manageSubscriptionsURL
                            )
                            .font(PixelboardTheme.mono(10))
                            .foregroundStyle(PixelboardTheme.muted)
                            .underline()
                        }
                    }
                }
                if let account = model.account,
                   account.communityStandardsAccepted,
                   account.isBanned != true {
                    PixelboardTheme.line.frame(height: 1)
                    Text(PixelboardL10n.inviteAPainter)
                        .font(PixelboardTheme.mono(11))
                        .tracking(0.9)
                        .textCase(.uppercase)
                        .foregroundStyle(PixelboardTheme.ink)
                        .padding(.top, 10)
                    inviteContent(account)
                }
            }
        } label: {
            sectionLabel(model.account?.tier == .pro ? PixelboardL10n.pro : PixelboardL10n.getPro)
        }
        .tint(PixelboardTheme.ink)
        .padding(.top, 24)
        .task {
            await model.store.loadProducts()
        }
    }

    private var subscriptionNote: String {
        guard let account = model.account else {
            return PixelboardL10n.loginToGetPro
        }
        if model.store.linkedToAnotherAccount {
            return PixelboardL10n.subscriptionLinkedElsewhere
        }
        guard account.tier != .pro else {
            return account.entitlementSource == "stripe"
                ? PixelboardL10n.stripeProActiveNote
                : PixelboardL10n.proActiveNote
        }
        return model.store.trialEligibility == .eligible
            ? PixelboardL10n.tryProNote
            : PixelboardL10n.proAvailableNote
    }

    private var moreSection: some View {
        DisclosureGroup(isExpanded: $showingMore) {
            VStack(alignment: .leading, spacing: 10) {
                legalFooter
            }
        } label: {
            sectionLabel(PixelboardL10n.more)
        }
        .tint(PixelboardTheme.ink)
        .padding(.top, 24)
    }

    private func inviteContent(_ account: AccountState) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(PixelboardL10n.shareInviteNote)
                .font(PixelboardTheme.sans(14))
                .foregroundStyle(PixelboardTheme.muted)
                .lineSpacing(4)
                .padding(.vertical, 16)
            if let code = account.referralCode {
                Text(code)
                    .font(PixelboardTheme.mono(14))
                    .tracking(2.4)
                    .textCase(.uppercase)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
                    .overlay(Rectangle().stroke(PixelboardTheme.line, lineWidth: 1))
                    .padding(.bottom, 12)
                ShareLink(item: BoardLinks.iosInvite(code: code)) {
                    Text(PixelboardL10n.copyInviteLink)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(PixelboardOutlineButtonStyle(compact: true))
                .padding(.bottom, 10)
            }
        }
    }

    private func sectionLabel(_ title: String) -> some View {
        Text(title)
            .font(PixelboardTheme.mono(11))
            .tracking(0.9)
            .textCase(.uppercase)
            .foregroundStyle(PixelboardTheme.ink)
    }

    private var legalFooter: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(PixelboardL10n.publicPixelsNote)
            HStack(spacing: 6) {
                Link(PixelboardL10n.privacy, destination: URL(string: "https://pixelboard.collapsetechnologies.com/Privacy")!)
                Text("·")
                Link(PixelboardL10n.terms, destination: URL(string: "https://pixelboard.collapsetechnologies.com/Terms")!)
            }
        }
        .font(PixelboardTheme.mono(9.5))
        .foregroundStyle(PixelboardTheme.muted)
        .tint(PixelboardTheme.ink)
        .underline()
        .padding(.top, 45)
    }
}
