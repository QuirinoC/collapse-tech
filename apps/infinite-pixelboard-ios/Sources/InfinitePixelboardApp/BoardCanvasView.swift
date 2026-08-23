import SwiftUI
import PixelboardCore

struct BoardCanvasView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var dragOrigin: BoardViewport?
    @State private var magnification = 1.0

    var body: some View {
        GeometryReader { geometry in
            Canvas(opaque: true, colorMode: .nonLinear, rendersAsynchronously: true) { context, size in
                draw(context: &context, size: size)
            }
            .background(Color(uiColor: .systemBackground))
            .contentShape(Rectangle())
            .gesture(panGesture)
            .simultaneousGesture(zoomGesture(size: geometry.size))
            .simultaneousGesture(selectGesture)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Infinite pixel board")
            .accessibilityValue(
                "Selected row \(model.selectedPosition.row), column \(model.selectedPosition.column)"
            )
            .accessibilityAdjustableAction { direction in
                switch direction {
                case .increment:
                    model.selectedPosition = BoardPosition(
                        row: model.selectedPosition.row,
                        column: model.selectedPosition.column + 1
                    )
                case .decrement:
                    model.selectedPosition = BoardPosition(
                        row: model.selectedPosition.row,
                        column: model.selectedPosition.column - 1
                    )
                @unknown default:
                    break
                }
            }
            .accessibilityAction(named: "Move up") {
                moveSelection(rowDelta: -1, columnDelta: 0)
            }
            .accessibilityAction(named: "Move down") {
                moveSelection(rowDelta: 1, columnDelta: 0)
            }
            .accessibilityAction(named: "Move left") {
                moveSelection(rowDelta: 0, columnDelta: -1)
            }
            .accessibilityAction(named: "Move right") {
                moveSelection(rowDelta: 0, columnDelta: 1)
            }
            .task(id: visibleLoadKey(size: geometry.size)) {
                model.resize(to: geometry.size)
                await model.loadVisible(size: geometry.size)
            }
        }
    }

    private var panGesture: some Gesture {
        DragGesture(minimumDistance: 4)
            .onChanged { value in
                if dragOrigin == nil { dragOrigin = model.viewport }
                guard var viewport = dragOrigin else { return }
                viewport.pan(x: value.translation.width, y: value.translation.height)
                model.viewport = viewport
            }
            .onEnded { _ in dragOrigin = nil }
    }

    private func zoomGesture(size: CGSize) -> some Gesture {
        MagnifyGesture()
            .onChanged { value in
                let factor = value.magnification / magnification
                var viewport = model.viewport
                viewport.zoom(
                    atX: size.width / 2,
                    y: size.height / 2,
                    factor: factor
                )
                model.viewport = viewport
                magnification = value.magnification
            }
            .onEnded { _ in magnification = 1 }
    }

    private var selectGesture: some Gesture {
        SpatialTapGesture()
            .onEnded { value in
                let position = model.viewport.screenToBoard(
                    x: value.location.x,
                    y: value.location.y
                )
                if reduceMotion {
                    model.selectedPosition = position
                } else {
                    withAnimation(.easeOut(duration: 0.12)) {
                        model.selectedPosition = position
                    }
                }
            }
    }

    private func visibleLoadKey(size: CGSize) -> String {
        let range = model.viewport.visibleTiles(width: size.width, height: size.height)
        return "\(model.boardGeneration):\(range.firstRow):\(range.lastRow):\(range.firstColumn):\(range.lastColumn)"
    }

    private func moveSelection(rowDelta: Int, columnDelta: Int) {
        model.selectedPosition = BoardPosition(
            row: model.selectedPosition.row + rowDelta,
            column: model.selectedPosition.column + columnDelta
        )
    }

    private func draw(context: inout GraphicsContext, size: CGSize) {
        context.fill(Path(CGRect(origin: .zero, size: size)), with: .color(.white))
        let cell = model.viewport.cellSize * model.viewport.scale
        guard cell >= 1 else { return }
        let range = model.viewport.visibleTiles(width: size.width, height: size.height)

        for address in range.addresses {
            guard let pixels = model.tiles[address] else { continue }
            for offsetRow in pixels.indices {
                for offsetColumn in pixels[offsetRow].indices {
                    let row = address.row * 128 + offsetRow
                    let column = address.column * 128 + offsetColumn
                    let origin = model.viewport.boardToScreen(
                        BoardPosition(row: row, column: column)
                    )
                    context.fill(
                        Path(CGRect(x: origin.x, y: origin.y, width: cell + 0.5, height: cell + 0.5)),
                        with: .color(Color(hex: pixels[offsetRow][offsetColumn]))
                    )
                }
            }
        }

        let selected = model.viewport.boardToScreen(model.selectedPosition)
        context.stroke(
            Path(CGRect(x: selected.x, y: selected.y, width: cell, height: cell)),
            with: .color(.primary),
            lineWidth: max(2, cell / 10)
        )
    }
}

private extension Color {
    init(hex: String) {
        let value = UInt64(hex.dropFirst(), radix: 16) ?? 0
        self.init(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }
}
