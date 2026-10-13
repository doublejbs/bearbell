import Foundation

/// Spec §8.2 시나리오.
enum ModalBellSynthTests {
  static let fs = 48_000.0
  static let fs44k = 44_100.0
  static let silenceRenderSeconds = 10.0

  static func runAll() {
    TestHarness.run("ModalBellSynth §8.2-1 newSynthIsSilent", newSynthIsSilent)
    TestHarness.run("ModalBellSynth §8.2-2 singleStrikePeakAndDecayToSilence", singleStrikePeakAndDecayToSilence)
    TestHarness.run("ModalBellSynth §8.2-3 loudnessScalesPeak", loudnessScalesPeak)
    TestHarness.run("ModalBellSynth §8.2-4 brightnessAddsHighPartials", brightnessAddsHighPartials)
    TestHarness.run("ModalBellSynth §8.2-5 fundamentalIs2100Hz", fundamentalIs2100Hz)
    TestHarness.run("ModalBellSynth §8.2-6 decayIndependentOfSampleRate", decayIndependentOfSampleRate)
    TestHarness.run("ModalBellSynth §8.2-7 rapidStrikesNeverClip", rapidStrikesNeverClip)
    TestHarness.run("ModalBellSynth §8.2-8 deterministicOutput", deterministicOutput)
    TestHarness.run("ModalBellSynth §5.2 clickAmplitudeDoesNotCarryOver", clickAmplitudeDoesNotCarryOver)
    TestHarness.run("ModalBellSynth §5.2 strikeDuringClickNeverClips", strikeDuringClickNeverClips)
    TestHarness.run("ModalBellSynth §5.2 pendingOverflowDropsNewStrikes", pendingOverflowDropsNewStrikes)
    TestHarness.run("ModalBellSynth §5.2 nonFiniteStrikeIsIgnored", nonFiniteStrikeIsIgnored)
    TestHarness.run("ModalBellSynth §5.2 strikeInputIsClamped", strikeInputIsClamped)
  }

  private static func render(_ synth: ModalBellSynth, seconds: Double, sampleRate: Double = fs) -> [Float] {
    return SignalAnalysis.renderSeconds(synth, sampleRate: sampleRate, seconds: seconds)
  }

  private static func struckRender(loudness: Double, brightness: Double, seconds: Double, sampleRate: Double = fs) -> [Float] {
    let synth = ModalBellSynth(sampleRate: sampleRate)

    synth.strike(loudness: loudness, brightness: brightness)

    return render(synth, seconds: seconds, sampleRate: sampleRate)
  }

  /// 10ms 창 RMS가 최대 창 RMS 대비 −40dB 아래로 떨어지는 시각 (초).
  private static func timeToMinus40dB(_ samples: [Float], sampleRate: Double) -> Double {
    let window = Int(sampleRate / 100)
    let rmsList = (0..<(samples.count / window)).map { SignalAnalysis.rms(samples, ($0 * window)..<(($0 + 1) * window)) }
    let threshold = (rmsList.max() ?? 0) * 0.01
    let lastLoud = rmsList.lastIndex { $0 >= threshold } ?? -1

    return Double(lastLoud + 1) * 0.01
  }

  // §8.2-1
  static func newSynthIsSilent() {
    let synth = ModalBellSynth(sampleRate: fs)

    check(synth.isSilent, "new synth isSilent")

    let out = SignalAnalysis.renderChunk(synth, frames: Int(fs / 10), fill: 0.5)

    check(out.allSatisfy { $0 == 0 }, "all zeros")
    check(synth.isSilent, "still silent")
  }

  // §8.2-2
  static func singleStrikePeakAndDecayToSilence() {
    let synth = ModalBellSynth(sampleRate: fs)

    synth.strike(loudness: 1, brightness: 1)

    let firstChunk = SignalAnalysis.renderChunk(synth, frames: Int(fs / 100))

    check(!synth.isSilent, "not silent right after strike")

    let all = firstChunk + render(synth, seconds: silenceRenderSeconds - 0.01)
    let peak = SignalAnalysis.peak(all, 0..<Int(fs))

    check(peak >= 0.6 && peak <= 0.95, "peak \(peak) in 0.6...0.95")
    check(synth.isSilent, "silent after \(silenceRenderSeconds)s")

    let tailRms = SignalAnalysis.rms(all, (all.count - Int(fs / 10))..<all.count)

    check(tailRms < 1e-4, "tail RMS \(tailRms) < 1e-4")

    let after = SignalAnalysis.renderChunk(synth, frames: Int(fs / 100), fill: 0.5)

    check(after.allSatisfy { $0 == 0 }, "silent render fills zeros")
  }

