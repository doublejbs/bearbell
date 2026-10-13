import Foundation
import os

/// Real-time modal bell synthesis (Spec §5).
///
/// Threading: `strike` and `isSilent` may be called from any thread. `render` must be called from a
/// single (audio) thread; it never allocates or blocks — pending strikes are taken with
/// `os_unfair_lock_trylock` and, if the lock is busy, applied on the next call.
/// `@unchecked Sendable`: shared state is guarded by `lock`; render-only state is confined to the audio thread.
final class ModalBellSynth: @unchecked Sendable {
  // §5.1 modes
  static let fundamentalHz = 2100.0
  static let modeRatios: [Double] = [1.0, 1.003, 2.76, 5.40, 8.93]
  static let modeAmplitudes: [Double] = [1.0, 0.35, 0.55, 0.30, 0.15]
  static let modeDecaySeconds: [Double] = [0.9, 0.9, 0.45, 0.25, 0.12]

  // §5.2 strike excitation: modes from this index on are weighted by brightness
  static let firstBrightMode = 2
  static let brightBaseWeight = 0.4
  static let brightGainWeight = 0.6

  // §5.2 transient click
  static let clickDurationSeconds = 0.004
  static let clickAmplitude = 0.3
  static let clickDecaySeconds = 0.003
  static let clickSeed: UInt32 = 0x9E37_79B9

  // §5.2 output stage
  static let master = 0.36
  static let limiterKnee = 0.9
  static let limiterRange = 0.1
  static let outputCeiling = 0.999

  // §5.3 silence
  static let silenceEnergy = 1e-9

  /// §5.2 strikes queued between two render calls; overflow drops the new strike.
  static let pendingCapacity = 64

  private struct PendingStrike {
    var loudness: Double
    var brightness: Double
  }

  let sampleRate: Double

  // Constants copied in init so the audio thread never triggers lazy static initialization.
  private let modeCount: Int
  private let firstBrightMode: Int
  private let brightBaseWeight: Double
  private let brightGainWeight: Double
  private let clickAmplitudePerLoudness: Double
  private let clickFrames: Int
  private let clickDecay: Double
  private let master: Double
  private let limiterKnee: Double
  private let limiterRange: Double
  private let outputCeiling: Double
  private let silenceEnergy: Double
  private let pendingCapacity: Int

  private let coefficientRe: UnsafeMutablePointer<Double>
  private let coefficientIm: UnsafeMutablePointer<Double>
  private let strikeGain: UnsafeMutablePointer<Double>
  private let stateRe: UnsafeMutablePointer<Double>
  private let stateIm: UnsafeMutablePointer<Double>

  private var clickAmplitude = 0.0
  private var clickRemaining = 0
  private var noiseState: UInt32
  private var renderSilent = true

  // Guarded by `lock`.
  private let lock: UnsafeMutablePointer<os_unfair_lock>
  private let pending: UnsafeMutablePointer<PendingStrike>
  private var pendingHead = 0
  private var pendingCount = 0
  private var sharedSilent = true

  init(sampleRate: Double) {
    self.sampleRate = sampleRate
    modeCount = Self.modeRatios.count
    firstBrightMode = Self.firstBrightMode
    brightBaseWeight = Self.brightBaseWeight
    brightGainWeight = Self.brightGainWeight
    clickAmplitudePerLoudness = Self.clickAmplitude
    clickFrames = Int((Self.clickDurationSeconds * sampleRate).rounded())
    clickDecay = exp(-1 / (Self.clickDecaySeconds * sampleRate))
    master = Self.master
    limiterKnee = Self.limiterKnee
    limiterRange = Self.limiterRange
    outputCeiling = Self.outputCeiling
    silenceEnergy = Self.silenceEnergy
    pendingCapacity = Self.pendingCapacity
    noiseState = Self.clickSeed

    coefficientRe = .allocate(capacity: modeCount)
    coefficientIm = .allocate(capacity: modeCount)
    strikeGain = .allocate(capacity: modeCount)
    stateRe = .allocate(capacity: modeCount)
    stateIm = .allocate(capacity: modeCount)

    for mode in 0..<modeCount {
      let radius = exp(-1 / (Self.modeDecaySeconds[mode] * sampleRate))
      let phase = 2 * Double.pi * Self.fundamentalHz * Self.modeRatios[mode] / sampleRate

      coefficientRe[mode] = radius * cos(phase)
      coefficientIm[mode] = radius * sin(phase)
      strikeGain[mode] = Self.modeAmplitudes[mode]
      stateRe[mode] = 0
      stateIm[mode] = 0
    }

    lock = .allocate(capacity: 1)
    lock.initialize(to: os_unfair_lock())
    pending = .allocate(capacity: pendingCapacity)
    pending.initialize(repeating: PendingStrike(loudness: 0, brightness: 0), count: pendingCapacity)
  }

