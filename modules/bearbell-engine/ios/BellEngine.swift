import AVFoundation
import CoreMotion
import Foundation
import UIKit
import os

enum BellEngineError: Error {
  case audioSessionActivationFailed(Error)
  case audioOutputStartFailed(Error)
}

/// Who caused a running-state transition. Raw values match the JS `RunningChangeSource` enum.
enum RunningChangeSource: String {
  case app
  case liveActivity
  /// Current state re-sent when JS starts observing (not an actual transition).
  case restore
}

typealias RunningChangeHandler = (
  _ isRunning: Bool,
  _ source: RunningChangeSource,
  _ sensitivity: ShakeSensitivity
) -> Void

/// Posted by expo-widgets (`WidgetsEvents.sendNotification`, see
/// node_modules/expo-widgets/ios/WidgetsEvents.swift and WidgetsModule.swift) in the app process
/// when a Live Activity button runs `LiveActivityUserInteraction.perform()`.
/// userInfo: `["eventData": ["source": String, "target": String, "timestamp": Int, "type": String]]`.
/// Referenced by name so this module does not depend on ExpoWidgets.
private let expoWidgetsUserInteractionNotification = Notification.Name("onExpoWidgetsUserInteraction")

/// `target` of the Live Activity buttons (set in BearbellLiveActivity.tsx). Direction-specific so a
/// stale button never flips the engine the wrong way.
private let liveActivityStopTarget = "bearbell-stop"
private let liveActivityStartTarget = "bearbell-start"

/// Clapper physics + real-time bell synthesis + background keep-alive (docs/Spec.md §3, §4.1, §5).
///
/// Threading: every public method and all engine state are confined to the main thread.
/// The exception is the motionQueue-owned state (`clapper` and its flags; `motionQueue` is serial):
/// sensitivity changes are forwarded to it as operations, and strikes go straight from motionQueue
/// to `output.strike` (thread-safe). The audio render thread only renders the synth.
/// The running-change handler is guarded by `handlerLock` so modules can (un)register from any thread;
/// it is always invoked on main.
// Thread confinement above is enforced manually, hence @unchecked Sendable.
final class BellEngine: @unchecked Sendable {
  static let shared = BellEngine()

  private static let accelerometerInterval: TimeInterval = 1.0 / 100.0
  private static let preferredIOBufferDuration: TimeInterval = 0.01
  private static let ringOnceLoudness = 0.9
  private static let ringOnceBrightness = 0.85
  /// Output stays up this long after the synth falls silent while the engine is off.
  private static let idleShutdownDelay: TimeInterval = 0.5
  private static let idleCheckInterval: TimeInterval = 0.1
  /// Minimum gap between recoveries requested by dropped strikes.
  private static let recoveryRequestInterval: TimeInterval = 1
  private static let liveActivityStopBackgroundTaskName = "bearbell.liveActivityStop"
  private static let liveActivityStopBackgroundTaskDuration: TimeInterval = 5
  private static let sensitivityDefaultsKey = "bearbell.sensitivity"
  private static let nativeHeartbeatInterval: TimeInterval = 60

  private let logger = Logger(subsystem: "bearbell", category: "BellEngine")
  private let motionManager = CMMotionManager()
  private let output = BellSynthOutput()
  private let motionQueue: OperationQueue = {
    let queue = OperationQueue()
    queue.name = "bearbell.motion"
    queue.maxConcurrentOperationCount = 1
    queue.qualityOfService = .userInteractive

    return queue
  }()

  // Main-thread state
  private var isRunning = false
  private var isSessionActive = false
  private var sensitivity: ShakeSensitivity = .mid
  private var idleShutdownTimer: DispatchSourceTimer?
  private var silentSinceUptime: TimeInterval?
  private var liveActivityStopBackgroundTask: UIBackgroundTaskIdentifier = .invalid
  /// Native Live Activity heartbeat, only while JS is not alive (see handleLiveActivityTarget).
  private var nativeHeartbeatTimer: DispatchSourceTimer?
  /// Tail of the serialized native Live Activity updates, so they apply in the order they were made.
  private var liveActivityUpdateTask: Task<Void, Never>?

