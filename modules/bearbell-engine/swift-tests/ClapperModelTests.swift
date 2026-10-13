import Foundation

/// Spec §8.1 시나리오 + §3.4 세기 매핑.
enum ClapperModelTests {
  static let highVMin = 0.15
  static let midVMin = 0.22
  static let lowVMin = 0.30
  static let vRef = 0.6
  static let minStrikeGap = 0.02

  static func runAll() {
    TestHarness.run("ClapperModel §8.1-1 stationaryInVariousPosturesProducesNoStrikes", stationaryInVariousPosturesProducesNoStrikes)
    TestHarness.run("ClapperModel §8.1-2 slowTiltProducesNoStrikes", slowTiltProducesNoStrikes)
    TestHarness.run("ClapperModel §8.1-3 singleStepImpulseRingsPromptlyAndSettles", singleStepImpulseRingsPromptlyAndSettles)
    TestHarness.run("ClapperModel §8.1-4 tinyImpulseProducesNoStrikes", tinyImpulseProducesNoStrikes)
    TestHarness.run("ClapperModel §8.1-5 sensitivityOrdering", sensitivityOrdering)
    TestHarness.run("ClapperModel §8.1-6 strongerImpulseHitsHarder", strongerImpulseHitsHarder)
    TestHarness.run("ClapperModel §8.1-7 strikesAreAtLeast20msApart", strikesAreAtLeast20msApart)
    TestHarness.run("ClapperModel §8.1-8 walkingRingsOnMostSteps", walkingRingsOnMostSteps)
    TestHarness.run("ClapperModel §8.1-9 sensorGapReinitializesWithoutStrike", sensorGapReinitializesWithoutStrike)
    TestHarness.run("ClapperModel §8.1-10 deterministicAndResettable", deterministicAndResettable)
    TestHarness.run("ClapperModel §8.1-11 sensitivitiesFeelDistinct", sensitivitiesFeelDistinct)
    TestHarness.run("ClapperModel §3.1 nonFiniteSampleIsIgnored", nonFiniteSampleIsIgnored)
    TestHarness.run("ClapperModel §3.1 duplicateAndSmallBackwardTimestampsAreIgnored", duplicateAndSmallBackwardTimestampsAreIgnored)
    TestHarness.run("ClapperModel §3.1 backwardClockJumpReinitializes", backwardClockJumpReinitializes)
    TestHarness.run("ClapperModel §3.3 sensitivityChangeDuringShakeIsSafe", sensitivityChangeDuringShakeIsSafe)
    TestHarness.run("ClapperModel §3.3 sensitivityChangeAtRestCreatesNoStrike", sensitivityChangeAtRestCreatesNoStrike)
    TestHarness.run("ClapperModel §3.3 sensitivityTableMatchesSpec", sensitivityTableMatchesSpec)
    TestHarness.run("ClapperModel §3.4 loudnessAtVMinIsFloor", loudnessAtVMinIsFloor)
    TestHarness.run("ClapperModel §3.4 loudnessAtVRefIsFull", loudnessAtVRefIsFull)
    TestHarness.run("ClapperModel §3.4 loudnessMidpointFollowsCurve", loudnessMidpointFollowsCurve)
    TestHarness.run("ClapperModel §3.4 loudnessIsClamped", loudnessIsClamped)
    TestHarness.run("ClapperModel §3.4 loudnessOfNaNIsFloor", loudnessOfNaNIsFloor)
  }

  private static func runScenario(_ samples: [AccelSample], sensitivity: ShakeSensitivity = .mid) -> [ClapperStrike] {
    return ClapperScenarios.run(ClapperModel(sensitivity: sensitivity), samples)
  }

  private static func describe(_ strikes: [ClapperStrike]) -> String {
    return strikes.map { String(format: "(t=%.4f v=%.4f)", $0.timestamp, $0.velocity) }.joined(separator: " ")
  }

