import Foundation

enum ShakeSensitivity: String {
  case high
  case mid
  case low

  /// Unknown values fall back to `.mid`.
  init(rawOrDefault raw: String) {
    self = ShakeSensitivity(rawValue: raw) ?? .mid
  }

  /// Deviation from 1 g required to ring, in g.
  var threshold: Double {
    switch self {
    case .high:
      return 0.55
    case .mid:
      return 0.90
    case .low:
      return 1.40
    }
  }
}

/// Pure shake detection logic shared by the spec for both platforms (see docs/Spec.md §3).
struct ShakeDetector {
  static let gravity: Double = 1.0
  static let cooldown: TimeInterval = 0.3
  static let minVolume: Double = 0.55
  static let maxVolume: Double = 1.0
  static let volumeGain: Double = 0.45

  var sensitivity: ShakeSensitivity

  private var lastRingTimestamp: TimeInterval = -.infinity

  init(sensitivity: ShakeSensitivity = .mid) {
    self.sensitivity = sensitivity
  }

  /// Feeds one accelerometer sample (in g, gravity included).
  /// Returns the bell volume when the sample should ring, otherwise `nil`.
  mutating func process(x: Double, y: Double, z: Double, timestamp: TimeInterval) -> Float? {
    let magnitude = (x * x + y * y + z * z).squareRoot()
    let deviation = abs(magnitude - Self.gravity)
    let threshold = sensitivity.threshold

    guard deviation >= threshold else {
      return nil
    }

    guard timestamp - lastRingTimestamp >= Self.cooldown else {
      return nil
    }

    lastRingTimestamp = timestamp

    let rawVolume = Self.minVolume + Self.volumeGain * (deviation - threshold) / threshold

    return Float(min(max(rawVolume, Self.minVolume), Self.maxVolume))
  }

  mutating func reset() {
    lastRingTimestamp = -.infinity
  }
}
