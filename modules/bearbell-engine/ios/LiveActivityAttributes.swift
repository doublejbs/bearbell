import ActivityKit
import Foundation

/// Mirror of expo-widgets' internal `LiveActivityAttributes`
/// (node_modules/expo-widgets/ios/Widgets/WidgetLiveActivity.swift), which this module cannot import.
///
/// ActivityKit identifies activities by the attributes type's name and Codable shape, not its module
/// (the same reason an app target and a widget target can each compile one shared attributes file),
/// so `Activity<LiveActivityAttributes>.activities` here returns the activities expo-widgets started.
/// KEEP IN SYNC with expo-widgets: same type name (top level, not nested), same stored properties and
/// `ContentState` fields. Re-check after every expo-widgets upgrade.
@available(iOS 16.1, *)
struct LiveActivityAttributes: ActivityAttributes {
  var url: String?

  public struct ContentState: Codable, Hashable {
    var name: String
    var props: String
  }

  init(url: String? = nil) {
    self.url = url
  }
}