  // motionQueue-only state
  private let clapper = ClapperModel()
  /// Strikes are only forwarded between start and stop.
  private var isMotionArmed = false
  /// A main-thread recovery for a dropped strike is in flight.
  private var isRecoveryRequested = false
  /// Uptime of the last recovery request, to throttle attempts during a long interruption.
  private var lastRecoveryUptime: TimeInterval = -.infinity

  // handlerLock-guarded state
  private let handlerLock = NSLock()
  private var runningChangeHandler: RunningChangeHandler?
  private var runningChangeHandlerOwner: ObjectIdentifier?

  private init() {
    let storedSensitivity = UserDefaults.standard.string(forKey: Self.sensitivityDefaultsKey) ?? ""

    sensitivity = ShakeSensitivity(rawOrDefault: storedSensitivity)
    // No motion updates exist yet, so motionQueue-owned state can be set directly here.
    clapper.sensitivity = sensitivity

    let center = NotificationCenter.default

    center.addObserver(
      self,
      selector: #selector(handleInterruption(_:)),
      name: AVAudioSession.interruptionNotification,
      object: nil
    )
    center.addObserver(
      self,
      selector: #selector(handleMediaServicesReset(_:)),
      name: AVAudioSession.mediaServicesWereResetNotification,
      object: nil
    )
    center.addObserver(
      self,
      selector: #selector(handleDidBecomeActive(_:)),
      name: UIApplication.didBecomeActiveNotification,
      object: nil
    )
    center.addObserver(
      self,
      selector: #selector(handleWidgetsUserInteraction(_:)),
      name: expoWidgetsUserInteractionNotification,
      object: nil
    )
    center.addObserver(
      self,
      selector: #selector(handleWillTerminate(_:)),
      name: UIApplication.willTerminateNotification,
      object: nil
    )
  }

  // MARK: - Running-change handler (any thread)

  /// Registers the handler called on main after every actual running-state transition.
  /// Replaces any previous handler; `owner` lets a stale owner's clear call be ignored.
  /// JS takes over the Live Activity from here, so the native heartbeat stops.
  func setRunningChangeHandler(owner: AnyObject, _ handler: @escaping RunningChangeHandler) {
    let ownerID = ObjectIdentifier(owner)

    handlerLock.withLock {
      runningChangeHandler = handler
      runningChangeHandlerOwner = ownerID
    }

    if Thread.isMainThread {
      stopNativeHeartbeat()

      return
    }

    DispatchQueue.main.async { [weak self] in
      self?.stopNativeHeartbeat()
    }
  }

  /// Clears the handler only if `owner` registered the current one (a newer module may have replaced it).
  func clearRunningChangeHandler(owner: AnyObject) {
    handlerLock.lock()
    defer { handlerLock.unlock() }

    guard runningChangeHandlerOwner == ObjectIdentifier(owner) else {
      return
    }

    runningChangeHandler = nil
    runningChangeHandlerOwner = nil
  }

  private func notifyRunningChange(source: RunningChangeSource) {
    dispatchPrecondition(condition: .onQueue(.main))

    let handler = handlerLock.withLock { runningChangeHandler }

    handler?(isRunning, source, sensitivity)
  }

  /// Re-sends the current state (e.g. `.restore` when JS starts observing) without a transition.
  func notifyCurrentState(source: RunningChangeSource) {
    dispatchPrecondition(condition: .onQueue(.main))
    notifyRunningChange(source: source)
  }

  // MARK: - Public API (main thread)

  func start(sensitivity rawSensitivity: String, source: RunningChangeSource = .app) throws {
    dispatchPrecondition(condition: .onQueue(.main))
    setSensitivity(rawSensitivity)

    if isRunning {
      return
    }

    try activateSession()
    cancelIdleShutdown()

    do {
      try output.start()
    } catch {
      // Releases the prepared engine too, so a later route change cannot restart it while off.
      shutDownOutput()
      throw BellEngineError.audioOutputStartFailed(error)
    }

    isRunning = true
    startMotionUpdates()
    notifyRunningChange(source: source)
  }

