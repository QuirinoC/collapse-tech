import SwiftUI
import PixelboardCore

struct ContentView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var showingAccount = false
    @State private var showingReport = false

    private let colors = [
        "#171714", "#F7F3EA", "#D3523C", "#DC9B32", "#E1C94A",
        "#587554", "#356B76", "#425B8C", "#7E5078"
    ]

    var body: some View {
        NavigationStack {
            Group {
                if horizontalSizeClass == .regular {
                    HStack(spacing: 0) {
                        BoardCanvasView()
                        Divider()
                        controls.frame(width: 320)
                    }
                } else {
                    VStack(spacing: 0) {
                        BoardCanvasView()
                        Divider()
                        controls
                    }
                }
            }
            .navigationTitle("Infinite Pixelboard")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Label(model.connection.rawValue, systemImage: connectionIcon)
                        .font(.caption)
                        .foregroundStyle(connectionColor)
                        .accessibilityLabel("Connection: \(model.connection.rawValue)")
                }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button {
                        showingReport = true
                    } label: {
                        Label("Report current position", systemImage: "exclamationmark.bubble")
                    }
                    Button {
                        showingAccount = true
                    } label: {
                        Label("Account", systemImage: "person.crop.circle")
                    }
                }
            }
            .sheet(isPresented: $showingAccount) {
                AccountView()
                    .environmentObject(model)
            }
            .sheet(isPresented: $showingReport) {
                ReportView()
                    .environmentObject(model)
            }
        }
    }

    private var controls: some View {
        VStack(spacing: 12) {
            HStack {
                Text("Row \(model.selectedPosition.row), Column \(model.selectedPosition.column)")
                    .font(.callout.monospacedDigit())
                Spacer()
                Text("\(Int(model.viewport.scale * 100))%")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack {
                    ForEach(colors, id: \.self) { color in
                        Button {
                            model.selectedColor = color
                        } label: {
                            Circle()
                                .fill(Color(hexString: color))
                                .frame(width: 32, height: 32)
                                .overlay {
                                    if color == model.selectedColor {
                                        Circle().stroke(.primary, lineWidth: 3)
                                    }
                                }
                        }
                        .accessibilityLabel("Select color \(color)")
                        .accessibilityAddTraits(color == model.selectedColor ? .isSelected : [])
                    }
                }
            }

            Button {
                Task { await model.placeSelected() }
            } label: {
                if model.isPlacing {
                    ProgressView().frame(maxWidth: .infinity)
                } else if model.remainingCooldown > 0 {
                    Text("Ready in \(model.remainingCooldown)s").frame(maxWidth: .infinity)
                } else {
                    Text("Place pixel").frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(!model.canPlace)

            Text(model.statusMessage)
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityLiveRegion(.polite)

            ReservedAdBanner(tier: model.tier)
        }
        .padding()
        .background(.regularMaterial)
    }

    private var connectionIcon: String {
        model.connection == .online ? "dot.radiowaves.left.and.right" : "wifi.slash"
    }

    private var connectionColor: Color {
        model.connection == .online ? .green : .secondary
    }
}

private extension Color {
    init(hexString: String) {
        let value = UInt64(hexString.dropFirst(), radix: 16) ?? 0
        self.init(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }
}
