// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "InfinitePixelboard",
    platforms: [
        .iOS(.v17),
        .macOS(.v13)
    ],
    products: [
        .library(name: "PixelboardCore", targets: ["PixelboardCore"])
    ],
    targets: [
        .target(
            name: "PixelboardCore",
            path: "Sources/PixelboardCore"
        ),
        .testTarget(
            name: "PixelboardCoreTests",
            dependencies: ["PixelboardCore"],
            path: "Tests/PixelboardCoreTests"
        )
    ],
    swiftLanguageModes: [.v5]
)