  func stop(source: RunningChangeSource = .app) {
    dispatchPrecondition(condition: .onQueue(.main))

    guard isRunning else {
      return
    }

    isRunning = false
    stopNativeHeartbeat()
    stopMotionUpdates()
    // A bell that is still ringing finishes first; the idle check then releases the session.
    releaseOutputWhenSilent()
    notifyRunningChange(source: source)
  }

  func setSensitivity(_ rawSensitivity: String) {
    dispatchPrecondition(condition: .onQueue(.main))

    let newSensitivity = ShakeSensitivity(rawOrDefault: rawSensitivity)

    sensitivity = newSensitivity
    UserDefaults.standard.set(newSensitivity.rawValue, forKey: Self.sensitivityDefaultsKey)
    motionQueue.addOperation { [weak self] in
      self?.clapper.sensitivity = newSensitivity
    }
  }

  /// Bear tap: one strike (Spec §3.4). While off, the output runs only until the ring dies away.
  func ringOnce() {
    dispatchPrecondition(condition: .onQueue(.main))

    guard ensureOutputActive() else {
      if !isRunning {
        shutDownOutput()
      }

      return
    }

    output.strike(loudness: Self.ringOnceLoudness, brightness: Self.ringOnceBrightness)

    if !isRunning {
      releaseOutputWhenSilent()
    }
  }

  // MARK: - Audio session

  private func activateSession() throws {
    let session = AVAudioSession.sharedInstance()

    do {
      try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
      try session.setActive(true)
      isSessionActive = true
    } catch {
      isSessionActive = false
      throw BellEngineError.audioSessionActivationFailed(error)
    }

    do {
      try session.setPreferredIOBufferDuration(Self.preferredIOBufferDuration)
    } catch {
      logger.debug("Preferred IO buffer duration rejected: \(error.localizedDescription, privacy: .public)")
    }
  }

  /// Recovers from interruptions whose `.ended` notification never arrived: reactivates the
  /// session if needed and restarts the output if it is not rendering. Returns whether it renders.
  @discardableResult
  private func ensureOutputActive() -> Bool {
    if !isSessionActive {
      do {
        try activateSession()
      } catch {
        logger.error("Audio session reactivation failed: \(error.localizedDescription, privacy: .public)")

        return false
      }
    }

    if output.isActive {
      return true
    }

    do {
      try output.start()
    } catch {
      logger.error("Audio output start failed: \(error.localizedDescription, privacy: .public)")

      return false
    }

    return true
  }

  private func deactivateSession() {
    do {
      try AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
    } catch {
      logger.debug("Audio session deactivation failed: \(error.localizedDescription, privacy: .public)")
    }

    isSessionActive = false
  }

  // MARK: - Idle shutdown (main thread)

  /// While the engine is off, stops the output and releases the session once the synth has been
  /// silent for `idleShutdownDelay` (`ringOnce`, or a `stop()` during a ring). Starting cancels it.
  private func releaseOutputWhenSilent() {
    dispatchPrecondition(condition: .onQueue(.main))

    if !output.isActive {
      shutDownOutput()

      return
    }

    guard idleShutdownTimer == nil else {
      return
    }

    let timer = DispatchSource.makeTimerSource(queue: .main)

    silentSinceUptime = nil
    timer.schedule(deadline: .now() + Self.idleCheckInterval, repeating: Self.idleCheckInterval)
    timer.setEventHandler { [weak self] in
      self?.handleIdleCheck()
    }
    timer.resume()
    idleShutdownTimer = timer
  }

