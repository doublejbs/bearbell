package expo.modules.bearbellengine

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.exp
import kotlin.math.pow
import kotlin.math.sqrt

/** The clapper hit the bell body (Spec §3.2). [velocity] is the normal impact speed in m/s. */
data class ClapperStrike(val timestamp: Double, val velocity: Double)

/** Synth input derived from an impact speed (Spec §3.4). */
data class StrikeLoudness(val loudness: Double, val brightness: Double)

/**
 * Spring-damper clapper inside a bell that moves with the phone (Spec §3).
 * Not thread-safe; feed from a single sensor thread.
 */
class ClapperModel(
  /** Applied from the next sample; clapper state is kept. */
  @Volatile var sensitivity: ShakeSensitivity = ShakeSensitivity.MID,
) {
  private var hasSample = false
  private var lastTimestamp = 0.0
  private var lastStrikeTimestamp = Double.NEGATIVE_INFINITY

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

  /** Feeds one accelerometer sample (g, gravity included; seconds). Returns strikes in time order. */
  fun process(x: Double, y: Double, z: Double, timestamp: Double): List<ClapperStrike> {
    if (!x.isFinite() || !y.isFinite() || !z.isFinite() || !timestamp.isFinite()) {
      return emptyList()
    }

    if (!hasSample) {
      initialize(x, y, z, timestamp)

      return emptyList()
    }

    val rawInterval = timestamp - lastTimestamp

    if (abs(rawInterval) > RESET_SAMPLE_INTERVAL) {
      initialize(x, y, z, timestamp)

      return emptyList()
    }

    if (rawInterval <= 0.0) {
      return emptyList()
    }

    val dt = minOf(rawInterval, MAX_SAMPLE_INTERVAL)
    val alpha = 1 - exp(-dt / GRAVITY_TIME_CONSTANT)

    lastTimestamp = timestamp
    gravityX += (x - gravityX) * alpha
    gravityY += (y - gravityY) * alpha
    gravityZ += (z - gravityZ) * alpha

    val startX = linearX
    val startY = linearY
    val startZ = linearZ
    val endX = (x - gravityX) * STANDARD_GRAVITY
    val endY = (y - gravityY) * STANDARD_GRAVITY
    val endZ = (z - gravityZ) * STANDARD_GRAVITY
    val steps = maxOf(1, ceil(dt / MAX_SUBSTEP - 1e-9).toInt())
    val h = dt / steps
    val currentSensitivity = sensitivity
    val gap = gapOf(currentSensitivity)
    val vMin = minVelocityOf(currentSensitivity)
    val damping = dampingOf(currentSensitivity)
    val bounce = 1 + restitutionOf(currentSensitivity)
    var strikes: MutableList<ClapperStrike>? = null

    for (step in 1..steps) {
      val fraction = step.toDouble() / steps
      val linX = startX + (endX - startX) * fraction
      val linY = startY + (endY - startY) * fraction
      val linZ = startZ + (endZ - startZ) * fraction

      velocityX += (-STIFFNESS * positionX - damping * velocityX - linX) * h
      velocityY += (-STIFFNESS * positionY - damping * velocityY - linY) * h
      velocityZ += (-STIFFNESS * positionZ - damping * velocityZ - linZ) * h
      positionX += velocityX * h
      positionY += velocityY * h
      positionZ += velocityZ * h

      val radius = sqrt(positionX * positionX + positionY * positionY + positionZ * positionZ)

      if (radius <= gap) {
        continue
      }

      val nx = positionX / radius
      val ny = positionY / radius
      val nz = positionZ / radius
      val normalVelocity = velocityX * nx + velocityY * ny + velocityZ * nz

      positionX = nx * gap
      positionY = ny * gap
      positionZ = nz * gap

      if (normalVelocity <= 0.0) {
        continue
      }

      val impulse = bounce * normalVelocity

      velocityX -= impulse * nx
      velocityY -= impulse * ny
      velocityZ -= impulse * nz

      val strikeTimestamp = timestamp - (steps - step) * h

      if (normalVelocity >= vMin && strikeTimestamp - lastStrikeTimestamp >= MIN_STRIKE_INTERVAL) {
        lastStrikeTimestamp = strikeTimestamp

        val list = strikes ?: ArrayList<ClapperStrike>(2).also { strikes = it }

        list.add(ClapperStrike(strikeTimestamp, normalVelocity))
      }
    }

    linearX = endX
    linearY = endY
    linearZ = endZ

    return strikes ?: emptyList()
  }

  /** Back to a fresh instance's state (sensitivity is kept). */
  fun reset() {
    hasSample = false
    lastTimestamp = 0.0
    lastStrikeTimestamp = Double.NEGATIVE_INFINITY
    gravityX = 0.0
    gravityY = 0.0
    gravityZ = 0.0
    restClapper()
  }

  /**
   * First sample, sensor resume or clock re-base: gravity = current sample, clapper at rest,
   * strike interval restarted (the old clock no longer applies).
   */
  private fun initialize(x: Double, y: Double, z: Double, timestamp: Double) {
    hasSample = true
    lastTimestamp = timestamp
    lastStrikeTimestamp = Double.NEGATIVE_INFINITY
    gravityX = x
    gravityY = y
    gravityZ = z
    restClapper()
  }

  private fun restClapper() {
    linearX = 0.0
    linearY = 0.0
    linearZ = 0.0
    positionX = 0.0
    positionY = 0.0
    positionZ = 0.0
    velocityX = 0.0
    velocityY = 0.0
    velocityZ = 0.0
  }

  companion object {
    // §3.1 input and gravity removal
    const val STANDARD_GRAVITY = 9.80665
    const val GRAVITY_TIME_CONSTANT = 0.25
    const val MAX_SAMPLE_INTERVAL = 0.05
    /** `dt > this` (sensor resumed) or `dt < -this` (clock re-based) reinitializes. */
    const val RESET_SAMPLE_INTERVAL = 0.5

    // §3.2 clapper motion
    const val NATURAL_FREQUENCY = 4.0
    const val MAX_SUBSTEP = 0.0025
    const val MIN_STRIKE_INTERVAL = 0.02

    // §3.3 sensitivity (gap in m, vMin in m/s, damping ratio ζ, restitution e)
    const val HIGH_GAP = 0.009
    const val MID_GAP = 0.013
    const val LOW_GAP = 0.017
    const val HIGH_MIN_VELOCITY = 0.15
    const val MID_MIN_VELOCITY = 0.22
    const val LOW_MIN_VELOCITY = 0.30
    const val HIGH_DAMPING_RATIO = 0.20
    const val MID_DAMPING_RATIO = 0.30
    const val LOW_DAMPING_RATIO = 0.40
    const val HIGH_RESTITUTION = 0.3
    const val MID_RESTITUTION = 0.2
    const val LOW_RESTITUTION = 0.15

    // §3.4 loudness mapping
    const val REFERENCE_VELOCITY = 0.6
    const val MIN_LOUDNESS = 0.12
    const val LOUDNESS_EXPONENT = 0.8

    private const val OMEGA = 2 * PI * NATURAL_FREQUENCY
    private const val STIFFNESS = OMEGA * OMEGA
    private const val HIGH_DAMPING = 2 * HIGH_DAMPING_RATIO * OMEGA
    private const val MID_DAMPING = 2 * MID_DAMPING_RATIO * OMEGA
    private const val LOW_DAMPING = 2 * LOW_DAMPING_RATIO * OMEGA

    fun gapOf(sensitivity: ShakeSensitivity): Double =
      when (sensitivity) {
        ShakeSensitivity.HIGH -> HIGH_GAP
        ShakeSensitivity.MID -> MID_GAP
        ShakeSensitivity.LOW -> LOW_GAP
      }

    fun minVelocityOf(sensitivity: ShakeSensitivity): Double =
      when (sensitivity) {
        ShakeSensitivity.HIGH -> HIGH_MIN_VELOCITY
        ShakeSensitivity.MID -> MID_MIN_VELOCITY
        ShakeSensitivity.LOW -> LOW_MIN_VELOCITY
      }

    fun dampingRatioOf(sensitivity: ShakeSensitivity): Double =
      when (sensitivity) {
        ShakeSensitivity.HIGH -> HIGH_DAMPING_RATIO
        ShakeSensitivity.MID -> MID_DAMPING_RATIO
        ShakeSensitivity.LOW -> LOW_DAMPING_RATIO
      }

    fun restitutionOf(sensitivity: ShakeSensitivity): Double =
      when (sensitivity) {
        ShakeSensitivity.HIGH -> HIGH_RESTITUTION
        ShakeSensitivity.MID -> MID_RESTITUTION
        ShakeSensitivity.LOW -> LOW_RESTITUTION
      }

    /** Precomputed 2ζω per sensitivity. */
    private fun dampingOf(sensitivity: ShakeSensitivity): Double =
      when (sensitivity) {
        ShakeSensitivity.HIGH -> HIGH_DAMPING
        ShakeSensitivity.MID -> MID_DAMPING
        ShakeSensitivity.LOW -> LOW_DAMPING
      }

    /**
     * Maps an impact speed to synth loudness/brightness (Spec §3.4).
     * A NaN velocity maps to the floor (level 0) so NaN never reaches the synth.
     */
    fun loudness(velocity: Double, sensitivity: ShakeSensitivity): StrikeLoudness {
      val vMin = minVelocityOf(sensitivity)
      val ratio = (velocity - vMin) / (REFERENCE_VELOCITY - vMin)
      val level = if (ratio.isNaN()) 0.0 else ratio.coerceIn(0.0, 1.0)

      return StrikeLoudness(MIN_LOUDNESS + (1 - MIN_LOUDNESS) * level.pow(LOUDNESS_EXPONENT), level)
    }
  }
}
