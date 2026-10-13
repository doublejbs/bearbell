import Foundation

/// The clapper hit the bell body (Spec §3.2). `velocity` is the normal impact speed in m/s.
struct ClapperStrike: Equatable {
  let timestamp: Double
  let velocity: Double
}

/// Synth input derived from an impact speed (Spec §3.4).
struct StrikeLoudness: Equatable {
  let loudness: Double
  let brightness: Double
}

/// Spring-damper clapper inside a bell that moves with the phone (Spec §3).
/// Not thread-safe; feed from a single sensor queue.
final class ClapperModel {
  // §3.1 input and gravity removal
  static let standardGravity = 9.80665
  static let gravityTimeConstant = 0.25
  static let maxSampleInterval = 0.05
  /// `dt > this` (sensor resumed) or `dt < -this` (clock re-based) reinitializes.
  static let resetSampleInterval = 0.5

  // §3.2 clapper motion
  static let naturalFrequency = 4.0
  static let maxSubstep = 0.0025
  static let minStrikeInterval = 0.02

  // §3.3 sensitivity (gap in m, vMin in m/s, damping ratio ζ, restitution e)
  static let highGap = 0.009
  static let midGap = 0.013
  static let lowGap = 0.017
  static let highMinVelocity = 0.15
  static let midMinVelocity = 0.22
  static let lowMinVelocity = 0.30
  static let highDampingRatio = 0.20
  static let midDampingRatio = 0.30
  static let lowDampingRatio = 0.40
  static let highRestitution = 0.3
  static let midRestitution = 0.2
  static let lowRestitution = 0.15

  // §3.4 loudness mapping
  static let referenceVelocity = 0.6
  static let minLoudness = 0.12
  static let loudnessExponent = 0.8

  private static let omega = 2 * Double.pi * naturalFrequency
  private static let stiffness = omega * omega
  private static let highDamping = 2 * highDampingRatio * omega
  private static let midDamping = 2 * midDampingRatio * omega
  private static let lowDamping = 2 * lowDampingRatio * omega

  /// Applied from the next sample; clapper state is kept.
  var sensitivity: ShakeSensitivity

  private var hasSample = false
  private var lastTimestamp = 0.0
  private var lastStrikeTimestamp = -Double.infinity

  private var gravityX = 0.0
  private var gravityY = 0.0
  private var gravityZ = 0.0

  private var linearX = 0.0
  private var linearY = 0.0
  private var linearZ = 0.0

  private var positionX = 0.0
  private var positionY = 0.0
  private var positionZ = 0.0

  private var velocityX = 0.0
  private var velocityY = 0.0
  private var velocityZ = 0.0

  init(sensitivity: ShakeSensitivity = .mid) {
    self.sensitivity = sensitivity
  }

  static func gap(for sensitivity: ShakeSensitivity) -> Double {
    switch sensitivity {
    case .high:
      return highGap
    case .mid:
      return midGap
    case .low:
      return lowGap
    }
  }

  static func minVelocity(for sensitivity: ShakeSensitivity) -> Double {
    switch sensitivity {
    case .high:
      return highMinVelocity
    case .mid:
      return midMinVelocity
    case .low:
      return lowMinVelocity
    }
  }

  static func dampingRatio(for sensitivity: ShakeSensitivity) -> Double {
    switch sensitivity {
    case .high:
      return highDampingRatio
    case .mid:
      return midDampingRatio
    case .low:
      return lowDampingRatio
    }
  }

  static func restitution(for sensitivity: ShakeSensitivity) -> Double {
    switch sensitivity {
    case .high:
      return highRestitution
    case .mid:
      return midRestitution
    case .low:
      return lowRestitution
    }
  }

  /// Precomputed 2ζω per sensitivity.
  private static func damping(for sensitivity: ShakeSensitivity) -> Double {
    switch sensitivity {
    case .high:
      return highDamping
    case .mid:
      return midDamping
    case .low:
      return lowDamping
    }
  }

  /// Maps an impact speed to synth loudness/brightness (Spec §3.4).
  /// A NaN velocity maps to the floor (level 0) so NaN never reaches the synth.
  static func loudness(velocity: Double, sensitivity: ShakeSensitivity) -> StrikeLoudness {
    let vMin = minVelocity(for: sensitivity)
    let ratio = (velocity - vMin) / (referenceVelocity - vMin)
    let level = ratio.isNaN ? 0 : min(max(ratio, 0), 1)

    return StrikeLoudness(
      loudness: minLoudness + (1 - minLoudness) * pow(level, loudnessExponent),
      brightness: level
    )
  }