  private func handleIdleCheck() {
    dispatchPrecondition(condition: .onQueue(.main))

    if isRunning {
      cancelIdleShutdown()

      return
    }

    // An interrupted or reset output never renders the remaining ring, so release right away.
    if !output.isActive {
      cancelIdleShutdown()
      shutDownOutput()

      return
    }

    if !output.isSilent {
      silentSinceUptime = nil

      return
    }

    let now = ProcessInfo.processInfo.systemUptime

    guard let silentSince = silentSinceUptime else {
      silentSinceUptime = now

      return
    }

    guard now - silentSince >= Self.idleShutdownDelay else {
      return
    }

    cancelIdleShutdown()
    shutDownOutput()
  }

  private func shutDownOutput() {
    output.stop()
    deactivateSession()
  }

  private func cancelIdleShutdown() {
    idleShutdownTimer?.cancel()
    idleShutdownTimer = nil
    silentSinceUptime = nil
  }

  // MARK: - Motion

  private func startMotionUpdates() {
    guard motionManager.isAccelerometerAvailable else {
      logger.info("Accelerometer unavailable (simulator?); running audio only")

      return
    }

    motionQueue.addOperation { [weak self] in
      self?.clapper.reset()
      self?.isMotionArmed = true
    }

    motionManager.accelerometerUpdateInterval = Self.accelerometerInterval
    motionManager.startAccelerometerUpdates(to: motionQueue) { [weak self] data, error in
      guard let self, let data else {
        if let error {
          self?.logger.error("Accelerometer error: \(error.localizedDescription, privacy: .public)")
        }

        return
      }

      self.handleAccelerometerSample(data.acceleration, timestamp: data.timestamp)
    }
  }

  private func stopMotionUpdates() {
    motionManager.stopAccelerometerUpdates()
    // Queued after any in-flight samples, so none of them strikes once stopped.
    motionQueue.addOperation { [weak self] in
      self?.isMotionArmed = false
    }
  }

  /// motionQueue: clapper physics → synth strikes (thread-safe, no main hop).
  private func handleAccelerometerSample(_ acceleration: CMAcceleration, timestamp: TimeInterval) {
    guard isMotionArmed else {
      return
    }

    let strikes = clapper.process(
      x: acceleration.x,
      y: acceleration.y,
      z: acceleration.z,
      timestamp: timestamp
    )

    for strike in strikes {
      let level = ClapperModel.loudness(velocity: strike.velocity, sensitivity: clapper.sensitivity)

      if !output.strike(loudness: level.loudness, brightness: level.brightness) {
        requestOutputRecovery()
      }
    }
  }

  /// motionQueue: a strike was dropped because the output is not rendering (e.g. an interruption
  /// whose `.ended` never came). Asks main to recover: one request in flight, at most one per second.
  private func requestOutputRecovery() {
    let now = ProcessInfo.processInfo.systemUptime

    guard !isRecoveryRequested, now - lastRecoveryUptime >= Self.recoveryRequestInterval else {
      return
    }

    lastRecoveryUptime = now
    isRecoveryRequested = true
    DispatchQueue.main.async { [weak self] in
      guard let self else {
        return
      }

      self.resumeAfterInterruption()
      self.motionQueue.addOperation { [weak self] in
        self?.isRecoveryRequested = false
      }
    }
  }

  // MARK: - Notifications

  @objc private func handleInterruption(_ notification: Notification) {
    guard
      let rawType = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
      let type = AVAudioSession.InterruptionType(rawValue: rawType)
    else {
      return
    }

    let rawOptions = notification.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
    let options = AVAudioSession.InterruptionOptions(rawValue: rawOptions)

    DispatchQueue.main.async { [weak self] in
      guard let self else {
        return
      }

      switch type {
      case .began:
        // The system stopped the engine. Mark both inactive so `.ended`, the next strike or
        // didBecomeActive reactivates the session and restarts the output.
        self.isSessionActive = false
        self.output.markInterrupted()
      case .ended:
        let shouldResume = options.contains(.shouldResume)

        self.logger.info("Audio interruption ended (shouldResume: \(shouldResume, privacy: .public))")
        // The engine's job is to keep running, so resume regardless of `.shouldResume`.
        self.resumeAfterInterruption()
      @unknown default:
        break
      }
    }
  }

