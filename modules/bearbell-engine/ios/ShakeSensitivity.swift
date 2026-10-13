import Foundation

/// Shake sensitivity chosen in the UI; maps to clapper gap, min strike speed, damping ratio and restitution (Spec §3.3).
enum ShakeSensitivity: String {
  case high
  case mid
  case low

  /// Unknown values fall back to `.mid`.
  init(rawOrDefault raw: String) {
    self = ShakeSensitivity(rawValue: raw) ?? .mid
  }
}
