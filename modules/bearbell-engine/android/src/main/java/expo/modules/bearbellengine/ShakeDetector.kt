package expo.modules.bearbellengine

import kotlin.math.abs
import kotlin.math.sqrt

enum class ShakeSensitivity(val raw: String, val thresholdG: Float) {
  HIGH("high", 0.55f),
  MID("mid", 0.90f),
  LOW("low", 1.40f);

  companion object {
    fun from(raw: String?): ShakeSensitivity = entries.firstOrNull { it.raw == raw } ?: MID
  }
}

/** Pure shake detection (Spec §3). Not thread-safe; feed from a single sensor thread. */
class ShakeDetector {
  private var lastRingMs: Long? = null

  /** Returns playback volume when a ring should happen, otherwise null. */
  fun process(xG: Float, yG: Float, zG: Float, timestampMs: Long, sensitivity: ShakeSensitivity): Float? {
    val deviation = abs(sqrt(xG * xG + yG * yG + zG * zG) - GRAVITY_G)
    val threshold = sensitivity.thresholdG

    if (deviation < threshold) {
      return null
    }

    val last = lastRingMs

    if (last != null && timestampMs - last < COOLDOWN_MS) {
      return null
    }

    lastRingMs = timestampMs

    val volume = MIN_VOLUME + VOLUME_RANGE * (deviation - threshold) / threshold

    return volume.coerceIn(MIN_VOLUME, MAX_VOLUME)
  }

  companion object {
    const val GRAVITY_G = 1.0f
    const val COOLDOWN_MS = 300L
    const val MIN_VOLUME = 0.55f
    const val MAX_VOLUME = 1.0f
    const val VOLUME_RANGE = 0.45f
  }
}