  private static func isSame(_ a: [ClapperStrike], _ b: [ClapperStrike]) -> Bool {
    return a.count == b.count && zip(a, b).allSatisfy { $0.timestamp == $1.timestamp && $0.velocity == $1.velocity }
  }

  private static func near(_ a: Double, _ b: Double, _ eps: Double = 1e-9) -> Bool {
    return abs(a - b) <= eps
  }

  // §8.1-1
  static func stationaryInVariousPosturesProducesNoStrikes() {
    let postures = [Vec3(x: 0, y: 0, z: 1), Vec3(x: 0, y: -1, z: 0), Vec3(x: 0.6, y: 0, z: 0.8)]

    for gravity in postures {
      let strikes = runScenario(ClapperScenarios.stationary(gravity: gravity, duration: 5))

      check(strikes.isEmpty, "posture \(gravity): \(describe(strikes))")
    }
  }

  // §8.1-2
  static func slowTiltProducesNoStrikes() {
    let strikes = runScenario(ClapperScenarios.slowRotation())

    check(strikes.isEmpty, describe(strikes))
  }

  // §8.1-3
  static func singleStepImpulseRingsPromptlyAndSettles() {
    let start = ClapperScenarios.impulseStart
    let end = start + ClapperScenarios.impulseDuration
    let strikes = runScenario(ClapperScenarios.impulse(peakG: 2.0))

    check(strikes.contains { $0.timestamp - start >= 0 && $0.timestamp - start <= 0.15 }, "strike within 150ms: \(describe(strikes))")
    check(strikes.count <= 6, "at most 6 strikes: \(strikes.count)")
    check(!strikes.contains { $0.timestamp >= end + 1.0 }, "no strikes 1s after impulse end: \(describe(strikes))")
    check(strikes.allSatisfy { $0.velocity >= midVMin }, "velocities >= vMin(mid): \(describe(strikes))")
  }

  // §8.1-4
  static func tinyImpulseProducesNoStrikes() {
    let strikes = runScenario(ClapperScenarios.impulse(peakG: 0.05))

    check(strikes.isEmpty, describe(strikes))
  }

  // §8.1-5
  static func sensitivityOrdering() {
    for peak in [1.0, 1.5] {
      let samples = ClapperScenarios.impulse(peakG: peak)
      let highModel = ClapperModel()

      highModel.sensitivity = .high

      let high = ClapperScenarios.run(highModel, samples).count
      let mid = runScenario(samples, sensitivity: .mid).count
      let low = runScenario(samples, sensitivity: .low).count

      if peak == 1.0 {
        check(high >= 1, "high rings at 1.0g")
        check(low == 0, "low silent at 1.0g: \(low)")
      }

      check(high >= mid && mid >= low, "peak \(peak): high(\(high)) >= mid(\(mid)) >= low(\(low))")
    }
  }

  // §8.1-6
  static func strongerImpulseHitsHarder() {
    let strong = runScenario(ClapperScenarios.impulse(peakG: 3.0))
    let weak = runScenario(ClapperScenarios.impulse(peakG: 2.0))

    check(!strong.isEmpty, "3.0g rings")
    check(!weak.isEmpty, "2.0g rings")

    if let s = strong.first, let w = weak.first {
      check(s.velocity > w.velocity, "\(s.velocity) > \(w.velocity)")
    }
  }

  // §8.1-7
  static func strikesAreAtLeast20msApart() {
    let strikes = runScenario(ClapperScenarios.sineShake(frequencyHz: 5, amplitudeG: 2, duration: 3))

    check(strikes.count >= 2, "shake rings: \(strikes.count)")

    for (a, b) in zip(strikes, strikes.dropFirst()) {
      check(b.timestamp - a.timestamp >= minStrikeGap - 1e-9, "gap \(b.timestamp - a.timestamp)")
    }
  }

