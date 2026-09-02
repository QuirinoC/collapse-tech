import SwiftUI

@main
struct RoverApp: App {
    @StateObject private var session = RoverSessionModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(session)
        }
    }
}