  // §8.2-3
  static func loudnessScalesPeak() {
    let loud = SignalAnalysis.peak(struckRender(loudness: 1, brightness: 1, seconds: 0.5))
    let soft = SignalAnalysis.peak(struckRender(loudness: 0.2, brightness: 1, seconds: 0.5))

    check(soft > 0, "soft strike is audible")
    check(loud >= 3 * soft, "loud \(loud) >= 3 × soft \(soft)")
  }

  // §8.2-4
  static func brightnessAddsHighPartials() {
    let frames = Int(0.05 * fs)
    let bright = SignalAnalysis.zeroCrossings(struckRender(loudness: 1, brightness: 1, seconds: 0.05), 0..<frames)
    let dull = SignalAnalysis.zeroCrossings(struckRender(loudness: 1, brightness: 0.1, seconds: 0.05), 0..<frames)

    check(bright > dull, "bright \(bright) > dull \(dull)")
  }

  // §8.2-5
  static func fundamentalIs2100Hz() {
    let samples = struckRender(loudness: 1, brightness: 1, seconds: 0.6)
    let range = Int(0.1 * fs)..<Int(0.6 * fs)
    let fundamental = SignalAnalysis.goertzelPower(samples, sampleRate: fs, frequencyHz: 2100, range: range)
    let off = SignalAnalysis.goertzelPower(samples, sampleRate: fs, frequencyHz: 1500, range: range)

    check(fundamental > 0, "2100Hz component present")
    check(fundamental >= 10 * off, "E(2100) \(fundamental) >= 10 × E(1500) \(off)")
  }

  // §8.2-6
  static func decayIndependentOfSampleRate() {
    let out44 = struckRender(loudness: 1, brightness: 1, seconds: 6, sampleRate: fs44k)
    let out48 = struckRender(loudness: 1, brightness: 1, seconds: 6, sampleRate: fs)
    let t44 = timeToMinus40dB(out44, sampleRate: fs44k)
    let t48 = timeToMinus40dB(out48, sampleRate: fs)

    check(SignalAnalysis.peak(out44) > 0 && SignalAnalysis.peak(out48) > 0, "both rates produce sound")
    check(t48 > 0 && t48 < 6, "t48 \(t48) within render length")

    if t48 > 0 {
      check(abs(t44 - t48) / t48 <= 0.1, "t44 \(t44) vs t48 \(t48) within 10%")
    }
  }

  // §8.2-7
  static func rapidStrikesNeverClip() {
    let synth = ModalBellSynth(sampleRate: fs)
    var maxAbs = 0.0

    for _ in 0..<20 {
      synth.strike(loudness: 1, brightness: 1)
      maxAbs = max(maxAbs, SignalAnalysis.peak(SignalAnalysis.renderChunk(synth, frames: Int(fs / 100))))
    }

    maxAbs = max(maxAbs, SignalAnalysis.peak(render(synth, seconds: 1)))

    check(maxAbs > 0, "rapid strikes produce sound")
    check(maxAbs < 1, "max |y| \(maxAbs) < 1")
  }

  // §8.2-8
  static func deterministicOutput() {
    let renderSequence = { () -> [Float] in
      let synth = ModalBellSynth(sampleRate: fs)

      synth.strike(loudness: 0.8, brightness: 0.6)

      let first = render(synth, seconds: 0.1)

      synth.strike(loudness: 1, brightness: 1)

      return first + render(synth, seconds: 0.6)
    }

    let first = renderSequence()

    check(SignalAnalysis.peak(first) > 0, "sequence produces sound")
    check(first == renderSequence(), "same strikes → same output")
  }