  // §8.1-8
  static func walkingRingsOnMostSteps() {
    let input = ClapperScenarios.walking(verticalG: 1.6, horizontalG: 0.6)
    let strikes = runScenario(input.samples)
    let stepsWithStrike = input.stepStarts.filter { step in
      strikes.contains { $0.timestamp - step >= 0 && $0.timestamp - step <= 0.2 }
    }.count
    let required = Int((Double(input.stepStarts.count) * 0.8).rounded(.up))

    check(input.stepStarts.count == 18, "18 steps: \(input.stepStarts.count)")
    check((18...90).contains(strikes.count), "strike count \(strikes.count) in 18...90")
    check(stepsWithStrike >= required, "steps with strike \(stepsWithStrike) >= \(required)")
  }

  // §8.1-9
  static func sensorGapReinitializesWithoutStrike() {
    let before = ClapperScenarios.stationary(gravity: .unitZ, duration: 1)
    let resumeAt = before.last!.timestamp + 2.0
    let after = ClapperScenarios.stationary(gravity: Vec3(x: 0, y: -1, z: 0), duration: 2, startTime: resumeAt)
    let strikes = runScenario(before + after)

    check(strikes.isEmpty, describe(strikes))
  }

  // §8.1-10
  static func deterministicAndResettable() {
    let walking = ClapperScenarios.walking(verticalG: 1.6, horizontalG: 0.6).samples
    let first = runScenario(walking)
    let second = runScenario(walking)

    check(!first.isEmpty, "walking rings")
    check(isSame(first, second), "same input → same output")

    let reused = ClapperModel()

    _ = ClapperScenarios.run(reused, ClapperScenarios.sineShake(frequencyHz: 5, amplitudeG: 2, duration: 1))
    reused.reset()

    check(isSame(first, ClapperScenarios.run(reused, walking)), "reset() → same as fresh instance")
  }

  /// Strikes per step for an 18-step walk with the given vertical/forward impulse peaks.
  static func strikesPerStep(verticalG: Double, horizontalG: Double, sensitivity: ShakeSensitivity) -> Double {
    let input = ClapperScenarios.walking(verticalG: verticalG, horizontalG: horizontalG)

    check(input.stepStarts.count == 18, "18 steps: \(input.stepStarts.count)")

    return Double(runScenario(input.samples, sensitivity: sensitivity).count) / Double(input.stepStarts.count)
  }

  // §8.1-11
  static func sensitivitiesFeelDistinct() {
    let gentle = (high: strikesPerStep(verticalG: 0.8, horizontalG: 0.3, sensitivity: .high),
                  mid: strikesPerStep(verticalG: 0.8, horizontalG: 0.3, sensitivity: .mid),
                  low: strikesPerStep(verticalG: 0.8, horizontalG: 0.3, sensitivity: .low))
    let normal = (high: strikesPerStep(verticalG: 1.6, horizontalG: 0.6, sensitivity: .high),
                  mid: strikesPerStep(verticalG: 1.6, horizontalG: 0.6, sensitivity: .mid),
                  low: strikesPerStep(verticalG: 1.6, horizontalG: 0.6, sensitivity: .low))
    let strong = (high: strikesPerStep(verticalG: 2.0, horizontalG: 0.7, sensitivity: .high),
                  mid: strikesPerStep(verticalG: 2.0, horizontalG: 0.7, sensitivity: .mid),
                  low: strikesPerStep(verticalG: 2.0, horizontalG: 0.7, sensitivity: .low))
    let vigorousLow = strikesPerStep(verticalG: 2.6, horizontalG: 0.9, sensitivity: .low)

    check(gentle.high >= 0.7 && gentle.mid == 0 && gentle.low == 0, "gentle \(gentle)")
    check(normal.high >= 1.5 && (0.7...1.5).contains(normal.mid) && normal.low == 0, "normal \(normal)")
    check(strong.high >= 1.5 && (0.7...1.5).contains(strong.mid) && strong.low >= 0.7, "strong \(strong)")
    check(vigorousLow >= 0.7, "vigorous low \(vigorousLow)")
  }

