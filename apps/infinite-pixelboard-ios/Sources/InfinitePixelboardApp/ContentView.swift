import SwiftUI
import PixelboardCore

struct ContentView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var showingGoTo = false

    var body: some View {
        ZStack {
            PixelboardTheme.paper.ignoresSafeArea()
            BoardCanvasView()
                .ignoresSafeArea()
            hud
        }
        .preferredColorScheme(.light)
        .statusBarHidden(false)
        .sheet(isPresented: $model.showingAccount) {
            AccountView()
                .environmentObject(model)
                .presentationBackground(PixelboardTheme.paper)
                .presentationDragIndicator(.hidden)
        }
        .sheet(isPresented: $showingGoTo) {
            GoToPositionView(initialPosition: model.selectedPosition) { position in
                model.center(on: position)
                showingGoTo = false
            }
            .presentationBackground(PixelboardTheme.paper)
            .presentationDragIndicator(.hidden)
        }
    }

    private var hud: some View {
        VStack(spacing: 0) {
            header
            HStack {
                readout
                Spacer(minLength: 12)
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            ReservedAdBanner(tier: model.tier)
                .padding(.horizontal, 24)
            Spacer()
            HStack(alignment: .bottom) {
                connectionPill
                Spacer()
                zoomControls
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
            palette
                .padding(.bottom, 14)
        }
        .padding(.top, 4)
    }

    private var header: some View {
        HStack(alignment: .top) {
            Spacer(minLength: 8)
            if horizontalSizeClass == .regular {
                HStack(spacing: 0) {
                    Text("\(PixelboardL10n.infinitePixelboardHeader) ")
                        .foregroundStyle(PixelboardTheme.ink)
                    Text("/ \(PixelboardL10n.publicFieldHeader)")
                        .foregroundStyle(PixelboardTheme.muted)
                }
                .font(PixelboardTheme.mono(10))
                .tracking(0.9)
            }
            Spacer(minLength: 8)
            Button {
                model.showingAccount = true
            } label: {
                HStack(spacing: 10) {
                    Text(PixelboardL10n.settings)
                    Text("↗").font(PixelboardTheme.sans(14, weight: .medium))
                }
            }
            .buttonStyle(PixelboardHardButtonStyle())
            .accessibilityLabel(PixelboardL10n.settings)
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
    }

    private var readout: some View {
        Text(PixelboardTheme.coordinate(
            row: model.selectedPosition.row,
            column: model.selectedPosition.column
        ))
        .font(PixelboardTheme.mono(9.5))
        .tracking(0.9)
        .textCase(.uppercase)
        .foregroundStyle(PixelboardTheme.ink)
        .accessibilityAddTraits(.updatesFrequently)
    }

    private var connectionPill: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(connectionColor)
                .frame(width: 7, height: 7)
            Text(connectionLabel)
                .font(PixelboardTheme.mono(9.5))
                .tracking(0.9)
                .textCase(.uppercase)
                .foregroundStyle(PixelboardTheme.ink)
        }
        .accessibilityLabel(connectionAccessibility)
    }

    private var zoomControls: some View {
        VStack(spacing: 0) {
            zoomButton("−", label: PixelboardL10n.zoomOut) {
                model.zoomAtCenter(factor: 1 / 1.25)
            }
            PixelboardTheme.line.frame(height: 1)
            zoomButton("+", label: PixelboardL10n.zoomIn) {
                model.zoomAtCenter(factor: 1.25)
            }
            PixelboardTheme.line.frame(height: 1)
            zoomButton("GO", label: PixelboardL10n.goToCoordinates) {
                showingGoTo = true
            }
        }
        .frame(width: 32)
        .overlay(Rectangle().stroke(PixelboardTheme.line, lineWidth: 1))
        .background(PixelboardTheme.panel)
    }

    private func zoomButton(_ title: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(title == "GO"
                    ? PixelboardTheme.mono(9.5)
                    : PixelboardTheme.sans(16, weight: .medium))
                .foregroundStyle(PixelboardTheme.ink)
                .frame(width: 32, height: 30)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    private var usesFullPalette: Bool {
        horizontalSizeClass == .regular
    }

    private var palette: some View {
        VStack(spacing: 8) {
            HStack(alignment: .top, spacing: 10) {
                if usesFullPalette {
                    Text(PixelboardL10n.ink)
                        .font(PixelboardTheme.mono(9.5))
                        .tracking(1.1)
                        .textCase(.uppercase)
                        .foregroundStyle(PixelboardTheme.muted)
                        .padding(.trailing, 4)
                        .padding(.top, 6)
                }
                if usesFullPalette {
                    LazyVGrid(
                        columns: [GridItem(.adaptive(minimum: 26), spacing: 5)],
                        alignment: .leading,
                        spacing: 5
                    ) {
                        paletteSwatches
                    }
                } else {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 5) {
                            paletteSwatches
                        }
                    }
                }
            }
            .padding(.vertical, 8)
            .padding(.horizontal, 10)
            .background(PixelboardTheme.panel)
            .overlay(Rectangle().stroke(PixelboardTheme.line, lineWidth: 1))

            Button {
                Task { await model.placeSelected() }
            } label: {
                Group {
                    if model.isPlacing {
                        ProgressView().tint(PixelboardTheme.paper)
                    } else {
                        Text(placeTitle)
                    }
                }
                .frame(maxWidth: .infinity, minHeight: 40)
            }
            .buttonStyle(PixelboardFilledButtonStyle())
            .disabled(!model.isPlaceControlEnabled)
            .opacity(model.isPlaceControlEnabled ? 1 : 0.45)
            .accessibilityLabel(placeTitle)
        }
        .padding(.horizontal, 16)
        .frame(maxWidth: usesFullPalette ? 720 : 420)
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private var paletteSwatches: some View {
        ForEach(model.availableColors, id: \.self) { color in
            Button {
                model.selectedColor = color
            } label: {
                ZStack {
                    Rectangle().fill(Color(pixelboardHex: color))
                    if color.caseInsensitiveCompare(model.selectedColor) == .orderedSame {
                        Rectangle()
                            .stroke(Color.white.opacity(0.82), lineWidth: 1)
                            .padding(4)
                    }
                }
                .frame(width: 26, height: 26)
                .overlay(Rectangle().stroke(PixelboardTheme.line, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(
                PixelboardL10n.selectColor(
                    "\(PixelboardPalette.name(for: color)) (\(color))"
                )
            )
            .accessibilityAddTraits(
                color.caseInsensitiveCompare(model.selectedColor) == .orderedSame
                    ? .isSelected : []
            )
        }
        if model.canUseCustomColors {
            ZStack {
                Rectangle().fill(Color(pixelboardHex: model.selectedColor))
                ColorPicker(PixelboardL10n.customColor, selection: customColorBinding, supportsOpacity: false)
                    .labelsHidden()
                    .opacity(0.02)
            }
            .frame(width: 26, height: 26)
            .overlay(Rectangle().stroke(PixelboardTheme.line, lineWidth: 1))
            .accessibilityLabel(PixelboardL10n.chooseCustomProColor)
        } else {
            Button {
                model.showingAccount = true
            } label: {
                HStack(spacing: 3) {
                    PremiumPixelGrid()
                        .frame(width: 26, height: 26)
                    Text(PixelboardL10n.pro)
                        .font(PixelboardTheme.mono(7.5))
                        .tracking(0.4)
                        .foregroundStyle(PixelboardTheme.muted)
                }
                .frame(height: 26)
            }
            .buttonStyle(.plain)
            .overlay(Rectangle().stroke(PixelboardTheme.line, lineWidth: 1))
            .accessibilityLabel(PixelboardL10n.unlockCustomColors)
        }
    }

    private var placeTitle: String {
        if model.remainingCooldown > 0 {
            return PixelboardL10n.readyIn(model.remainingCooldown)
        }
        return PixelboardL10n.placePixel
    }

    private var customColorBinding: Binding<Color> {
        Binding(
            get: { Color(pixelboardHex: model.selectedColor) },
            set: { color in
                if let hex = color.pixelboardHex {
                    model.selectedColor = hex
                }
            }
        )
    }

    private var connectionLabel: String {
        switch model.connection {
        case .online: PixelboardL10n.live
        case .connecting: PixelboardL10n.syncing
        case .reconnecting: PixelboardL10n.retrying
        case .offline: PixelboardL10n.offline
        }
    }

    private var connectionColor: Color {
        switch model.connection {
        case .online: PixelboardTheme.live
        case .connecting, .reconnecting: PixelboardTheme.syncing
        case .offline: PixelboardTheme.accent
        }
    }

    private var connectionAccessibility: String {
        switch model.connection {
        case .online:
            PixelboardL10n.liveUpdatesConnected
        case .connecting, .reconnecting:
            PixelboardL10n.liveUpdatesStatus(connectionLabel.lowercased())
        case .offline:
            PixelboardL10n.offlineTilesMayBeStale
        }
    }
}
