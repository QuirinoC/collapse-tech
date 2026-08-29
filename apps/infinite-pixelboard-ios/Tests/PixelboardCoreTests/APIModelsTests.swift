import XCTest
@testable import PixelboardCore

final class APIModelsTests: XCTestCase {
    func testServerNumericEnumsDecode() throws {
        let data = Data(#"{"tier":1,"canPlace":true,"communityStandardsAccepted":true,"cooldown":{"nextPlacementAt":null,"cooldownSeconds":1},"allowedColors":["#D3523C","#123456"]}"#.utf8)
        let account = try JSONDecoder().decode(AccountState.self, from: data)
        XCTAssertEqual(account.tier, .pro)
        XCTAssertTrue(account.canPlace)
        XCTAssertNil(account.isBanned)
        XCTAssertEqual(account.allowedColors, ["#D3523C", "#123456"])
    }

    func testBoardMetadataDecodesOptionalStatusAndMinimumVersion() throws {
        let data = Data(#"{"apiVersion":1,"tileRows":128,"tileColumns":128,"defaultColor":"#FFFFFF","coordinateConvention":"row-column","accessMode":1,"statusMessage":"Painting is paused.","minimumIosVersion":"1.1"}"#.utf8)
        let metadata = try JSONDecoder().decode(BoardMetadata.self, from: data)
        XCTAssertEqual(metadata.accessMode, .readOnly)
        XCTAssertEqual(metadata.statusMessage, "Painting is paused.")
        XCTAssertEqual(metadata.minimumIosVersion, "1.1")
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

    func testStoreKitAccountTokenDecodesCompactServerGUID() throws {
        let data = Data(#"{"appAccountToken":"00112233445566778899aabbccddeeff"}"#.utf8)

        let response = try JSONDecoder().decode(StoreKitAccountTokenResponse.self, from: data)

        XCTAssertEqual(response.appAccountToken.uuidString, "00112233-4455-6677-8899-AABBCCDDEEFF")
    }

    func testRedisStreamCursorUsesNumericComponentOrdering() throws {
        let earlier = try XCTUnwrap(RedisStreamCursor("999-100"))
        let later = try XCTUnwrap(RedisStreamCursor("1000-2"))
        let sameMillisecondLaterSequence = try XCTUnwrap(RedisStreamCursor("1000-10"))

        XCTAssertLessThan(earlier, later)
        XCTAssertLessThan(later, sameMillisecondLaterSequence)
        XCTAssertNil(RedisStreamCursor("invalid"))
    }

    func testPlacementResultPreservesAuthoritativeCooldownDate() throws {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let result = try decoder.decode(
            PlacementResult.self,
            from: Data(
                #"{"outcome":0,"placementId":"placement-1","pixel":null,"cooldown":{"nextPlacementAt":"2026-08-27T00:00:10Z","cooldownSeconds":10},"error":null}"#.utf8
            )
        )

        XCTAssertEqual(result.cooldown.cooldownSeconds, 10)
        XCTAssertEqual(
            result.cooldown.nextPlacementAt,
            ISO8601DateFormatter().date(from: "2026-08-27T00:00:10Z")
        )
    }
}
