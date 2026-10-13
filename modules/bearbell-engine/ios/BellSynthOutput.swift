import AVFoundation
import Foundation
import os

enum BellSynthOutputError: LocalizedError {
  case unsupportedFormat(sampleRate: Double)

  var errorDescription: String? {
    switch self {
    case .unsupportedFormat(let sampleRate):
      return "Unsupported mono float output format at \(sampleRate) Hz"
    }
  }
}

/// Plays `ModalBellSynth` through AVAudioEngine + AVAudioSourceNode (Spec §4.1, §5).
///
/// Threading: `start`, `stop`, `reset`, `markInterrupted` and `isActive` are main-thread only.
/// `strike` and `isSilent` may be called from any thread (the synth reference is guarded by `lock`).
/// The render block runs on the real-time audio thread and only calls `ModalBellSynth.render`.
// Thread confinement above is enforced manually, hence @unchecked Sendable.
final class BellSynthOutput: @unchecked Sendable {
  /// Used only when the output node reports no hardware format (e.g. no output route yet).
  private static let fallbackSampleRate = 48_000.0

  private let logger = Logger(subsystem: "bearbell", category: "BellSynthOutput")

  // Main-thread state
  private var engine: AVAudioEngine?
  private var configurationObserver: NSObjectProtocol?
  /// Set by `start()` until `stop()`/`reset()`; a configuration change restarts the engine while set.
  private var wantsRunning = false

  // lock-guarded state
  private let lock = NSLock()
  private var synth: ModalBellSynth?
  private var isAcceptingStrikes = false

  /// True while the engine is rendering and accepts strikes.
  var isActive: Bool {
    dispatchPrecondition(condition: .onQueue(.main))

    return lock.withLock { isAcceptingStrikes }
  }

  /// True when nothing is ringing or queued (an output without a synth is silent).
  var isSilent: Bool {
    let current: ModalBellSynth? = lock.withLock { synth }

    return current?.isSilent ?? true
  }

  /// Builds the graph if needed (or rebuilds it when the hardware sample rate changed) and starts it.
  func start() throws {
    dispatchPrecondition(condition: .onQueue(.main))
    wantsRunning = true

    let engine = try prepareEngine()

    if !engine.isRunning {
      do {
        try engine.start()
      } catch {
        setAcceptingStrikes(false)
        throw error
      }
    }

    setAcceptingStrikes(true)
  }

  /// Stops and releases the engine and synth; the next `start()` builds a fresh graph.
  func stop() {
    dispatchPrecondition(condition: .onQueue(.main))
    wantsRunning = false
    teardown()
  }

  /// Media services were reset: every audio object is invalid, so drop them without restarting.
  func reset() {
    dispatchPrecondition(condition: .onQueue(.main))
    teardown()
  }

  /// The system stopped the engine (interruption began). Strikes are refused until `start()`.
  func markInterrupted() {
    dispatchPrecondition(condition: .onQueue(.main))
    setAcceptingStrikes(false)
  }

  /// Queues a strike. Returns false (strike dropped) when the output is not rendering.
  @discardableResult
  func strike(loudness: Double, brightness: Double) -> Bool {
    let target: ModalBellSynth? = lock.withLock {
      isAcceptingStrikes ? synth : nil
    }

    guard let target else {
      return false
    }

    target.strike(loudness: loudness, brightness: brightness)

    return true
  }

  // MARK: - Graph

  private func prepareEngine() throws -> AVAudioEngine {
    if let engine = self.engine, hardwareSampleRate(of: engine) == currentSampleRate() {
      return engine
    }

    teardown()

    let engine = AVAudioEngine()
    let sampleRate = hardwareSampleRate(of: engine)

    guard let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1) else {
      throw BellSynthOutputError.unsupportedFormat(sampleRate: sampleRate)
    }

    let newSynth = ModalBellSynth(sampleRate: sampleRate)

    // Real-time thread: no allocation, locks or Objective-C. `newSynth` is captured strongly so the
    // block never touches `self`. Mono non-interleaved float, so the first buffer is the only one.
    let sourceNode = AVAudioSourceNode(format: format) { _, _, frameCount, audioBufferList in
      let buffer = audioBufferList.pointee.mBuffers

      if let data = buffer.mData {
        newSynth.render(into: data.assumingMemoryBound(to: Float.self), frameCount: Int(frameCount))
      }

      return noErr
    }

    engine.attach(sourceNode)
    engine.connect(sourceNode, to: engine.mainMixerNode, format: format)
    engine.prepare()

    configurationObserver = NotificationCenter.default.addObserver(
      forName: .AVAudioEngineConfigurationChange,
      object: engine,
      queue: .main
    ) { [weak self] _ in
      self?.handleConfigurationChange()
    }

    self.engine = engine
    lock.withLock {
      synth = newSynth
    }
    logger.info("Audio graph built at \(sampleRate, privacy: .public) Hz")

    return engine
  }

  private func teardown() {
    setAcceptingStrikes(false)

    if let configurationObserver {
      NotificationCenter.default.removeObserver(configurationObserver)
    }

    configurationObserver = nil
    engine?.stop()
    engine = nil
    lock.withLock {
      synth = nil
    }
  }

  private func currentSampleRate() -> Double? {
    let current: ModalBellSynth? = lock.withLock { synth }

    return current?.sampleRate
  }

  private func hardwareSampleRate(of engine: AVAudioEngine) -> Double {
    let sampleRate = engine.outputNode.outputFormat(forBus: 0).sampleRate

    return sampleRate > 0 ? sampleRate : Self.fallbackSampleRate
  }

  private func setAcceptingStrikes(_ value: Bool) {
    lock.withLock {
      isAcceptingStrikes = value
    }
  }

  /// The engine stopped itself because the output route/format changed. Restart it while wanted;
  /// `start()` rebuilds the graph (and synth) if the sample rate changed.
  private func handleConfigurationChange() {
    dispatchPrecondition(condition: .onQueue(.main))
    setAcceptingStrikes(false)

    guard wantsRunning else {
      return
    }

    do {
      try start()
      logger.info("Audio engine restarted after configuration change")
    } catch {
      logger.error("Audio engine restart failed: \(error.localizedDescription, privacy: .public)")
    }
  }
}
