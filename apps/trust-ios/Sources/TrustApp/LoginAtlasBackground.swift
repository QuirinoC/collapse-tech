import SwiftUI

/// First-open plate: deconstructed geodesy — meridians, isolines, a few coordinates.
/// Not a street map. (Other options: iOS 18 MeshGradient wash, muted MapKit snapshot.)
struct LoginAtlasBackground: View {
    @Environment(\.trustPalette) private var palette
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 24.0, paused: reduceMotion)) { timeline in
            let time = reduceMotion ? 0 : timeline.date.timeIntervalSinceReferenceDate
            Canvas { context, size in
                draw(context: &context, size: size, time: time)
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .overlay {
            ZStack {
                RadialGradient(
                    colors: [palette.paper.opacity(0.90), palette.paper.opacity(0)],
                    center: UnitPoint(x: 0.5, y: 0.42),
                    startRadius: 40,
                    endRadius: 280
                )
                VStack(spacing: 0) {
                    LinearGradient(
                        colors: [palette.paper, palette.paper.opacity(0)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                    .frame(height: 128)
                    Spacer()
                    LinearGradient(
                        colors: [
                            palette.paper.opacity(0),
                            palette.paper.opacity(0.80),
                            palette.paper
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                    .frame(height: 280)
                }
            }
            .allowsHitTesting(false)
        }
    }

    private func draw(context: inout GraphicsContext, size: CGSize, time: TimeInterval) {
        let ink = palette.ink
        let accent = palette.accent
        let w = size.width
        let h = size.height
        let cx = w * 0.5
        let cy = h * 0.40
        let phase = time * 0.07

        drawMeridians(context: &context, size: size, cx: cx, phase: phase, ink: ink)
        drawParallels(context: &context, size: size, cy: cy, phase: phase, ink: ink)
        drawGlobe(context: &context, cx: cx, cy: cy, w: w, h: h, phase: phase, ink: ink)
        drawContours(context: &context, cx: cx, cy: cy, w: w, h: h, phase: phase, ink: ink)
        drawFix(context: &context, size: size, time: time, ink: ink, accent: accent)
        drawCoordinates(context: &context, size: size, ink: ink)
    }

    private func drawMeridians(
        context: inout GraphicsContext,
        size: CGSize,
        cx: CGFloat,
        phase: Double,
        ink: Color
    ) {
        var grid = Path()
        let count = 4
        for i in 0...count {
            let base = size.width * (CGFloat(i) / CGFloat(count))
            let drift = CGFloat(sin(phase + Double(i) * 0.55)) * 5
            var meridian = Path()
            meridian.move(to: CGPoint(x: base + drift, y: 0))
            meridian.addQuadCurve(
                to: CGPoint(x: base - drift * 0.4, y: size.height),
                control: CGPoint(x: base + (base - cx) * 0.12, y: size.height * 0.48)
            )
            grid.addPath(meridian)
        }
        context.stroke(grid, with: .color(ink.opacity(0.034)), lineWidth: 0.45)
    }

    private func drawParallels(
        context: inout GraphicsContext,
        size: CGSize,
        cy: CGFloat,
        phase: Double,
        ink: Color
    ) {
        var grid = Path()
        let count = 5
        for j in 0...count {
            let y = size.height * (CGFloat(j) / CGFloat(count))
            let bulge = (y - cy) * 0.035 + CGFloat(sin(phase * 0.8 + Double(j) * 0.35)) * 2.5
            var parallel = Path()
            parallel.move(to: CGPoint(x: 0, y: y))
            parallel.addQuadCurve(
                to: CGPoint(x: size.width, y: y),
                control: CGPoint(x: size.width * 0.5, y: y + bulge)
            )
            grid.addPath(parallel)
        }
        context.stroke(grid, with: .color(ink.opacity(0.028)), lineWidth: 0.4)
    }

    private func drawGlobe(
        context: inout GraphicsContext,
        cx: CGFloat,
        cy: CGFloat,
        w: CGFloat,
        h: CGFloat,
        phase: Double,
        ink: Color
    ) {
        let rect = CGRect(
            x: cx - w * 0.42,
            y: cy - h * 0.20,
            width: w * 0.84,
            height: h * 0.40
        )
        context.stroke(
            Path(ellipseIn: rect),
            with: .color(ink.opacity(0.045)),
            style: StrokeStyle(lineWidth: 0.5, dash: [2.5, 8], dashPhase: CGFloat(phase) * 12)
        )

        for k in -1...1 where k != 0 {
            var arc = Path()
            let inset = abs(CGFloat(k)) * w * 0.08
            arc.addEllipse(in: rect.insetBy(dx: inset, dy: -h * 0.01 * CGFloat(k)))
            context.stroke(arc, with: .color(ink.opacity(0.024)), lineWidth: 0.4)
        }
    }

    private func drawContours(
        context: inout GraphicsContext,
        cx: CGFloat,
        cy: CGFloat,
        w: CGFloat,
        h: CGFloat,
        phase: Double,
        ink: Color
    ) {
        let bands: [(CGFloat, CGFloat, Double)] = [
            (0.20, 0.11, 0.0),
            (0.30, 0.16, 1.1)
        ]
        for (index, band) in bands.enumerated() {
            var contour = Path()
            let steps = 48
            let ox = cx + CGFloat(sin(phase * 0.65 + band.2)) * 16
            let oy = cy + CGFloat(cos(phase * 0.45 + band.2)) * 9
            for step in 0...steps {
                let angle = (CGFloat(step) / CGFloat(steps)) * .pi * 2
                let wobble = 1 + 0.07 * sin(angle * 3 + CGFloat(phase) + CGFloat(index))
                let point = CGPoint(
                    x: ox + cos(angle) * w * band.0 * wobble,
                    y: oy + sin(angle) * h * band.1 * wobble
                )
                if step == 0 {
                    contour.move(to: point)
                } else {
                    contour.addLine(to: point)
                }
            }
            contour.closeSubpath()
            context.stroke(contour, with: .color(ink.opacity(0.042)), lineWidth: 0.5)
        }
    }

    private func drawFix(
        context: inout GraphicsContext,
        size: CGSize,
        time: TimeInterval,
        ink: Color,
        accent: Color
    ) {
        let pulse = 0.45 + 0.35 * (sin(time * 1.15) + 1) / 2
        let fix = CGPoint(x: size.width * 0.70, y: size.height * 0.34)
        let arm: CGFloat = 6.5
        var cross = Path()
        cross.move(to: CGPoint(x: fix.x - arm, y: fix.y))
        cross.addLine(to: CGPoint(x: fix.x + arm, y: fix.y))
        cross.move(to: CGPoint(x: fix.x, y: fix.y - arm))
        cross.addLine(to: CGPoint(x: fix.x, y: fix.y + arm))
        context.stroke(cross, with: .color(accent.opacity(0.12 + 0.14 * pulse)), lineWidth: 0.75)
        context.stroke(
            Path(ellipseIn: CGRect(x: fix.x - 13, y: fix.y - 13, width: 26, height: 26)),
            with: .color(ink.opacity(0.048)),
            lineWidth: 0.45
        )
        context.fill(
            Path(CGRect(x: fix.x - 1.5, y: fix.y - 1.5, width: 3, height: 3)),
            with: .color(accent.opacity(0.22 + 0.12 * pulse))
        )
    }

    private func drawCoordinates(context: inout GraphicsContext, size: CGSize, ink: Color) {
        let labels: [(String, CGPoint, UnitPoint)] = [
            ("40°42′ N", CGPoint(x: 22, y: size.height * 0.19), .leading),
            ("074°00′ W", CGPoint(x: size.width - 22, y: size.height * 0.52), .trailing),
            ("+00.00", CGPoint(x: 22, y: size.height * 0.63), .leading)
        ]
        for (text, point, anchor) in labels {
            context.draw(
                Text(text)
                    .font(TrustTheme.mono(8))
                    .tracking(0.8)
                    .foregroundColor(ink.opacity(0.12)),
                at: point,
                anchor: anchor
            )
        }
    }
}