  @objc private func handleMediaServicesReset(_ notification: Notification) {
    DispatchQueue.main.async { [weak self] in
      guard let self else {
        return
      }

      // Every audio object is invalid now; the output rebuilds its engine and synth on start.
      self.isSessionActive = false
      self.output.reset()

      guard self.isRunning else {
        return
      }

      self.ensureOutputActive()
    }
  }

  @objc private func handleDidBecomeActive(_ notification: Notification) {
    DispatchQueue.main.async { [weak self] in
      self?.resumeAfterInterruption()
    }
  }

  /// App termination (e.g. swiped away while running in the background). The bell stops with the
  /// process, so no Live Activity may outlive it. Posted on main; the process exits right after this
  /// returns, so the Live Activity ends are awaited here (bounded by a timeout).
  @objc private func handleWillTerminate(_ notification: Notification) {
    dispatchPrecondition(condition: .onQueue(.main))
    // Best effort: the process is dying, so the running-change event is irrelevant.
    stop()
    stopNativeHeartbeat()
    LiveActivityTerminator.endAllActivitiesBlocking()
  }

  /// Live Activity button press. Posted from the intent's (background) thread, and `perform()`
  /// returns right after posting, so the transition finishes on main (`main.sync`) before this
  /// returns. Once started, the running audio engine (audio background mode) keeps the app alive.
  @objc private func handleWidgetsUserInteraction(_ notification: Notification) {
    let eventData = notification.userInfo?["eventData"] as? [String: Any]

    guard let target = eventData?["target"] as? String else {
      return
    }

    guard target == liveActivityStopTarget || target == liveActivityStartTarget else {
      return
    }

    if Thread.isMainThread {
      handleLiveActivityTarget(target)

      return
    }

    // sync: perform() must not return before the transition finishes; the intent runs off-main, so no deadlock.
    DispatchQueue.main.sync {
      handleLiveActivityTarget(target)
    }
  }

  /// `bearbell-stop` stops if running, `bearbell-start` starts with the stored sensitivity if not;
  /// a button that no longer matches the engine state is ignored.
  /// With a JS handler registered, JS updates the Live Activity from the running-change event.
  /// Without one (JS not alive, e.g. a background cold launch) native updates the display itself
  /// and, while running, keeps it fresh with a native heartbeat (docs/Spec.md §2.1).
  private func handleLiveActivityTarget(_ target: String) {
    dispatchPrecondition(condition: .onQueue(.main))

    let hasHandler = handlerLock.withLock { runningChangeHandler != nil }

    if target == liveActivityStopTarget {
      handleLiveActivityStop(hasHandler: hasHandler)

      return
    }

    handleLiveActivityStart(hasHandler: hasHandler)
  }

  private func handleLiveActivityStop(hasHandler: Bool) {
    if hasHandler {
      guard isRunning else {
        return
      }

      // Give JS time to update the Live Activity before the app is suspended.
      beginLiveActivityStopBackgroundTask()
      stop(source: .liveActivity)

      return
    }

    // Without JS the display is synced to "off" even when the engine is already off (e.g. a stale
    // "on" activity left behind by a crashed process), since nothing else will correct it.
    // The background task keeps the app alive while the async update runs.
    beginLiveActivityStopBackgroundTask()
    stop(source: .liveActivity)
    enqueueLiveActivityUpdate {
      await LiveActivityUpdater.applyArmedState(isArmed: false, startedAtMs: nil, staleDate: nil)
    }
  }

  /// A background cold launch stays alive once started: the engine activates audio and keeps the synth output running.
  private func handleLiveActivityStart(hasHandler: Bool) {
    guard !isRunning else {
      return
    }

    do {
      try start(sensitivity: sensitivity.rawValue, source: .liveActivity)
    } catch {
      logger.error("Live Activity start failed: \(String(describing: error), privacy: .public)")

      return
    }

    guard !hasHandler else {
      return
    }

    let now = Date()
    let startedAtMs = (now.timeIntervalSince1970 * 1000).rounded()
    let staleDate = now.addingTimeInterval(LiveActivityUpdater.staleInterval)

    enqueueLiveActivityUpdate {
      await LiveActivityUpdater.applyArmedState(isArmed: true, startedAtMs: startedAtMs, staleDate: staleDate)
    }
    startNativeHeartbeat()
  }

