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
            .background(PixelboardTheme.paper)
            .contentShape(Rectangle())
            .gesture(panGesture)
            .simultaneousGesture(zoomGesture(size: geometry.size))
            .simultaneousGesture(selectGesture)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(PixelboardL10n.infinitePixelBoard)
            .accessibilityValue(
                PixelboardL10n.selectedPosition(
                    row: model.selectedPosition.row,
                    column: model.selectedPosition.column
                )
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
            .accessibilityAction(named: PixelboardL10n.moveUp) {
                moveSelection(rowDelta: -1, columnDelta: 0)
            }
            .accessibilityAction(named: PixelboardL10n.moveDown) {
                moveSelection(rowDelta: 1, columnDelta: 0)
            }
            .accessibilityAction(named: PixelboardL10n.moveLeft) {
                moveSelection(rowDelta: 0, columnDelta: -1)
            }
            .accessibilityAction(named: PixelboardL10n.moveRight) {
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
            .onEnded { _ in
                dragOrigin = nil
                model.persistView()
            }
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
            .onEnded { _ in
                magnification = 1
                model.persistView()
            }
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
                model.persistView()
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

    @_optimize(none)
    private func draw(context: inout GraphicsContext, size: CGSize) {
        context.fill(Path(CGRect(origin: .zero, size: size)), with: .color(PixelboardTheme.paper))
        let cell = model.viewport.cellSize * model.viewport.scale
        guard cell >= 1 else { return }
        let range = model.viewport.visibleTiles(width: size.width, height: size.height)
        let defaultColor = (model.metadata?.defaultColor ?? "#FFFFFF").uppercased()
        let tileRows = model.metadata?.tileRows ?? 128
        let tileColumns = model.metadata?.tileColumns ?? 128

        for address in range.addresses {
            guard let pixels = model.tiles[address] else { continue }
            for offsetRow in pixels.indices {
                for offsetColumn in pixels[offsetRow].indices {
                    let color = pixels[offsetRow][offsetColumn]
                    if color.uppercased() == defaultColor { continue }
                    let row = address.row * tileRows + offsetRow
                    let column = address.column * tileColumns + offsetColumn
                    let origin = model.viewport.boardToScreen(
                        BoardPosition(row: row, column: column)
                    )
                    // Expand by 1pt so neighboring network tiles abut without hairline seams.
                    context.fill(
                        Path(CGRect(x: origin.x, y: origin.y, width: cell + 1, height: cell + 1)),
                        with: .color(Color(pixelboardHex: color))
                    )
                }
            }
        }

        let selected = model.viewport.boardToScreen(model.selectedPosition)
        let highlight = CGRect(
            x: selected.x + 1,
            y: selected.y + 1,
            width: max(1, cell - 2),
            height: max(1, cell - 2)
        )
        context.stroke(Path(highlight), with: .color(PixelboardTheme.accent), lineWidth: 2)
    }
}
