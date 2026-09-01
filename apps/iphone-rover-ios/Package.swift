// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "iPhoneRover",
    platforms: [
        .iOS(.v17),
        .macOS(.v13)
    ],
    products: [
        .library(name: "RoverCore", targets: ["RoverCore"]),
        .executable(name: "RoverCoreChecks", targets: ["RoverCoreChecks"])
    ],
    targets: [
        .target(
            name: "RoverCore",
            path: "Sources/RoverCore"
        ),
        .executableTarget(
            name: "RoverCoreChecks",
            dependencies: ["RoverCore"],
            path: "Sources/RoverCoreChecks"
        )
    ],
    swiftLanguageModes: [.v5]
)
