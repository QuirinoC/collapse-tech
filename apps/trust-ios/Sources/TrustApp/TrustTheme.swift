import SwiftUI
import TrustCore

struct TrustPalette: Equatable {
    var paper: Color
    var ink: Color
    var muted: Color
    var line: Color
    var surface: Color
    var accent: Color
    var accentOn: Color

    static let paper = TrustPalette(
        paper: Color.white,
        ink: Color.black,
        muted: Color(red: 92 / 255, green: 92 / 255, blue: 92 / 255),
        line: Color.black,
        surface: Color(red: 242 / 255, green: 242 / 255, blue: 242 / 255),
        accent: Color(red: 225 / 255, green: 6 / 255, blue: 0),
        accentOn: Color.white
    )

    static let night = TrustPalette(
        paper: Color.black,
        ink: Color.white,
        muted: Color(red: 138 / 255, green: 138 / 255, blue: 138 / 255),
        line: Color(red: 46 / 255, green: 46 / 255, blue: 46 / 255),
        surface: Color(red: 20 / 255, green: 20 / 255, blue: 20 / 255),
        accent: Color(red: 225 / 255, green: 6 / 255, blue: 0),
        accentOn: Color.white
    )
}

private struct TrustPaletteKey: EnvironmentKey {
    static let defaultValue = TrustPalette.paper
}

extension EnvironmentValues {
    var trustPalette: TrustPalette {
        get { self[TrustPaletteKey.self] }
        set { self[TrustPaletteKey.self] = newValue }
    }
}

enum TrustTheme {
    static let accent = TrustPalette.paper.accent

    static func display(_ size: CGFloat, italic: Bool = true) -> Font {
        italic
            ? .custom("Didot-Italic", size: size, relativeTo: .title)
            : .custom("Didot", size: size, relativeTo: .title)
    }

    /// Space Grotesk — same family as Pixelboard web/iOS and collapsetechnologies.com.
    static func sans(_ size: CGFloat, weight: Font.Weight = .semibold) -> Font {
        Font.custom("Space Grotesk", size: size).weight(weight)
    }

    static func mono(_ size: CGFloat) -> Font {
        Font.custom("IBM Plex Mono", size: size).weight(.medium)
    }

    static func ui(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .default)
    }

    static func label(_ size: CGFloat) -> Font {
        .system(size: size, weight: .medium, design: .default)
    }

    static func folio(_ size: CGFloat) -> Font {
        .system(size: size, weight: .medium, design: .default)
    }
}

struct TrustFolio: View {
    let text: String
    var color: Color? = nil
    var size: CGFloat = 11
    @Environment(\.trustPalette) private var palette

    var body: some View {
        Text(text.uppercased())
            .font(TrustTheme.folio(size))
            .tracking(1.4)
            .foregroundStyle(color ?? palette.muted)
    }
}

struct TrustRule: View {
    var width: CGFloat = 56
    /// Scale X 0→1 under Didot on sheet appear (Look confirm).
    var draws: Bool = false
    @Environment(\.trustPalette) private var palette
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var progress: CGFloat = 1

    var body: some View {
        palette.accent
            .frame(width: width, height: 2)
            .scaleEffect(x: draws ? progress : 1, y: 1, anchor: .leading)
            .accessibilityHidden(true)
            .onAppear {
                guard draws else { return }
                if reduceMotion {
                    progress = 1
                    return
                }
                progress = 0
                withAnimation(.easeOut(duration: 0.34)) {
                    progress = 1
                }
            }
    }
}

/// Home geofence mark — fill when inside, outline when away. No bounce.
struct TrustHomeGlyph: View {
    var filled: Bool
    @Environment(\.trustPalette) private var palette
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Image(systemName: filled ? "house.fill" : "house")
            .font(.system(size: 11, weight: .medium))
            .foregroundStyle(filled ? palette.ink : palette.muted)
            .frame(width: 12, height: 11)
            .accessibilityHidden(true)
            .animation(reduceMotion ? nil : .easeInOut(duration: 0.26), value: filled)
    }
}

