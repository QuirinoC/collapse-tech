import XCTest
@testable import PixelboardCore

final class TileCacheTests: XCTestCase {
    func testCacheIsBoundedAndAppliesNegativePixel() async {
        let cache = TileCache(tileRows: 2, tileColumns: 2, maximumTiles: 2) { address in
            TileSnapshot(
                apiVersion: 1,
                tileRow: address.row,
                tileColumn: address.column,
                pixels: Array(repeating: Array(repeating: "#FFFFFF", count: 2), count: 2),
                capturedAt: Date()
            )
        }
        await cache.ensure([
            TileAddress(row: 0, column: 0),
            TileAddress(row: 0, column: 1),
            TileAddress(row: 0, column: 2)
        ])
        let countAfterLoad = await cache.count
        XCTAssertEqual(countAfterLoad, 2)

        let negativeAddress = TileAddress(row: -1, column: -1)
        await cache.ensure([negativeAddress])
        await cache.apply(PixelState(row: -1, column: -1, color: "#ABCDEF", placedAt: Date()))
        let color = await cache.color(at: BoardPosition(row: -1, column: -1))
        let countAfterMutation = await cache.count
        XCTAssertEqual(color, "#ABCDEF")
        XCTAssertEqual(countAfterMutation, 2)
    }

    func testOffscreenRealtimePixelDoesNotPreventSnapshotLoad() async {
        let cache = TileCache(tileRows: 2, tileColumns: 2, maximumTiles: 2) { address in
            TileSnapshot(
                apiVersion: 1,
                tileRow: address.row,
                tileColumn: address.column,
                pixels: [["#111111", "#222222"], ["#333333", "#444444"]],
                capturedAt: Date()
            )
        }
        let address = TileAddress(row: 4, column: -2)
        await cache.apply(PixelState(row: 8, column: -3, color: "#ABCDEF", placedAt: Date()))

        await cache.ensure([address])

        let firstColor = await cache.color(at: BoardPosition(row: 8, column: -4))
        let secondColor = await cache.color(at: BoardPosition(row: 8, column: -3))
        XCTAssertEqual(firstColor, "#111111")
        XCTAssertEqual(secondColor, "#222222")
    }
}
