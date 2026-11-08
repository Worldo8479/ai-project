// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "RetainerLens",
    platforms: [.macOS(.v14)],
    products: [.executable(name: "RetainerLens", targets: ["RetainerLensApp"])],
    targets: [
        .target(name: "RetainerCore"),
        .executableTarget(name: "RetainerLensApp", dependencies: ["RetainerCore"]),
        .testTarget(name: "RetainerCoreTests", dependencies: ["RetainerCore"], resources: [.copy("Fixtures")])
    ]
)
