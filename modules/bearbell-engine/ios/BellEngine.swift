import AVFoundation
import CoreMotion
import Foundation
import UIKit
import os

enum BellEngineError: Error {
  case audioSessionActivationFailed(Error)
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

/// Forwards `AVAudioPlayerDelegate` finish callbacks as a Sendable closure.
/// `AVAudioPlayer.delegate` is weak, so the owner must keep this object alive.
/// The protocol is main-actor isolated (which would make this class main-actor bound);
/// init and callbacks are nonisolated and only forward to `onFinish`, which hops to main.
private final class BellPlayerDelegate: NSObject, AVAudioPlayerDelegate, Sendable {
  private let onFinish: @Sendable () -> Void

  nonisolated init(onFinish: @escaping @Sendable () -> Void) {
    self.onFinish = onFinish
  }

  nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
    onFinish()
  }

  nonisolated func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
    onFinish()
  }
}

/// Shake detection + bell playback + background keep-alive.
///
/// Threading: every public method and all engine state are confined to the main thread.
/// The only exception is `detector`, which is owned by `motionQueue` (a serial queue);
/// sensitivity changes are forwarded to it as operations, and rings hop back to main.
/// The running-change handler is guarded by `handlerLock` so modules can (un)register from any thread;
/// it is always invoked on main.
// Thread confinement above is enforced manually, hence @unchecked Sendable.
final class BellEngine: @unchecked Sendable {
  static let shared = BellEngine()

  private static let bellPoolSize = 4
  private static let accelerometerInterval: TimeInterval = 1.0 / 50.0
  private static let assetsBundleName = "BearbellEngineAssets"
  private static let bellResourceName = "bell"
  private static let silenceResourceName = "silence"
  private static let wavExtension = "wav"
  private static let liveActivityStopBackgroundTaskName = "bearbell.liveActivityStop"
  private static let liveActivityStopBackgroundTaskDuration: TimeInterval = 5
  private static let sensitivityDefaultsKey = "bearbell.sensitivity"
  private static let nativeHeartbeatInterval: TimeInterval = 60

  private let logger = Logger(subsystem: "bearbell", category: "BellEngine")
  private let motionManager = CMMotionManager()
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
  private var bellPlayers: [AVAudioPlayer] = []
  private var nextBellIndex = 0
  private var silencePlayer: AVAudioPlayer?
  private var liveActivityStopBackgroundTask: UIBackgroundTaskIdentifier = .invalid
  /// Native Live Activity heartbeat, only while JS is not alive (see handleLiveActivityTarget).
  private var nativeHeartbeatTimer: DispatchSourceTimer?
  /// Tail of the serialized native Live Activity updates, so they apply in the order they were made.
  private var liveActivityUpdateTask: Task<Void, Never>?
  private lazy var bellPlayerDelegate = BellPlayerDelegate { [weak self] in
    DispatchQueue.main.async {
      self?.handleBellFinished()
    }
  }

  // motionQueue-only state
  private var detector = ShakeDetector()

  // handlerLock-guarded state
  private let handlerLock = NSLock()
  private var runningChangeHandler: RunningChangeHandler?
  private var runningChangeHandlerOwner: ObjectIdentifier?

  private init() {
    let storedSensitivity = UserDefaults.standard.string(forKey: Self.sensitivityDefaultsKey) ?? ""

    sensitivity = ShakeSensitivity(rawOrDefault: storedSensitivity)
    // No motion updates exist yet, so motionQueue-owned state can be set directly here.
    detector.sensitivity = sensitivity

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
    preparePlayersIfNeeded()
    isRunning = true
    playSilenceLoop()
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
    motionManager.stopAccelerometerUpdates()
    silencePlayer?.stop()
    // If a bell is still ringing this is skipped; handleBellFinished() deactivates later.
    deactivateSession()
    notifyRunningChange(source: source)
  }

  func setSensitivity(_ rawSensitivity: String) {
    dispatchPrecondition(condition: .onQueue(.main))

    let newSensitivity = ShakeSensitivity(rawOrDefault: rawSensitivity)

    sensitivity = newSensitivity
    UserDefaults.standard.set(newSensitivity.rawValue, forKey: Self.sensitivityDefaultsKey)
    motionQueue.addOperation { [weak self] in
      self?.detector.sensitivity = newSensitivity
    }
  }

  func ringOnce() {
    dispatchPrecondition(condition: .onQueue(.main))
    preparePlayersIfNeeded()
    ring(volume: 1.0)
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
  }

  /// Recovers from interruptions whose `.ended` notification never arrived:
  /// reactivates the session if needed and, while running, restarts the silence loop.
  private func ensureSessionActive() {
    if !isSessionActive {
      do {
        try activateSession()
      } catch {
        logger.error("Audio session reactivation failed: \(error.localizedDescription, privacy: .public)")

        return
      }
    }

    if isRunning {
      playSilenceLoop()
    }
  }