  deinit {
    coefficientRe.deallocate()
    coefficientIm.deallocate()
    strikeGain.deallocate()
    stateRe.deallocate()
    stateIm.deallocate()
    lock.deinitialize(count: 1)
    lock.deallocate()
    pending.deinitialize(count: pendingCapacity)
    pending.deallocate()
  }

  /// True when no ringing remains and no strike is waiting (Spec §5.3). Not for the render thread.
  var isSilent: Bool {
    os_unfair_lock_lock(lock)
    defer { os_unfair_lock_unlock(lock) }

    return sharedSilent && pendingCount == 0
  }

  /// Queues a strike; applied at the start of the next render call. Non-finite input is ignored,
  /// loudness is clamped to ≥ 0 and brightness to 0...1 (Spec §5.2).
  func strike(loudness: Double, brightness: Double) {
    if !loudness.isFinite || !brightness.isFinite {
      return
    }

    let strike = PendingStrike(loudness: max(loudness, 0), brightness: min(max(brightness, 0), 1))

    os_unfair_lock_lock(lock)

    if pendingCount < pendingCapacity {
      pending[(pendingHead + pendingCount) % pendingCapacity] = strike
      pendingCount += 1
      sharedSilent = false
    }

    os_unfair_lock_unlock(lock)
  }

  /// Writes `frameCount` mono samples. Real-time safe.
  func render(into buffer: UnsafeMutablePointer<Float>, frameCount: Int) {
    applyPendingStrikes()

    if renderSilent {
      buffer.update(repeating: 0, count: frameCount)
      publishSilence()

      return
    }

    for frame in 0..<frameCount {
      var sum = 0.0

      for mode in 0..<modeCount {
        let re = stateRe[mode] * coefficientRe[mode] - stateIm[mode] * coefficientIm[mode]
        let im = stateRe[mode] * coefficientIm[mode] + stateIm[mode] * coefficientRe[mode]

        stateRe[mode] = re
        stateIm[mode] = im
        sum += im
      }

      var sample = master * sum

      if clickRemaining > 0 {
        sample += clickAmplitude * nextNoise()
        clickAmplitude *= clickDecay
        clickRemaining -= 1

        if clickRemaining == 0 {
          clickAmplitude = 0
        }
      }

      buffer[frame] = Float(limit(sample))
    }

    updateSilence()
    publishSilence()
  }

  /// Soft knee above `limiterKnee`, then a hard clamp so Float never rounds to ±1 (Spec §5.2).
  private func limit(_ sample: Double) -> Double {
    let magnitude = abs(sample)

    if magnitude <= limiterKnee {
      return sample
    }

    let limited = min(limiterKnee + limiterRange * tanh((magnitude - limiterKnee) / limiterRange), outputCeiling)

    return sample < 0 ? -limited : limited
  }

  private func applyPendingStrikes() {
    if !os_unfair_lock_trylock(lock) {
      return
    }

    for index in 0..<pendingCount {
      let strike = pending[(pendingHead + index) % pendingCapacity]

      excite(loudness: strike.loudness, brightness: strike.brightness)
    }

    pendingHead = 0
    pendingCount = 0
    os_unfair_lock_unlock(lock)
  }

  private func excite(loudness: Double, brightness: Double) {
    let brightWeight = brightBaseWeight + brightGainWeight * brightness

    for mode in 0..<modeCount {
      let weight = mode >= firstBrightMode ? brightWeight : 1

      stateIm[mode] += loudness * strikeGain[mode] * weight
    }

    clickAmplitude += clickAmplitudePerLoudness * loudness
    clickRemaining = clickFrames
    renderSilent = false
  }

  private func updateSilence() {
    if clickRemaining > 0 {
      return
    }

    var energy = 0.0

    for mode in 0..<modeCount {
      energy += stateRe[mode] * stateRe[mode] + stateIm[mode] * stateIm[mode]
    }

    if energy >= silenceEnergy {
      return
    }

    for mode in 0..<modeCount {
      stateRe[mode] = 0
      stateIm[mode] = 0
    }

    clickAmplitude = 0
    renderSilent = true
  }

  /// Shares the render-side silence; skipped (kept conservative) when the lock is busy.
  private func publishSilence() {
    if !os_unfair_lock_trylock(lock) {
      return
    }

    sharedSilent = renderSilent && pendingCount == 0
    os_unfair_lock_unlock(lock)
  }

  /// xorshift32 → [-1, 1). Deterministic per instance.
  private func nextNoise() -> Double {
    noiseState ^= noiseState << 13
    noiseState ^= noiseState >> 17
    noiseState ^= noiseState << 5

    return Double(noiseState) / 2_147_483_648.0 - 1
  }
}
