import SwiftUI

#if canImport(FirebaseCore)
import FirebaseCore
#endif
#if canImport(FirebaseCrashlytics)
import FirebaseCrashlytics
#endif
#if canImport(GoogleSignIn)
import GoogleSignIn
#endif

@main
struct InfinitePixelboardApp: App {
    @StateObject private var model = AppModel()
    @Environment(\.scenePhase) private var scenePhase

    init() {
        #if canImport(FirebaseCore)
        if Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil {
            FirebaseApp.configure()
            #if canImport(FirebaseCrashlytics)
            Crashlytics.crashlytics().setCrashlyticsCollectionEnabled(true)
            #endif
        }
        #endif
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(model)
                .preferredColorScheme(.light)
                .tint(PixelboardTheme.ink)
                .task { await model.start() }
                .task(id: scenePhase) {
                    await model.handleScenePhase(scenePhase)
                }
                .onOpenURL { url in
                    #if canImport(GoogleSignIn)
                    if GIDSignIn.sharedInstance.handle(url) { return }
                    #endif
                    model.handleIncomingURL(url)
                }
        }
    }
}