  private func deactivateSession() {
    // Let a bell that is still ringing finish before releasing the session.
    guard !isAnyBellPlaying else {
      return
    }

    do {
      try AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
    } catch {
      logger.debug("Audio session deactivation failed: \(error.localizedDescription, privacy: .public)")
    }

    isSessionActive = false
  }

  // MARK: - Players

  private var isAnyBellPlaying: Bool {
    bellPlayers.contains(where: { $0.isPlaying })
  }

  private func preparePlayersIfNeeded() {
    if bellPlayers.isEmpty, let bellURL = resourceURL(named: Self.bellResourceName) {
      let delegate = bellPlayerDelegate

      bellPlayers = (0..<Self.bellPoolSize).compactMap { _ in
        let player = makePlayer(url: bellURL)

        player?.delegate = delegate

        return player
      }
      nextBellIndex = 0
    }

    if silencePlayer == nil, let silenceURL = resourceURL(named: Self.silenceResourceName) {
      let player = makePlayer(url: silenceURL)

      player?.numberOfLoops = -1
      player?.volume = 1.0
      silencePlayer = player
    }
  }

  private func discardPlayers() {
    bellPlayers.forEach {
      $0.delegate = nil
      $0.stop()
    }
    bellPlayers = []
    nextBellIndex = 0
    silencePlayer?.stop()
    silencePlayer = nil
  }

  private func makePlayer(url: URL) -> AVAudioPlayer? {
    do {
      let player = try AVAudioPlayer(contentsOf: url)

      player.prepareToPlay()

      return player
    } catch {
      logger.error("Failed to create player for \(url.lastPathComponent, privacy: .public): \(error.localizedDescription, privacy: .public)")

      return nil
    }
  }

  private func resourceURL(named name: String) -> URL? {
    let candidates = [
      Bundle(for: BellEngine.self)
        .url(forResource: Self.assetsBundleName, withExtension: "bundle")
        .flatMap { Bundle(url: $0) },
      Bundle.main
        .url(forResource: Self.assetsBundleName, withExtension: "bundle")
        .flatMap { Bundle(url: $0) },
      Bundle(for: BellEngine.self),
      Bundle.main,
    ]

    for case let bundle? in candidates {
      if let url = bundle.url(forResource: name, withExtension: Self.wavExtension) {
        return url
      }
    }

    logger.error("Missing resource \(name, privacy: .public).\(Self.wavExtension, privacy: .public)")

    return nil
  }

  private func playSilenceLoop() {
    guard let player = silencePlayer else {
      logger.error("Silence player unavailable; background keep-alive disabled")

      return
    }

    if !player.isPlaying {
      player.play()
    }
  }

  private func ring(volume: Float) {
    guard !bellPlayers.isEmpty else {
      logger.error("Bell players unavailable")

      return
    }

    ensureSessionActive()

    let player = bellPlayers[nextBellIndex]

    nextBellIndex = (nextBellIndex + 1) % bellPlayers.count
    player.stop()
    player.volume = volume
    player.currentTime = 0
    player.prepareToPlay()
    player.play()
  }

  /// Releases a session that only a bell was holding (engine off, e.g. `ringOnce` or
  /// a `stop()` that deferred deactivation) once the last ringing bell has finished.
  private func handleBellFinished() {
    dispatchPrecondition(condition: .onQueue(.main))

    guard !isRunning, isSessionActive else {
      return
    }

    deactivateSession()
  }

  // MARK: - Motion

  private func startMotionUpdates() {
    guard motionManager.isAccelerometerAvailable else {
      logger.info("Accelerometer unavailable (simulator?); running audio only")

      return
    }

    motionQueue.addOperation { [weak self] in
      self?.detector.reset()
    }

    motionManager.accelerometerUpdateInterval = Self.accelerometerInterval
    motionManager.startAccelerometerUpdates(to: motionQueue) { [weak self] data, error in
      guard let self, let data else {
        if let error {
          self?.logger.error("Accelerometer error: \(error.localizedDescription, privacy: .public)")
        }

        return
      }

      let acceleration = data.acceleration
      let volume = self.detector.process(
        x: acceleration.x,
        y: acceleration.y,
        z: acceleration.z,
        timestamp: data.timestamp
      )

      guard let volume else {
        return
      }

      DispatchQueue.main.async { [weak self] in
        guard let self, self.isRunning else {
          return
        }

        self.ring(volume: volume)
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
        // Mark inactive so the next ring (or didBecomeActive) reactivates the session.
        self.isSessionActive = false
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

      self.isSessionActive = false
      self.discardPlayers()

      guard self.isRunning else {
        return
      }

      self.preparePlayersIfNeeded()
      self.ensureSessionActive()
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
  /// returns. Once started, the silence loop's audio background mode keeps the app alive.
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

  /// A background cold launch stays alive once started: the engine activates audio and plays the silence loop.
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

    ensureSessionActive()
  }
}
