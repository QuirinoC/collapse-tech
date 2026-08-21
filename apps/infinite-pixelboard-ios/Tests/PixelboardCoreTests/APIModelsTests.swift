import XCTest
@testable import PixelboardCore

final class APIModelsTests: XCTestCase {
    func testServerNumericEnumsDecode() throws {
        let data = Data(#"{"tier":1,"canPlace":true,"communityStandardsAccepted":true,"cooldown":{"nextPlacementAt":null,"cooldownSeconds":1}}"#.utf8)
        let account = try JSONDecoder().decode(AccountState.self, from: data)
        XCTAssertEqual(account.tier, .pro)
        XCTAssertTrue(account.canPlace)
    }

    func testPlacementEncodesFrozenRowColumnNames() throws {
        let request = PlacementRequest(
            row: -8,
            column: 13,
            color: "#112233",
            idempotencyKey: "request-1",
            client: ClientContext(appVersion: "1.0")
        )
        let object = try XCTUnwrap(
            JSONSerialization.jsonObject(with: JSONEncoder().encode(request)) as? [String: Any]
        )
        XCTAssertEqual(object["row"] as? Int, -8)
        XCTAssertEqual(object["column"] as? Int, 13)
    }
}
