import ActivityKit
import Foundation
import os

/// Updates the Live Activity display from native when JS is not alive (no running-change handler,
/// e.g. a background cold launch from a Live Activity button). See docs/Spec.md §2.1.
///
/// `Activity` is not Sendable, so every function fetches the activities itself; callers run these
/// from a detached task (never on main) and serialize them (see BellEngine's Live Activity task chain).
enum LiveActivityUpdater {
  static let staleInterval: TimeInterval = 180

  private static let logger = Logger(subsystem: "bearbell", category: "LiveActivityUpdater")

  /// Rewrites every activity's props with `isArmed` (and `startedAtMs` when given), keeping `name`
  /// and all other props. Armed passes a `staleDate`; off passes nil (off stays true even if the app dies).
  static func applyArmedState(isArmed: Bool, startedAtMs: Double?, staleDate: Date?) async {
    let activities = Activity<LiveActivityAttributes>.activities

    guard !activities.isEmpty else {
      return
    }

    var updatedCount = 0

    for activity in activities {
      let state = activity.content.state

      guard let props = LiveActivityPropsPatcher.patch(
        propsJSON: state.props,
        isArmed: isArmed,
        startedAtMs: startedAtMs
      ) else {
        logger.error("Skipped a Live Activity with invalid props")

        continue
      }

      let newState = LiveActivityAttributes.ContentState(name: state.name, props: props)

      await activity.update(ActivityContent(state: newState, staleDate: staleDate))
      updatedCount += 1
    }

    logger.info("Updated \(updatedCount, privacy: .public) Live Activities natively (isArmed: \(isArmed, privacy: .public))")
  }

  /// Heartbeat: re-sends each armed activity's current state with a fresh `staleDate`.
  static func refreshStaleDate(_ staleDate: Date) async {
    for activity in Activity<LiveActivityAttributes>.activities {
      let state = activity.content.state

      guard LiveActivityPropsPatcher.isArmed(propsJSON: state.props) == true else {
        continue
      }

      await activity.update(ActivityContent(state: state, staleDate: staleDate))
    }
  }
}
