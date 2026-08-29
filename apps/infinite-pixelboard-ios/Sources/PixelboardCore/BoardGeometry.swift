import Foundation

public struct BoardPosition: Hashable, Sendable {
    public let row: Int
    public let column: Int

    public init(row: Int, column: Int) {
        self.row = row
        self.column = column
    }
}

public struct TileAddress: Hashable, Sendable {
    public let row: Int
    public let column: Int

    public init(row: Int, column: Int) {
        self.row = row
        self.column = column
    }
}

public struct TileLocation: Equatable, Sendable {
    public let address: TileAddress
    public let offsetRow: Int
    public let offsetColumn: Int
}

public struct TileRange: Equatable, Sendable {
    public let firstRow: Int
    public let lastRow: Int
    public let firstColumn: Int
    public let lastColumn: Int

    public var addresses: [TileAddress] {
        guard firstRow <= lastRow, firstColumn <= lastColumn else { return [] }
        return (firstRow...lastRow).flatMap { row in
            (firstColumn...lastColumn).map { TileAddress(row: row, column: $0) }
        }
    }
}

public struct BoardViewport: Equatable, Sendable {
    public static let minimumScale = 0.25
    public static let maximumScale = 6.0

    public var offsetX: Double
    public var offsetY: Double
    public var scale: Double
    public let cellSize: Double

    public init(width: Double, height: Double, scale: Double = 1, cellSize: Double = 12) {
        offsetX = width / 2
        offsetY = height / 2
        self.scale = min(Self.maximumScale, max(Self.minimumScale, scale))
        self.cellSize = cellSize
    }

    public func screenToBoard(x: Double, y: Double) -> BoardPosition {
        let renderedCellSize = cellSize * scale
        return BoardPosition(
            row: Int(floor((y - offsetY) / renderedCellSize)),
            column: Int(floor((x - offsetX) / renderedCellSize))
        )
    }

    public func boardToScreen(_ position: BoardPosition) -> CGPoint {
        let renderedCellSize = cellSize * scale
        return CGPoint(
            x: Double(position.column) * renderedCellSize + offsetX,
            y: Double(position.row) * renderedCellSize + offsetY
        )
    }

    public mutating func pan(x: Double, y: Double) {
        offsetX += x
        offsetY += y
    }

    public mutating func zoom(atX x: Double, y: Double, factor: Double) {
        let nextScale = min(Self.maximumScale, max(Self.minimumScale, scale * factor))
        let ratio = nextScale / scale
        offsetX = x - (x - offsetX) * ratio
        offsetY = y - (y - offsetY) * ratio
        scale = nextScale
    }

    public mutating func center(on position: BoardPosition, width: Double, height: Double) {
        let renderedCellSize = cellSize * scale
        offsetX = width / 2 - (Double(position.column) + 0.5) * renderedCellSize
        offsetY = height / 2 - (Double(position.row) + 0.5) * renderedCellSize
    }

    public func visibleTiles(width: Double, height: Double, tileSize: Int = 128) -> TileRange {
        let topLeft = screenToBoard(x: 0, y: 0)
        let bottomRight = screenToBoard(x: width, y: height)
        return TileRange(
            firstRow: floorDivide(topLeft.row, by: tileSize),
            lastRow: floorDivide(bottomRight.row, by: tileSize),
            firstColumn: floorDivide(topLeft.column, by: tileSize),
            lastColumn: floorDivide(bottomRight.column, by: tileSize)
        )
    }
}

public func floorDivide(_ value: Int, by divisor: Int) -> Int {
    precondition(divisor > 0)
    let quotient = value / divisor
    let remainder = value % divisor
    return remainder < 0 ? quotient - 1 : quotient
}

public func positiveModulo(_ value: Int, modulus: Int) -> Int {
    precondition(modulus > 0)
    let remainder = value % modulus
    return remainder >= 0 ? remainder : remainder + modulus
}

public func locatePixel(_ position: BoardPosition, tileRows: Int = 128, tileColumns: Int = 128) -> TileLocation {
    TileLocation(
        address: TileAddress(
            row: floorDivide(position.row, by: tileRows),
            column: floorDivide(position.column, by: tileColumns)
        ),
        offsetRow: positiveModulo(position.row, modulus: tileRows),
        offsetColumn: positiveModulo(position.column, modulus: tileColumns)
    )
}