  /// Feeds one accelerometer sample (g, gravity included). Returns strikes in time order.
  func process(x: Double, y: Double, z: Double, timestamp: Double) -> [ClapperStrike] {
    if !x.isFinite || !y.isFinite || !z.isFinite || !timestamp.isFinite {
      return []
    }

    if !hasSample {
      initialize(x: x, y: y, z: z, timestamp: timestamp)

      return []
    }

    let rawInterval = timestamp - lastTimestamp

    if abs(rawInterval) > Self.resetSampleInterval {
      initialize(x: x, y: y, z: z, timestamp: timestamp)

      return []
    }

    if rawInterval <= 0 {
      return []
    }

    let dt = min(rawInterval, Self.maxSampleInterval)
    let alpha = 1 - exp(-dt / Self.gravityTimeConstant)

    lastTimestamp = timestamp
    gravityX += (x - gravityX) * alpha
    gravityY += (y - gravityY) * alpha
    gravityZ += (z - gravityZ) * alpha

    let startX = linearX
    let startY = linearY
    let startZ = linearZ
    let endX = (x - gravityX) * Self.standardGravity
    let endY = (y - gravityY) * Self.standardGravity
    let endZ = (z - gravityZ) * Self.standardGravity
    let steps = max(1, Int((dt / Self.maxSubstep - 1e-9).rounded(.up)))
    let h = dt / Double(steps)
    let currentSensitivity = sensitivity
    let gap = Self.gap(for: currentSensitivity)
    let vMin = Self.minVelocity(for: currentSensitivity)
    let damping = Self.damping(for: currentSensitivity)
    let bounce = 1 + Self.restitution(for: currentSensitivity)
    var strikes: [ClapperStrike] = []

    for step in 1...steps {
      let fraction = Double(step) / Double(steps)
      let linX = startX + (endX - startX) * fraction
      let linY = startY + (endY - startY) * fraction
      let linZ = startZ + (endZ - startZ) * fraction

      velocityX += (-Self.stiffness * positionX - damping * velocityX - linX) * h
      velocityY += (-Self.stiffness * positionY - damping * velocityY - linY) * h
      velocityZ += (-Self.stiffness * positionZ - damping * velocityZ - linZ) * h
      positionX += velocityX * h
      positionY += velocityY * h
      positionZ += velocityZ * h

      let radius = (positionX * positionX + positionY * positionY + positionZ * positionZ).squareRoot()

      if radius <= gap {
        continue
      }

      let nx = positionX / radius
      let ny = positionY / radius
      let nz = positionZ / radius
      let normalVelocity = velocityX * nx + velocityY * ny + velocityZ * nz

      positionX = nx * gap
      positionY = ny * gap
      positionZ = nz * gap

      if normalVelocity <= 0 {
        continue
      }

      let impulse = bounce * normalVelocity

      velocityX -= impulse * nx
      velocityY -= impulse * ny
      velocityZ -= impulse * nz

      let strikeTimestamp = timestamp - Double(steps - step) * h

      if normalVelocity >= vMin && strikeTimestamp - lastStrikeTimestamp >= Self.minStrikeInterval {
        lastStrikeTimestamp = strikeTimestamp
        strikes.append(ClapperStrike(timestamp: strikeTimestamp, velocity: normalVelocity))
      }
    }

    linearX = endX
    linearY = endY
    linearZ = endZ

    return strikes
  }

  /// Back to a fresh instance's state (sensitivity is kept).
  func reset() {
    hasSample = false
    lastTimestamp = 0
    lastStrikeTimestamp = -Double.infinity
    gravityX = 0
    gravityY = 0
    gravityZ = 0
    restClapper()
  }

  /// First sample, sensor resume or clock re-base: gravity = current sample, clapper at rest,
  /// strike interval restarted (the old clock no longer applies).
  private func initialize(x: Double, y: Double, z: Double, timestamp: Double) {
    hasSample = true
    lastTimestamp = timestamp
    lastStrikeTimestamp = -Double.infinity
    gravityX = x
    gravityY = y
    gravityZ = z
    restClapper()
  }

  private func restClapper() {
    linearX = 0
    linearY = 0
    linearZ = 0
    positionX = 0
    positionY = 0
    positionZ = 0
    velocityX = 0
    velocityY = 0
    velocityZ = 0
  }
}