  // §3.1
  static func nonFiniteSampleIsIgnored() {
    let walking = ClapperScenarios.walking(verticalG: 1.6, horizontalG: 0.6).samples
    let expected = runScenario(walking)
    var corrupted: [AccelSample] = []

    for (index, sample) in walking.enumerated() {
      corrupted.append(sample)

      if index == 300 {
        corrupted.append(AccelSample(timestamp: sample.timestamp + 0.005, accel: Vec3(x: .nan, y: 0, z: 1)))
        corrupted.append(AccelSample(timestamp: sample.timestamp + 0.005, accel: Vec3(x: 0, y: .infinity, z: 1)))
        corrupted.append(AccelSample(timestamp: .nan, accel: Vec3(x: 3, y: 3, z: 3)))
      }
    }

    let actual = runScenario(corrupted)

    check(!expected.isEmpty, "walking rings")
    check(isSame(expected, actual), "NaN/Inf samples change nothing: \(describe(actual))")
  }

  // §3.1
  static func duplicateAndSmallBackwardTimestampsAreIgnored() {
    let walking = ClapperScenarios.walking(verticalG: 1.6, horizontalG: 0.6).samples
    let expected = runScenario(walking)
    var noisy: [AccelSample] = []

    for (index, sample) in walking.enumerated() {
      noisy.append(sample)
      noisy.append(AccelSample(timestamp: sample.timestamp, accel: sample.accel * 3))

      if index % 50 == 0 {
        noisy.append(AccelSample(timestamp: sample.timestamp - 0.2, accel: Vec3(x: 5, y: 5, z: 5)))
      }
    }

    check(isSame(expected, runScenario(noisy)), "duplicate and small backward samples are ignored")
  }

  // §3.1
  static func backwardClockJumpReinitializes() {
    let before = ClapperScenarios.impulse(peakG: 2.0, gravity: Vec3(x: 0, y: -1, z: 0))
    let offset = before.last!.timestamp - 10
    let after = ClapperScenarios.impulse(peakG: 2.0).map {
      AccelSample(timestamp: $0.timestamp + offset, accel: $0.accel)
    }
    let impulseAt = offset + ClapperScenarios.impulseStart
    let beforeStrikes = runScenario(before)
    let strikes = runScenario(before + after)
    let afterJump = strikes.filter { $0.timestamp < before.first!.timestamp }

    check(!beforeStrikes.isEmpty, "rings before the jump")
    check(!afterJump.contains { $0.timestamp < impulseAt }, "no strikes before the new impulse: \(describe(afterJump))")
    check(afterJump.contains { $0.timestamp - impulseAt >= 0 && $0.timestamp - impulseAt <= 0.15 }, "impulse after jump rings: \(describe(afterJump))")
  }

  // §3.3
  static func sensitivityChangeDuringShakeIsSafe() {
    let samples = ClapperScenarios.sineShake(frequencyHz: 5, amplitudeG: 2, duration: 3)
    let switchIndex = 150
    let switchAt = samples[switchIndex].timestamp
    let cases: [(ShakeSensitivity, ShakeSensitivity)] = [(.high, .low), (.low, .high)]

    for (from, to) in cases {
      let model = ClapperModel(sensitivity: from)
      var strikes: [ClapperStrike] = []

      for (index, sample) in samples.enumerated() {
        if index == switchIndex {
          model.sensitivity = to
        }

        strikes += model.process(x: sample.accel.x, y: sample.accel.y, z: sample.accel.z, timestamp: sample.timestamp)
      }

      check(strikes.count >= 2, "\(from)→\(to) rings: \(strikes.count)")
      check(strikes.allSatisfy { $0.timestamp.isFinite && $0.velocity.isFinite }, "\(from)→\(to) finite: \(describe(strikes))")

      for (a, b) in zip(strikes, strikes.dropFirst()) {
        check(b.timestamp - a.timestamp >= minStrikeGap - 1e-9, "\(from)→\(to) gap \(b.timestamp - a.timestamp)")
      }

      if ClapperModel.gap(for: to) > ClapperModel.gap(for: from) {
        let early = strikes.filter { $0.timestamp > switchAt - 0.01 && $0.timestamp <= switchAt + 0.005 }

        check(early.isEmpty, "\(from)→\(to) larger gap creates no strike: \(describe(early))")
      }
    }
  }

