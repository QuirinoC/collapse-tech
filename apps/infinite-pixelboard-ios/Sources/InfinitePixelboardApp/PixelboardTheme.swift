import SwiftUI
import UIKit

enum PixelboardTheme {
    static let paper = Color(red: 238 / 255, green: 232 / 255, blue: 220 / 255)
    static let paperDeep = Color(red: 221 / 255, green: 212 / 255, blue: 197 / 255)
    static let ink = Color(red: 23 / 255, green: 23 / 255, blue: 20 / 255)
    static let muted = Color(red: 111 / 255, green: 106 / 255, blue: 97 / 255)
    static let line = ink.opacity(0.25)
    static let accent = Color(red: 211 / 255, green: 82 / 255, blue: 60 / 255)
    static let panel = Color(red: 244 / 255, green: 240 / 255, blue: 232 / 255).opacity(0.94)
    static let live = Color(red: 79 / 255, green: 115 / 255, blue: 85 / 255)
    static let syncing = Color(red: 200 / 255, green: 138 / 255, blue: 42 / 255)

    static func sans(_ size: CGFloat, weight: Font.Weight = .medium) -> Font {
        Font.custom("Space Grotesk", size: size).weight(weight)
    }

    static func mono(_ size: CGFloat) -> Font {
        Font.custom("IBM Plex Mono", size: size).weight(.medium)
    }

    static func signed(_ value: Int) -> String {
        "\(value < 0 ? "−" : "+")\(String(format: "%04d", abs(value)))"
    }

    static func coordinate(row: Int, column: Int) -> String {
        "ROW \(signed(row)) / COL \(signed(column))"
    }
}

extension Color {
    init(pixelboardHex: String) {
        let hex = pixelboardHex.hasPrefix("#") ? String(pixelboardHex.dropFirst()) : pixelboardHex
        let value = UInt64(hex, radix: 16) ?? 0
        self.init(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }

    var pixelboardHex: String? {
        let converted = UIColor(self).cgColor.converted(
            to: CGColorSpaceCreateDeviceRGB(),
            intent: .relativeColorimetric,
            options: nil
        )
        guard let components = converted?.components, components.count >= 3 else {
            return nil
        }
        return String(
            format: "#%02X%02X%02X",
            Int((components[0] * 255).rounded()),
            Int((components[1] * 255).rounded()),
            Int((components[2] * 255).rounded())
        )
    }
}

struct PixelboardWordmark: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text("COLLAPSE")
                .font(PixelboardTheme.sans(12.5, weight: .semibold))
                .tracking(-0.7)
            Text("TECHNOLOGIES")
                .font(PixelboardTheme.sans(8.4, weight: .semibold))
                .tracking(0.9)
        }
        .foregroundStyle(PixelboardTheme.ink)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Collapse Technologies Infinite Pixelboard")
    }
}

struct PixelboardEyebrow: View {
    let text: String

    var body: some View {
        Text(text)
            .font(PixelboardTheme.mono(10))
            .tracking(1.6)
            .textCase(.uppercase)
            .foregroundStyle(PixelboardTheme.muted)
    }
}

struct PixelboardPanelHeading: View {
    let eyebrow: String
    let title: String
    let close: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                PixelboardEyebrow(text: eyebrow)
                Spacer()
                Button("Close", action: close)
                    .buttonStyle(PixelboardTextButtonStyle())
            }
            .padding(.bottom, 56)
            Text(title)
                .font(PixelboardTheme.sans(44, weight: .medium))
                .tracking(-2.4)
                .textCase(.uppercase)
                .foregroundStyle(PixelboardTheme.ink)
                .lineSpacing(-8)
        }
    }
}

struct PixelboardTextButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(PixelboardTheme.mono(11))
            .tracking(0.9)
            .textCase(.uppercase)
            .foregroundStyle(PixelboardTheme.ink.opacity(configuration.isPressed ? 0.45 : 1))
    }
}

struct PixelboardOutlineButtonStyle: ButtonStyle {
    var compact = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(compact ? PixelboardTheme.mono(11) : PixelboardTheme.sans(13.5, weight: .medium))
            .tracking(compact ? 0.9 : 0)
            .textCase(compact ? .uppercase : nil)
            .foregroundStyle(configuration.isPressed ? PixelboardTheme.paper : PixelboardTheme.ink)
            .frame(maxWidth: .infinity, minHeight: compact ? 44 : 49, alignment: .leading)
            .padding(.horizontal, 16)
            .background(configuration.isPressed ? PixelboardTheme.ink : Color.clear)
            .overlay(Rectangle().stroke(PixelboardTheme.ink, lineWidth: 1))
    }
}

struct PixelboardFilledButtonStyle: ButtonStyle {
    var expand = true

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(PixelboardTheme.mono(11.5))
            .tracking(1.2)
            .textCase(.uppercase)
            .foregroundStyle(PixelboardTheme.paper.opacity(configuration.isPressed ? 0.7 : 1))
            .padding(.horizontal, 12)
            .frame(maxWidth: expand ? .infinity : nil, minHeight: 45)
            .background(PixelboardTheme.ink)
    }
}

struct PixelboardHardButtonStyle: ButtonStyle {
    var minHeight: CGFloat = 36

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(PixelboardTheme.mono(minHeight >= 44 ? 12 : 11))
            .tracking(0.9)
            .textCase(.uppercase)
            .foregroundStyle(configuration.isPressed ? PixelboardTheme.paper : PixelboardTheme.ink)
            .padding(.horizontal, minHeight >= 44 ? 16 : 12)
            .frame(minHeight: minHeight)
            .background {
                Rectangle()
                    .fill(configuration.isPressed ? PixelboardTheme.ink : PixelboardTheme.paper)
                    .overlay(Rectangle().stroke(PixelboardTheme.ink, lineWidth: 1))
                    .shadow(
                        color: configuration.isPressed ? .clear : PixelboardTheme.ink,
                        radius: 0,
                        x: 3,
                        y: 3
                    )
            }
            .offset(
                x: configuration.isPressed ? 3 : 0,
                y: configuration.isPressed ? 3 : 0
            )
    }
}

struct PixelboardFieldLabel<Content: View>: View {
    let title: String
    let hint: String?
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack {
                Text(title)
                if let hint {
                    Spacer()
                    Text(hint).font(PixelboardTheme.mono(8.5))
                }
            }
            .font(PixelboardTheme.mono(10))
            .tracking(0.9)
            .textCase(.uppercase)
            .foregroundStyle(PixelboardTheme.muted)
            content
        }
    }
}
