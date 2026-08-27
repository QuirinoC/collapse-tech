import XCTest
@testable import PixelboardCore

final class BoardRealtimeTests: XCTestCase {
    func testFrameBufferPreservesCoalescedAndPartialSignalRFrames() {
        var buffer = SignalRFrameBuffer()

        XCTAssertEqual(
            buffer.append("{}\u{001e}{\"type\":1"),
            ["{}"]
        )
        XCTAssertEqual(
            buffer.append("}\u{001e}"),
            ["{\"type\":1}"]
        )
    }

    func testHandshakeParserAcceptsSuccessAndRejectsErrorsOrInvocations() {
        XCTAssertEqual(
            SignalRHandshakeResponse.parse(Data("{}".utf8)),
            .success
        )
        XCTAssertEqual(
            SignalRHandshakeResponse.parse(Data(#"{"error":"unsupported protocol"}"#.utf8)),
            .failure("unsupported protocol")
        )
        XCTAssertEqual(
            SignalRHandshakeResponse.parse(Data(#"{"type":1}"#.utf8)),
            .failure("The SignalR handshake response contained unsupported fields.")
        )
    }
}
