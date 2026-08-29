import StoreKit
import SwiftUI
import PixelboardCore

struct AccountView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var confirmingDeletion = false
    @State private var inviteCode = ""
    @State private var showingReport = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                PixelboardPanelHeading(
                    eyebrow: "Settings",
                    title: model.account == nil ? "Sign in\nto paint." : "Your\naccount."
                ) {
                    dismiss()
                }

                boardActions

                Text(
                    "The board is open to everyone. Painting requires a verified account so each contribution can be reconciled and the shared 5-second cooldown respected. Pro and invite boosts only speed that cooldown; they do not remove it."
                )
                .font(PixelboardTheme.sans(15))
                .foregroundStyle(PixelboardTheme.muted)
                .lineSpacing(4)
                .padding(.top, 28)
                .padding(.bottom, 28)

                authActions
                    .padding(.bottom, 12)

                Text(authNote)
                    .font(PixelboardTheme.mono(10))
                    .foregroundStyle(PixelboardTheme.muted)
                    .lineSpacing(3)
                    .frame(minHeight: 36, alignment: .topLeading)
                    .padding(.bottom, 28)

                accountStateList

                inviteSection
                subscriptionSections
                legalFooter
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
            "Permanently delete this account?",
            isPresented: $confirmingDeletion,
            titleVisibility: .visible
        ) {
            Button("Delete account", role: .destructive) {
                Task { await model.deleteAccount() }
            }
        }
    }

    private var boardActions: some View {
        HStack(spacing: 8) {
            ShareLink(
                item: BoardLinks.position(
                    row: model.selectedPosition.row,
                    column: model.selectedPosition.column
                )
            ) {
                Text("Share")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(PixelboardOutlineButtonStyle(compact: true))
            .accessibilityLabel("Share this position")

            Button {
                showingReport = true
            } label: {
                Text("Report")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(PixelboardOutlineButtonStyle(compact: true))
            .accessibilityLabel("Report current position")
        }
        .padding(.top, 24)
    }

    @ViewBuilder
    private var authActions: some View {
        VStack(spacing: 8) {
            if model.account == nil {
                Button {
                    Task { await model.signIn(with: .apple) }
                } label: {
                    labeledAction("●", "Continue with Apple")
                }
                .buttonStyle(PixelboardOutlineButtonStyle())
                Button {
                    Task { await model.signIn(with: .google) }
                } label: {
                    labeledAction("G", "Continue with Google")
                }
                .buttonStyle(PixelboardOutlineButtonStyle())
            } else {
                if model.account?.communityStandardsAccepted == false {
                    Button {
                        Task { await model.acceptStandards() }
                    } label: {
                        labeledAction("✓", "Accept community standards")
                    }
                    .buttonStyle(PixelboardOutlineButtonStyle())
                }
                Button {
                    Task { await model.signOut() }
                } label: {
                    labeledAction("↗", "Sign out")
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

    private var authNote: String {
        if let notice = model.authNotice, !notice.isEmpty {
            return notice
        }
        if let error = model.store.errorMessage, !error.isEmpty {
            return error
        }
        if model.account == nil {
            return "Sign in with Apple or Google to place pixels."
        }
        if model.account?.communityStandardsAccepted == false {
            return "Accept the community standards before placing."
        }
        return model.statusMessage
    }

    private var accountStateList: some View {
        VStack(spacing: 0) {
            stateRow("State", stateValue)
            stateRow("Cooldown", cooldownValue)
            stateRow("Paint boost", boostValue)
        }
        .overlay(alignment: .top) { PixelboardTheme.line.frame(height: 1) }
    }

    private func stateRow(_ title: String, _ value: String) -> some View {
        HStack {
            Text(title)
            Spacer()
            Text(value).foregroundStyle(PixelboardTheme.muted)
        }
        .font(PixelboardTheme.mono(11))
        .textCase(.uppercase)
        .foregroundStyle(PixelboardTheme.ink)
        .padding(.vertical, 13)
        .overlay(alignment: .bottom) { PixelboardTheme.line.frame(height: 1) }
    }

    private var stateValue: String {
        guard let account = model.account else { return "Anonymous" }
        if account.isBanned == true { return "Banned" }
        return account.tier == .pro ? "Pro account" : "Free account"
    }

    private var cooldownValue: String {
        if model.account == nil { return "—" }
        if model.remainingCooldown > 0 { return "\(model.remainingCooldown)s" }
        return "Ready"
    }

    private var boostValue: String {
        guard let boost = model.account?.paintBoost else { return "None" }
        return "\(boost.cooldownSeconds)s until \(boost.expiresAt.formatted(date: .omitted, time: .shortened))"
    }

    @ViewBuilder
    private var inviteSection: some View {
        if let account = model.account, account.isBanned != true {
            VStack(alignment: .leading, spacing: 0) {
                PixelboardEyebrow(text: "Invite a painter")
                    .padding(.bottom, 12)
                Text("Share your code. When they sign in and accept the standards, they get 4 hours at a 2-second cooldown. You get 4 hours at 3 seconds. This is not Pro, and it never removes the cooldown.")
                    .font(PixelboardTheme.sans(14))
                    .foregroundStyle(PixelboardTheme.muted)
                    .lineSpacing(4)
                    .padding(.bottom, 16)
                if let code = account.referralCode {
                    Text(code)
                        .font(PixelboardTheme.mono(14))
                        .tracking(2.4)
                        .textCase(.uppercase)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                        .overlay(Rectangle().stroke(PixelboardTheme.line, lineWidth: 1))
                        .padding(.bottom, 12)
                    ShareLink(item: BoardLinks.invite(code: code)) {
                        Text("Copy invite link")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(PixelboardOutlineButtonStyle(compact: true))
                    .padding(.bottom, 10)
                }
                PixelboardFieldLabel(title: "Have a code?", hint: nil) {
                    TextField("", text: $inviteCode)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .font(PixelboardTheme.mono(14))
                        .foregroundStyle(PixelboardTheme.ink)
                        .padding(10)
                        .background(Color.white.opacity(0.25))
                        .overlay(Rectangle().stroke(PixelboardTheme.line, lineWidth: 1))
                }
                .padding(.top, 8)
                .padding(.bottom, 10)
                Button("Redeem invite") {
                    Task { await model.queueReferralCode(inviteCode) }
                }
                .buttonStyle(PixelboardOutlineButtonStyle(compact: true))
            }
            .padding(.top, 28)
            .overlay(alignment: .top) { PixelboardTheme.line.frame(height: 1).padding(.top, 18) }
        }
    }

    @ViewBuilder
    private var subscriptionSections: some View {
        if model.account != nil {
            VStack(alignment: .leading, spacing: 10) {
                PixelboardEyebrow(text: "Pixelboard Pro")
                    .padding(.top, 28)
                Text("Pro is 1 second between pixels. It does not remove the cooldown, and invite boosts never match Pro.")
                    .font(PixelboardTheme.sans(14))
                    .foregroundStyle(PixelboardTheme.muted)
                    .lineSpacing(4)
                ForEach(model.store.products) { product in
                    Button {
                        Task {
                            if await model.store.purchase(product) {
                                await model.refreshAccount()
                            }
                        }
                    } label: {
                        Text("\(product.displayName) · \(product.displayPrice)")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(PixelboardOutlineButtonStyle(compact: true))
                    .disabled(model.store.isWorking)
                }
                Button("Restore purchases") {
                    Task {
                        if await model.store.restore() {
                            await model.refreshAccount()
                        }
                    }
                }
                .buttonStyle(PixelboardOutlineButtonStyle(compact: true))
                Button("Manage subscription") {
                    openURL(StoreManager.manageSubscriptionsURL)
                }
                .buttonStyle(PixelboardOutlineButtonStyle(compact: true))
                Button("Delete account", role: .destructive) {
                    confirmingDeletion = true
                }
                .font(PixelboardTheme.mono(11))
                .tracking(0.9)
                .textCase(.uppercase)
                .foregroundStyle(PixelboardTheme.accent)
                .padding(.top, 18)
            }
        }
    }

    private var legalFooter: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Pixels you place are public. Anyone can overwrite them.")
            HStack(spacing: 6) {
                Link("Privacy", destination: URL(string: "https://pixelboard.collapsetechnologies.com/Privacy")!)
                Text("·")
                Link("Terms", destination: URL(string: "https://pixelboard.collapsetechnologies.com/Terms")!)
            }
        }
        .font(PixelboardTheme.mono(9.5))
        .textCase(.uppercase)
        .foregroundStyle(PixelboardTheme.muted)
        .padding(.top, 45)
    }
}
