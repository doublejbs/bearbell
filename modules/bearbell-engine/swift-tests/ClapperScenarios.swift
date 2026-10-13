import Foundation

/// 3축 벡터 (g 단위).
struct Vec3: Equatable {
  let x: Double
  let y: Double
  let z: Double

  static let zero = Vec3(x: 0, y: 0, z: 0)
  static let unitX = Vec3(x: 1, y: 0, z: 0)
  static let unitZ = Vec3(x: 0, y: 0, z: 1)

  static func + (lhs: Vec3, rhs: Vec3) -> Vec3 {
    return Vec3(x: lhs.x + rhs.x, y: lhs.y + rhs.y, z: lhs.z + rhs.z)
  }

  static func * (lhs: Vec3, k: Double) -> Vec3 {
    return Vec3(x: lhs.x * k, y: lhs.y * k, z: lhs.z * k)
  }
}

/// 가속도계 샘플 하나 (초, g, 중력 포함).
struct AccelSample {
  let timestamp: Double
  let accel: Vec3
}

/// 반파 사인 펄스: [start, start + duration] 동안 peak × sin(π·u).
struct HalfSinePulse {
  let start: Double
  let duration: Double
  let peak: Vec3
}

struct WalkingInput {
  let samples: [AccelSample]
  let stepStarts: [Double]
}

/// Spec §8.1 시나리오용 100Hz 합성 가속도 생성기.
enum ClapperScenarios {
  static let sampleInterval = 0.01
  static let impulseDuration = 0.08
  static let impulseStart = 0.5

  static func generate(
    duration: Double,
    startTime: Double = 0,
    pulses: [HalfSinePulse] = [],
    gravityAt: (Double) -> Vec3 = { _ in Vec3.unitZ }
  ) -> [AccelSample] {
    let count = Int((duration / sampleInterval).rounded())

    return (0..<count).map { i in
      let t = startTime + Double(i) * sampleInterval
      var accel = gravityAt(t)

      for pulse in pulses {
        let u = (t - pulse.start) / pulse.duration

        if u >= 0 && u <= 1 {
          accel = accel + pulse.peak * sin(Double.pi * u)
        }
      }

      return AccelSample(timestamp: t, accel: accel)
    }
  }

  static func stationary(gravity: Vec3, duration: Double, startTime: Double = 0) -> [AccelSample] {
    return generate(duration: duration, startTime: startTime) { _ in gravity }
  }

  /// 정지 상태에서 impulseStart에 80ms 반파 사인 임펄스 (최대 peakG).
  static func impulse(
    peakG: Double,
    axis: Vec3 = .unitX,
    totalDuration: Double = 4.0,
    gravity: Vec3 = .unitZ
  ) -> [AccelSample] {
    let pulse = HalfSinePulse(start: impulseStart, duration: impulseDuration, peak: axis * peakG)

    return generate(duration: totalDuration, pulses: [pulse]) { _ in gravity }
  }

  /// 정지 restBefore → duration 동안 중력 방향 90° 회전 (ease-in-out) → 정지 restAfter.
  static func slowRotation(duration: Double = 4.0, restBefore: Double = 1.0, restAfter: Double = 2.0) -> [AccelSample] {
    return generate(duration: restBefore + duration + restAfter) { t in
      let u = min(max((t - restBefore) / duration, 0), 1)
      let theta = (Double.pi / 2) * (1 - cos(Double.pi * u)) / 2

      return Vec3(x: sin(theta), y: 0, z: cos(theta))
    }
  }

  /// 중력 + axis 방향 사인 흔들기.
  static func sineShake(
    frequencyHz: Double,
    amplitudeG: Double,
    duration: Double,
    axis: Vec3 = .unitX,
    gravity: Vec3 = .unitZ
  ) -> [AccelSample] {
    return generate(duration: duration) { t in
      gravity + axis * (amplitudeG * sin(2 * Double.pi * frequencyHz * t))
    }
  }

  /// stepHz 걸음: 걸음마다 수직(z) verticalG·수평(x) horizontalG 반파 사인 임펄스.
  static func walking(
    stepHz: Double = 1.8,
    verticalG: Double = 1.6,
    horizontalG: Double = 0.6,
    impulseDuration: Double = 0.1,
    walkDuration: Double = 10.0,
    leadIn: Double = 0.5,
    tail: Double = 1.0
  ) -> WalkingInput {
    var stepStarts: [Double] = []
    var k = 0

    while leadIn + Double(k) / stepHz < leadIn + walkDuration {
      stepStarts.append(leadIn + Double(k) / stepHz)
      k += 1
    }

    let peak = Vec3(x: horizontalG, y: 0, z: verticalG)
    let pulses = stepStarts.map { HalfSinePulse(start: $0, duration: impulseDuration, peak: peak) }
    let samples = generate(duration: leadIn + walkDuration + tail, pulses: pulses)

    return WalkingInput(samples: samples, stepStarts: stepStarts)
  }

  static func run(_ model: ClapperModel, _ samples: [AccelSample]) -> [ClapperStrike] {
    return samples.flatMap { model.process(x: $0.accel.x, y: $0.accel.y, z: $0.accel.z, timestamp: $0.timestamp) }
  }
}