  // MARK: - Native Live Activity updates (main thread)

  /// Runs `work` in a detached task (ActivityKit is async; main is never blocked) after every
  /// previously enqueued update, so e.g. a heartbeat cannot re-apply "on" after a later "off".
  private func enqueueLiveActivityUpdate(_ work: @escaping @Sendable () async -> Void) {
    dispatchPrecondition(condition: .onQueue(.main))

    let previous = liveActivityUpdateTask

    liveActivityUpdateTask = Task.detached(priority: .userInitiated) {
      await previous?.value
      await work()
    }
  }

  private func startNativeHeartbeat() {
    dispatchPrecondition(condition: .onQueue(.main))
    stopNativeHeartbeat()

    let timer = DispatchSource.makeTimerSource(queue: .main)

    timer.schedule(
      deadline: .now() + Self.nativeHeartbeatInterval,
      repeating: Self.nativeHeartbeatInterval
    )
    timer.setEventHandler { [weak self] in
      self?.handleNativeHeartbeat()
    }
    timer.resume()
    nativeHeartbeatTimer = timer
    logger.info("Native Live Activity heartbeat started")
  }

  private func stopNativeHeartbeat() {
    dispatchPrecondition(condition: .onQueue(.main))

    guard let timer = nativeHeartbeatTimer else {
      return
    }

    timer.cancel()
    nativeHeartbeatTimer = nil
    logger.info("Native Live Activity heartbeat stopped")
  }

  private func handleNativeHeartbeat() {
    dispatchPrecondition(condition: .onQueue(.main))

    let hasHandler = handlerLock.withLock { runningChangeHandler != nil }

    guard isRunning, !hasHandler else {
      stopNativeHeartbeat()

      return
    }

    let staleDate = Date().addingTimeInterval(LiveActivityUpdater.staleInterval)

    enqueueLiveActivityUpdate {
      await LiveActivityUpdater.refreshStaleDate(staleDate)
    }
  }

  // MARK: - Background task (main thread)

  /// Keeps the app running for a few seconds after a Live Activity stop. Any previous task is ended
  /// first; each task is ended exactly once, by timeout or expiration, whichever comes first.
  private func beginLiveActivityStopBackgroundTask() {
    dispatchPrecondition(condition: .onQueue(.main))
    endLiveActivityStopBackgroundTask()

    let task = MainActor.assumeIsolated {
      UIApplication.shared.beginBackgroundTask(
        withName: Self.liveActivityStopBackgroundTaskName
      ) { [weak self] in
        self?.endLiveActivityStopBackgroundTask()
      }
    }

    guard task != .invalid else {
      return
    }

    liveActivityStopBackgroundTask = task

    DispatchQueue.main.asyncAfter(deadline: .now() + Self.liveActivityStopBackgroundTaskDuration) { [weak self] in
      self?.endLiveActivityStopBackgroundTask(ifCurrent: task)
    }
  }

  /// Ends the held task, or only `ifCurrent` when given (a stale timer must not end a newer task).
  private func endLiveActivityStopBackgroundTask(ifCurrent expected: UIBackgroundTaskIdentifier? = nil) {
    dispatchPrecondition(condition: .onQueue(.main))

    let task = liveActivityStopBackgroundTask

    guard task != .invalid else {
      return
    }

    if let expected, expected != task {
      return
    }

    liveActivityStopBackgroundTask = .invalid
    MainActor.assumeIsolated {
      UIApplication.shared.endBackgroundTask(task)
    }
  }

  private func resumeAfterInterruption() {
    guard isRunning else {
      return
    }

    ensureOutputActive()
  }
}
