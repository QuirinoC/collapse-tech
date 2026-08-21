import StoreKit
import SwiftUI

struct AccountView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var confirmingDeletion = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Account") {
                    if let account = model.account {
                        LabeledContent("Plan", value: account.tier == .pro ? "Pro" : "Free")
                        if !account.communityStandardsAccepted {
                            Button("Accept community standards") {
                                Task { await model.acceptStandards() }
                            }
                        }
                        Button("Sign out") {
                            Task { await model.signOut() }
                        }
                    } else {
                        Text("Browsing anonymously")
                        Button("Continue with Apple") {
                            Task { await model.signIn(with: .apple) }
                        }
                        Button("Continue with Google") {
                            Task { await model.signIn(with: .google) }
                        }
                    }
                }

                if model.account != nil {
                    Section("Pixelboard Pro") {
                        ForEach(model.store.products) { product in
                            Button("\(product.displayName) · \(product.displayPrice)") {
                                Task {
                                    if await model.store.purchase(product) {
                                        await model.refreshAccount()
                                    }
                                }
                            }
                            .disabled(model.store.isWorking)
                        }
                        Button("Restore purchases") {
                            Task {
                                if await model.store.restore() {
                                    await model.refreshAccount()
                                }
                            }
                        }
                        Button("Manage subscription") {
                            guard let scene = UIApplication.shared.connectedScenes
                                .compactMap({ $0 as? UIWindowScene }).first else { return }
                            Task { await model.store.manageSubscriptions(in: scene) }
                        }
                    }

                    Section {
                        Button("Delete account", role: .destructive) {
                            confirmingDeletion = true
                        }
                    } footer: {
                        Text("Deletion removes server-held account data before deleting the Firebase identity.")
                    }
                }

                if let error = model.store.errorMessage {
                    Section {
                        Text(error).foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Account")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
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
    }
}
