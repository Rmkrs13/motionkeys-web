// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "MotionKeys",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "MotionKeys",
            path: "Sources/MotionKeys",
            swiftSettings: [.swiftLanguageMode(.v5)],
            linkerSettings: [
                .linkedFramework("AppKit"),
                .linkedFramework("SwiftUI"),
                .linkedFramework("AVFoundation"),
                .linkedFramework("Vision"),
                .linkedFramework("CoreImage"),
            ]
        ),
    ]
)
