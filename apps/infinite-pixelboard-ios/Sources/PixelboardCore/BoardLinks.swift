import Foundation

public enum BoardLinks {
    public static let origin = URL(string: "https://pixelboard.collapsetechnologies.com")!

    public static func invite(code: String) -> URL {
        var components = URLComponents(url: origin, resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "ref", value: code)]
        return components.url ?? origin
    }

    public static func iosInvite(code: String) -> URL {
        URL(string: "pixelboard://invite/\(code)")!
    }

    public static func position(row: Int, column: Int) -> URL {
        var components = URLComponents(url: origin, resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "row", value: String(row)),
            URLQueryItem(name: "col", value: String(column))
        ]
        return components.url ?? origin
    }

    public static func referralCode(from url: URL) -> String? {
        let code = queryValue("ref", in: url) ?? hostCode(from: url)
        return Self.normalizeReferralCode(code)
    }

    public static func position(from url: URL) -> BoardPosition? {
        guard let row = queryInt("row", in: url) ?? queryInt("r", in: url),
              let column = queryInt("col", in: url) ?? queryInt("c", in: url) else {
            return nil
        }
        return BoardPosition(row: row, column: column)
    }

    public static func normalizeReferralCode(_ value: String?) -> String? {
        guard let value else { return nil }
        let cleaned = value.uppercased().filter { $0 != "-" && !$0.isWhitespace }
        let alphabet = Set("ABCDEFGHJKLMNPQRSTUVWXYZ23456789")
        guard cleaned.count == 8, cleaned.allSatisfy({ alphabet.contains($0) }) else {
            return nil
        }
        return cleaned
    }

    private static func queryValue(_ name: String, in url: URL) -> String? {
        URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?
            .first { $0.name == name }?
            .value
    }

    private static func queryInt(_ name: String, in url: URL) -> Int? {
        queryValue(name, in: url).flatMap(Int.init)
    }

    private static func hostCode(from url: URL) -> String? {
        guard url.scheme == "pixelboard" else { return nil }
        if url.host == "invite" {
            return url.path.split(separator: "/").last.map(String.init)
        }
        return url.host
    }
}

public extension ReportRegion {
    static func centered(
        on position: BoardPosition,
        width: Int = 8,
        height: Int = 8
    ) -> ReportRegion {
        let boundedWidth = min(64, max(1, width))
        let boundedHeight = min(64, max(1, height))
        return ReportRegion(
            top: position.row - (boundedHeight - 1) / 2,
            left: position.column - (boundedWidth - 1) / 2,
            width: boundedWidth,
            height: boundedHeight
        )
    }
}