struct TrustWordmark: View {
    @Environment(\.trustPalette) private var palette

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text("COLLAPSE")
                .font(TrustTheme.sans(10.5, weight: .semibold))
                .tracking(-0.58)
            Text("TECHNOLOGIES")
                .font(TrustTheme.sans(7, weight: .semibold))
                .tracking(0.56)
        }
        .foregroundStyle(palette.ink)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Collapse Technologies")
    }
}

struct TrustLivePin: View {
    let initials: String
    var caption: String? = nil
    var you = false
    @Environment(\.trustPalette) private var palette

    var body: some View {
        VStack(spacing: 3) {
            ZStack {
                if you {
                    Rectangle()
                        .fill(palette.ink)
                        .frame(width: 12, height: 12)
                        .overlay(Rectangle().stroke(palette.accent, lineWidth: 1.5))
                } else {
                    Circle()
                        .fill(palette.ink)
                        .frame(width: 28, height: 28)
                        .overlay(
                            Text(initials)
                                .font(TrustTheme.label(10))
                                .foregroundStyle(palette.paper)
                        )
                }
            }
            if let caption {
                Text(caption.uppercased())
                    .font(TrustTheme.folio(8))
                    .tracking(0.8)
                    .foregroundStyle(palette.ink)
            }
        }
        .accessibilityHidden(true)
    }
}

struct TrustSealedMark: View {
    let initials: String
    @Environment(\.trustPalette) private var palette
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var lockBreath = false

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "lock")
                .font(.system(size: 10, weight: .semibold))
                .opacity(lockOpacity)
            VStack(alignment: .leading, spacing: 1) {
                Text(initials)
                    .font(TrustTheme.label(11))
                    .tracking(0.8)
                Text(TrustCopy.sealed)
                    .font(TrustTheme.folio(8))
                    .tracking(0.9)
                    .foregroundStyle(palette.muted)
            }
        }
        .foregroundStyle(palette.ink)
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(palette.paper)
        .overlay(Rectangle().stroke(palette.ink, lineWidth: 1))
        .onAppear { startBreath() }
        .onChange(of: reduceMotion) { _, _ in startBreath() }
    }

    private var lockOpacity: Double {
        reduceMotion ? 1 : (lockBreath ? 1 : 0.88)
    }

    private func startBreath() {
        guard !reduceMotion else {
            lockBreath = true
            return
        }
        withAnimation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true)) {
            lockBreath = true
        }
    }
}

/// Outline lock for strip chips — same soft breathe as the map sealed mark.
struct TrustSealedLock: View {
    @Environment(\.trustPalette) private var palette
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var breath = false

    var body: some View {
        Image(systemName: "lock")
            .font(.system(size: 10, weight: .semibold))
            .foregroundStyle(palette.ink)
            .opacity(reduceMotion ? 1 : (breath ? 1 : 0.88))
            .accessibilityHidden(true)
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true)) {
                    breath = true
                }
            }
    }
}

struct TrustChip: View {
    let label: String
    var kind: Kind = .rest
    @Environment(\.trustPalette) private var palette

    enum Kind { case rest, always, timed }

    var body: some View {
        Text(label.uppercased())
            .font(TrustTheme.folio(10))
            .tracking(0.8)
            .foregroundStyle(kind == .timed ? palette.accent : palette.ink)
    }
}

struct TrustEyebrow: View {
    let text: String
    @Environment(\.trustPalette) private var palette

    var body: some View {
        TrustFolio(text: text, color: palette.muted, size: 10)
    }
}

struct TrustPanelHeading: View {
    let eyebrow: String
    let title: String
    let close: () -> Void
    @Environment(\.trustPalette) private var palette

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                TrustFolio(text: eyebrow)
                Spacer()
                Button(TrustCopy.close, action: close)
                    .buttonStyle(TrustTextButtonStyle())
            }
            Text(title)
                .font(TrustTheme.display(28))
                .foregroundStyle(palette.ink)
                .fixedSize(horizontal: false, vertical: true)
            TrustRule()
        }
    }
}

