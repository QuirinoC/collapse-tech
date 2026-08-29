import XCTest
@testable import PixelboardCore

final class BoardGeometryTests: XCTestCase {
    func testNegativeCoordinatesUseFloorDivision() {
        XCTAssertEqual(floorDivide(-1, by: 128), -1)
        XCTAssertEqual(floorDivide(-128, by: 128), -1)
        XCTAssertEqual(floorDivide(-129, by: 128), -2)

        let location = locatePixel(BoardPosition(row: -129, column: -1))
        XCTAssertEqual(location.address, TileAddress(row: -2, column: -1))
        XCTAssertEqual(location.offsetRow, 127)
        XCTAssertEqual(location.offsetColumn, 127)
    }

    func testRowsMapToVisualYAndColumnsMapToVisualX() {
        let viewport = BoardViewport(width: 400, height: 300)
        let point = viewport.boardToScreen(BoardPosition(row: 3, column: 7))
        XCTAssertEqual(point.x, 284)
        XCTAssertEqual(point.y, 186)
        XCTAssertEqual(viewport.screenToBoard(x: point.x, y: point.y), BoardPosition(row: 3, column: 7))
    }

    func testCenteredReportRegionMatchesWebContract() {
        XCTAssertEqual(
            ReportRegion.centered(on: BoardPosition(row: -4, column: 12), width: 8, height: 8),
            ReportRegion(top: -7, left: 9, width: 8, height: 8)
        )
    }

    func testInviteAndPositionLinksRoundTrip() throws {
        let invite = BoardLinks.invite(code: "ABCD2345")
        XCTAssertEqual(BoardLinks.referralCode(from: invite), "ABCD2345")
        XCTAssertEqual(
            BoardLinks.referralCode(from: URL(string: "pixelboard://invite/ABCD2345")!),
            "ABCD2345"
        )
        let position = BoardLinks.position(row: -4, column: 12)
        XCTAssertEqual(BoardLinks.position(from: position), BoardPosition(row: -4, column: 12))
    }

    func testZoomKeepsAnchorFixed() {
        var viewport = BoardViewport(width: 400, height: 300)
        let before = viewport.screenToBoard(x: 80, y: 90)
        viewport.zoom(atX: 80, y: 90, factor: 2)
        XCTAssertEqual(viewport.screenToBoard(x: 80, y: 90), before)
    }
}