  // §3.3
  static func sensitivityChangeAtRestCreatesNoStrike() {
    let samples = ClapperScenarios.stationary(gravity: .unitZ, duration: 2)
    let model = ClapperModel(sensitivity: .low)
    var strikes: [ClapperStrike] = []

    for (index, sample) in samples.enumerated() {
      if index == 100 {
        model.sensitivity = .high
      }

      strikes += model.process(x: sample.accel.x, y: sample.accel.y, z: sample.accel.z, timestamp: sample.timestamp)
    }

    check(strikes.isEmpty, describe(strikes))
  }

  // §3.3 table: gap (m), vMin (m/s), ζ, e
  static func sensitivityTableMatchesSpec() {
    let table: [(ShakeSensitivity, Double, Double, Double, Double)] = [
      (.high, 0.009, 0.15, 0.20, 0.3),
      (.mid, 0.013, 0.22, 0.30, 0.2),
      (.low, 0.017, 0.30, 0.40, 0.15),
    ]

    for (sensitivity, gap, vMin, dampingRatio, restitution) in table {
      check(near(ClapperModel.gap(for: sensitivity), gap), "\(sensitivity) gap")
      check(near(ClapperModel.minVelocity(for: sensitivity), vMin), "\(sensitivity) vMin")
      check(near(ClapperModel.dampingRatio(for: sensitivity), dampingRatio), "\(sensitivity) ζ")
      check(near(ClapperModel.restitution(for: sensitivity), restitution), "\(sensitivity) e")
    }
  }

  // §3.4
  static func loudnessAtVMinIsFloor() {
    let cases: [(ShakeSensitivity, Double)] = [(.high, highVMin), (.mid, midVMin), (.low, lowVMin)]

    for (sensitivity, vMin) in cases {
      let result = ClapperModel.loudness(velocity: vMin, sensitivity: sensitivity)

      check(near(result.loudness, 0.12), "\(sensitivity) loudness \(result.loudness)")
      check(near(result.brightness, 0), "\(sensitivity) brightness \(result.brightness)")
    }
  }

  static func loudnessAtVRefIsFull() {
    let result = ClapperModel.loudness(velocity: vRef, sensitivity: .mid)

    check(near(result.loudness, 1), "loudness \(result.loudness)")
    check(near(result.brightness, 1), "brightness \(result.brightness)")
  }

  static func loudnessMidpointFollowsCurve() {
    let v = midVMin + 0.5 * (vRef - midVMin)
    let result = ClapperModel.loudness(velocity: v, sensitivity: .mid)

    check(near(result.loudness, 0.12 + 0.88 * pow(0.5, 0.8)), "loudness \(result.loudness)")
    check(near(result.brightness, 0.5), "brightness \(result.brightness)")
  }

  static func loudnessIsClamped() {
    let low = ClapperModel.loudness(velocity: 0, sensitivity: .mid)
    let high = ClapperModel.loudness(velocity: 5, sensitivity: .mid)

    check(near(low.loudness, 0.12) && near(low.brightness, 0), "low \(low)")
    check(near(high.loudness, 1) && near(high.brightness, 1), "high \(high)")
  }

  static func loudnessOfNaNIsFloor() {
    let result = ClapperModel.loudness(velocity: .nan, sensitivity: .mid)

    check(near(result.loudness, 0.12) && near(result.brightness, 0), "NaN → floor \(result)")
  }
}