struct TrustTextButtonStyle: ButtonStyle {
    @Environment(\.trustPalette) private var palette

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(TrustTheme.folio(12))
            .tracking(1.0)
            .textCase(.uppercase)
            .foregroundStyle(palette.muted.opacity(configuration.isPressed ? 0.5 : 1))
    }
}

struct TrustOutlineButtonStyle: ButtonStyle {
    var compact = false
    @Environment(\.trustPalette) private var palette

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(TrustTheme.ui(compact ? 15 : 16, weight: .medium))
            .foregroundStyle(palette.ink.opacity(configuration.isPressed ? 0.55 : 1))
            .frame(maxWidth: .infinity, minHeight: compact ? 48 : 52)
            .overlay(Rectangle().stroke(palette.line, lineWidth: 1))
    }
}

struct TrustFilledButtonStyle: ButtonStyle {
    var expand = true
    var destructive = false
    var ember = false
    @Environment(\.trustPalette) private var palette

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(TrustTheme.ui(16, weight: .semibold))
            .tracking(0.6)
            .textCase(.uppercase)
            .foregroundStyle(palette.accentOn.opacity(configuration.isPressed ? 0.7 : 1))
            .padding(.horizontal, 16)
            .frame(maxWidth: expand ? .infinity : nil, minHeight: 52)
            .background(palette.accent.opacity(configuration.isPressed ? 0.86 : 1))
    }
}

/// Black (Paper) / white (Night) Sign in with Apple plate. Uses SF Symbol `apple.logo`, not a custom mark.
struct TrustAppleButtonStyle: ButtonStyle {
    @Environment(\.trustPalette) private var palette
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(palette.paper.opacity(configuration.isPressed ? 0.7 : 1))
            .background(palette.ink.opacity(configuration.isPressed ? 0.86 : 1))
            .clipShape(Rectangle())
            .contentShape(Rectangle())
            .opacity(isEnabled ? 1 : 0.55)
    }
}

struct TrustHardButtonStyle: ButtonStyle {
    var minHeight: CGFloat = 36
    @Environment(\.trustPalette) private var palette

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(TrustTheme.folio(minHeight >= 44 ? 12 : 11))
            .tracking(0.9)
            .textCase(.uppercase)
            .foregroundStyle(palette.ink.opacity(configuration.isPressed ? 0.55 : 1))
            .padding(.horizontal, minHeight >= 44 ? 16 : 12)
            .frame(minHeight: minHeight)
            .overlay(Rectangle().stroke(palette.line, lineWidth: 1))
    }
}

struct TrustFieldLabel<Content: View>: View {
    let title: String
    let hint: String?
    @ViewBuilder var content: Content
    @Environment(\.trustPalette) private var palette

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                TrustFolio(text: title, size: 10)
                if let hint {
                    Spacer()
                    TrustFolio(text: hint, size: 10)
                }
            }
            content
        }
    }
}

struct TrustHairline: View {
    @Environment(\.trustPalette) private var palette

    var body: some View {
        palette.line.frame(height: 1)
    }
}

struct TrustSurface<Content: View>: View {
    var padding: CGFloat = 16
    @ViewBuilder var content: Content
    @Environment(\.trustPalette) private var palette

    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(Rectangle().stroke(palette.line, lineWidth: 1))
    }
}

extension String {
    var trustInitials: String {
        var trimmed = trimmingCharacters(in: .whitespaces)
        if trimmed.hasPrefix("@") {
            trimmed = String(trimmed.dropFirst())
        }
        let parts = trimmed.split(separator: " ").prefix(2)
        if parts.count >= 2 {
            return parts.map { String($0.prefix(1)).uppercased() }.joined()
        }
        return String(trimmed.prefix(2)).uppercased()
    }
}
