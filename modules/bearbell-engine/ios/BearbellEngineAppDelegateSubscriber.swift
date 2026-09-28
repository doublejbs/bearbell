import ExpoModulesCore

/// Creates `BellEngine.shared` at launch so its Live Activity button observer exists even when the
/// app is cold-launched in the background by `LiveActivityIntent`. Under the UIScene lifecycle no
/// scene (and so no React Native / module instance) is created for such a launch.
public class BearbellEngineAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    _ = BellEngine.shared

    return true
  }
}
