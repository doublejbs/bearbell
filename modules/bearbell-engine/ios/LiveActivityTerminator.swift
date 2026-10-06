import ActivityKit
import Foundation
import os

/// Ends every Live Activity when the app is about to terminate (see BellEngine's willTerminate observer).
enum LiveActivityTerminator {
  private static let logger = Logger(subsystem: "bearbell", category: "LiveActivityTerminator")
  private static let endTimeout: DispatchTimeInterval = .seconds(2)

  /// Ends all activities with `.immediate` dismissal and blocks the calling (main) thread until they
  /// finish or `endTimeout` elapses: the process exits right after `willTerminate` returns.
  /// The work runs in a detached task that never touches the main actor, so blocking main cannot deadlock;
  /// the timeout bounds the wait even if ActivityKit itself stalls.
  static func endAllActivitiesBlocking() {
    let semaphore = DispatchSemaphore(value: 0)

    Task.detached(priority: .userInitiated) {
      await endAllActivities()
      semaphore.signal()
    }

    if semaphore.wait(timeout: .now() + endTimeout) == .timedOut {
      logger.error("Timed out ending Live Activities on terminate")
    }
  }

  private static func endAllActivities() async {
    let activities = Activity<LiveActivityAttributes>.activities

    guard !activities.isEmpty else {
      return
    }

    for activity in activities {
      await activity.end(nil, dismissalPolicy: .immediate)
    }

    logger.info("Ended \(activities.count, privacy: .public) Live Activities on terminate")
  }
}