  /// Output difference between `synth` struck again with `loudness` and an identical synth not struck again,
  /// over the first `frames` after the second strike (100ms after the first L=1 strike).
  private static func secondStrikeContribution(loudness: Double, frames: Int) -> [Float] {
    let struck = ModalBellSynth(sampleRate: fs)
    let reference = ModalBellSynth(sampleRate: fs)

    struck.strike(loudness: 1, brightness: 1)
    reference.strike(loudness: 1, brightness: 1)
    _ = render(struck, seconds: 0.1)
    _ = render(reference, seconds: 0.1)
    struck.strike(loudness: loudness, brightness: 1)

    let withStrike = SignalAnalysis.renderChunk(struck, frames: frames)
    let without = SignalAnalysis.renderChunk(reference, frames: frames)

    return zip(withStrike, without).map { $0 - $1 }
  }

  // §5.2: a finished click leaves no amplitude behind, so the next click starts at 0.3·L.
  static func clickAmplitudeDoesNotCarryOver() {
    let frames = Int(fs / 1000)
    let tinyLoudness = 0.001
    let tiny = SignalAnalysis.peak(secondStrikeContribution(loudness: tinyLoudness, frames: frames))
    let tinyBound = tinyLoudness * (0.3 + 0.36 * 2.35) * 1.1

    check(tiny <= tinyBound, "tiny second strike contribution \(tiny) <= \(tinyBound)")

    let second = SignalAnalysis.peak(secondStrikeContribution(loudness: 1, frames: frames))
    let fresh = SignalAnalysis.peak(struckRender(loudness: 1, brightness: 1, seconds: 0.001))

    check(abs(second - fresh) <= 0.1, "second strike peak \(second) ≈ fresh strike peak \(fresh)")
  }

  // §5.2
  static func strikeDuringClickNeverClips() {
    let synth = ModalBellSynth(sampleRate: fs)

    synth.strike(loudness: 1, brightness: 1)

    let first = SignalAnalysis.renderChunk(synth, frames: Int(0.002 * fs))

    synth.strike(loudness: 1, brightness: 1)

    let rest = render(synth, seconds: 1)
    let maxAbs = max(SignalAnalysis.peak(first), SignalAnalysis.peak(rest))

    check(maxAbs > 0, "produces sound")
    check(maxAbs < 1, "max |y| \(maxAbs) < 1")
  }

  // §5.2
  static func pendingOverflowDropsNewStrikes() {
    let renderAfter = { (count: Int) -> [Float] in
      let synth = ModalBellSynth(sampleRate: fs)

      for _ in 0..<count {
        synth.strike(loudness: 0.01, brightness: 1)
      }

      return render(synth, seconds: 0.2)
    }
    let overflowed = renderAfter(100)

    check(overflowed == renderAfter(64), "100 strikes == 64 strikes")
    check(overflowed != renderAfter(63), "64 strikes != 63 strikes")
  }

  // §5.2
  static func nonFiniteStrikeIsIgnored() {
    let synth = ModalBellSynth(sampleRate: fs)

    synth.strike(loudness: .nan, brightness: 1)
    synth.strike(loudness: 1, brightness: .nan)
    synth.strike(loudness: .infinity, brightness: 1)
    synth.strike(loudness: 1, brightness: -.infinity)

    check(synth.isSilent, "silent after non-finite strikes")

    let out = SignalAnalysis.renderChunk(synth, frames: Int(fs / 100), fill: 0.5)

    check(out.allSatisfy { $0 == 0 }, "all zeros")
    check(synth.isSilent, "still silent")
  }

  // §5.2
  static func strikeInputIsClamped() {
    let negative = struckRender(loudness: -1, brightness: 1, seconds: 0.05)

    check(negative.allSatisfy { $0 == 0 }, "negative loudness → silence")
    check(
      struckRender(loudness: 1, brightness: 5, seconds: 0.1) == struckRender(loudness: 1, brightness: 1, seconds: 0.1),
      "brightness > 1 → 1"
    )
    check(
      struckRender(loudness: 1, brightness: -3, seconds: 0.1) == struckRender(loudness: 1, brightness: 0, seconds: 0.1),
      "brightness < 0 → 0"
    )
  }
}
