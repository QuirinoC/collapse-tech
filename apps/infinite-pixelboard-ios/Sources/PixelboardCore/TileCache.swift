import Foundation

public actor TileCache {
    public typealias Loader = @Sendable (TileAddress) async throws -> TileSnapshot

    private struct Entry {
        var pixels: [[String]]
        var lastUsed: UInt64
        var isComplete: Bool
    }

    public let tileRows: Int
    public let tileColumns: Int
    public let defaultColor: String
    public let maximumTiles: Int

    private let loader: Loader
    private var entries: [TileAddress: Entry] = [:]
    private var loadingAddresses: Set<TileAddress> = []
    private var pendingOverrides: [TileAddress: [Int: String]] = [:]
    private var clock: UInt64 = 0

    public init(
        tileRows: Int = 128,
        tileColumns: Int = 128,
        defaultColor: String = "#FFFFFF",
        maximumTiles: Int = 96,
        loader: @escaping Loader
    ) {
        precondition(tileRows > 0 && tileColumns > 0 && maximumTiles > 0)
        self.tileRows = tileRows
        self.tileColumns = tileColumns
        self.defaultColor = defaultColor
        self.maximumTiles = maximumTiles
        self.loader = loader
    }

    public func ensure(_ addresses: [TileAddress]) async {
        await load(addresses.filter { entries[$0]?.isComplete != true })
    }

    public func refresh(_ addresses: [TileAddress]) async {
        await load(addresses)
    }

    private func load(_ addresses: [TileAddress]) async {
        for address in addresses {
            guard loadingAddresses.insert(address).inserted else { continue }
            do {
                let snapshot = try await loader(address)
                guard snapshot.pixels.count == tileRows,
                      snapshot.pixels.allSatisfy({ $0.count == tileColumns }) else {
                    loadingAddresses.remove(address)
                    continue
                }
                var pixels = snapshot.pixels
                for (offset, color) in pendingOverrides.removeValue(forKey: address) ?? [:] {
                    pixels[offset / tileColumns][offset % tileColumns] = color
                }
                clock += 1
                entries[address] = Entry(pixels: pixels, lastUsed: clock, isComplete: true)
            } catch {
                // A failed tile remains eligible for a later visible-range retry.
            }
            loadingAddresses.remove(address)
        }
        evictIfNeeded()
    }

    public func color(at position: BoardPosition) -> String {
        let location = locatePixel(position, tileRows: tileRows, tileColumns: tileColumns)
        guard var entry = entries[location.address] else { return defaultColor }
        clock += 1
        entry.lastUsed = clock
        entries[location.address] = entry
        return entry.pixels[location.offsetRow][location.offsetColumn]
    }

    public func apply(_ pixel: PixelState) {
        let position = BoardPosition(row: pixel.row, column: pixel.column)
        let location = locatePixel(position, tileRows: tileRows, tileColumns: tileColumns)
        guard entries[location.address] != nil || loadingAddresses.contains(location.address) else {
            return
        }
        var entry = entries[location.address] ?? Entry(
            pixels: Array(
                repeating: Array(repeating: defaultColor, count: tileColumns),
                count: tileRows
            ),
            lastUsed: 0,
            isComplete: false
        )
        if !entry.isComplete || loadingAddresses.contains(location.address) {
            let offset = location.offsetRow * tileColumns + location.offsetColumn
            pendingOverrides[location.address, default: [:]][offset] = pixel.color
        }
        clock += 1
        entry.lastUsed = clock
        entry.pixels[location.offsetRow][location.offsetColumn] = pixel.color
        entries[location.address] = entry
        evictIfNeeded()
    }

    public func snapshot() -> [TileAddress: [[String]]] {
        entries.mapValues(\.pixels)
    }

    public var count: Int { entries.count }

    private func evictIfNeeded() {
        guard entries.count > maximumTiles else { return }
        let overflow = entries.count - maximumTiles
        let oldest = entries.sorted { $0.value.lastUsed < $1.value.lastUsed }.prefix(overflow)
        oldest.forEach { entries.removeValue(forKey: $0.key) }
    }
}
