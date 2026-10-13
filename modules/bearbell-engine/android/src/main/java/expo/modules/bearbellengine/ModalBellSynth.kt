package expo.modules.bearbellengine

import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.tanh

/**
 * Real-time modal bell synthesis (Spec §5).
 *
 * Threading: [strike] and [isSilent] may be called from any thread. [render] must be called from a
 * single (audio) thread; it never allocates or blocks — pending strikes are polled from a lock-free
 * queue at the start of each call.
 */
class ModalBellSynth(val sampleRate: Int) {
  private class PendingStrike(val loudness: Double, val brightness: Double)

  private val modeCount = MODE_RATIOS.size
  private val coefficientRe = DoubleArray(modeCount)
  private val coefficientIm = DoubleArray(modeCount)
  private val stateRe = DoubleArray(modeCount)
  private val stateIm = DoubleArray(modeCount)
  private val clickFrames = (CLICK_DURATION_SECONDS * sampleRate).roundToInt()
  private val clickDecay = exp(-1 / (CLICK_DECAY_SECONDS * sampleRate))

  private var clickAmplitude = 0.0
  private var clickRemaining = 0
  private var noiseState = CLICK_SEED

  private val pending = ConcurrentLinkedQueue<PendingStrike>()
  private val pendingCount = AtomicInteger(0)

  @Volatile private var renderSilent = true

  init {
    for (mode in 0 until modeCount) {
      val radius = exp(-1 / (MODE_DECAY_SECONDS[mode] * sampleRate))
      val phase = 2 * PI * FUNDAMENTAL_HZ * MODE_RATIOS[mode] / sampleRate

      coefficientRe[mode] = radius * cos(phase)
      coefficientIm[mode] = radius * sin(phase)
    }
  }

  /** True when no ringing remains and no strike is waiting (Spec §5.3). */
  val isSilent: Boolean
    // Count first: render clears renderSilent before decrementing, so this order never misses a strike.
    get() = pendingCount.get() == 0 && renderSilent

  /**
   * Queues a strike; applied at the start of the next render call. Non-finite input is ignored,
   * loudness is clamped to ≥ 0 and brightness to 0..1. Overflow drops the new strike (Spec §5.2).
   */
  fun strike(loudness: Double, brightness: Double) {
    if (!loudness.isFinite() || !brightness.isFinite()) {
      return
    }

    if (pendingCount.incrementAndGet() > PENDING_CAPACITY) {
      pendingCount.decrementAndGet()

      return
    }

    pending.offer(PendingStrike(maxOf(loudness, 0.0), brightness.coerceIn(0.0, 1.0)))
  }

  /** Writes [frameCount] mono samples into [buffer] from [offset]. Real-time safe. */
  fun render(buffer: FloatArray, offset: Int = 0, frameCount: Int = buffer.size - offset) {
    applyPendingStrikes()

    if (renderSilent) {
      buffer.fill(0f, offset, offset + frameCount)

      return
    }

    for (frame in offset until offset + frameCount) {
      var sum = 0.0

      for (mode in 0 until modeCount) {
        val re = stateRe[mode] * coefficientRe[mode] - stateIm[mode] * coefficientIm[mode]
        val im = stateRe[mode] * coefficientIm[mode] + stateIm[mode] * coefficientRe[mode]

        stateRe[mode] = re
        stateIm[mode] = im
        sum += im
      }

      var sample = MASTER * sum

      if (clickRemaining > 0) {
        sample += clickAmplitude * nextNoise()
        clickAmplitude *= clickDecay
        clickRemaining--

        if (clickRemaining == 0) {
          clickAmplitude = 0.0
        }
      }

      buffer[frame] = limit(sample).toFloat()
    }

    updateSilence()
  }

  private fun applyPendingStrikes() {
    repeat(PENDING_CAPACITY) {
      val strike = pending.poll() ?: return

      excite(strike.loudness, strike.brightness)
      pendingCount.decrementAndGet()
    }
  }

  private fun excite(loudness: Double, brightness: Double) {
    val brightWeight = BRIGHT_BASE_WEIGHT + BRIGHT_GAIN_WEIGHT * brightness

    for (mode in 0 until modeCount) {
      val weight = if (mode >= FIRST_BRIGHT_MODE) brightWeight else 1.0

      stateIm[mode] += loudness * MODE_AMPLITUDES[mode] * weight
    }

    clickAmplitude += CLICK_AMPLITUDE * loudness
    clickRemaining = clickFrames
    renderSilent = false
  }

  private fun updateSilence() {
    if (clickRemaining > 0) {
      return
    }

    var energy = 0.0

    for (mode in 0 until modeCount) {
      energy += stateRe[mode] * stateRe[mode] + stateIm[mode] * stateIm[mode]
    }

    if (energy >= SILENCE_ENERGY) {
      return
    }

    stateRe.fill(0.0)
    stateIm.fill(0.0)
    clickAmplitude = 0.0
    renderSilent = true
  }

  /** xorshift32 → [-1, 1). Deterministic per instance. */
  private fun nextNoise(): Double {
    noiseState = noiseState xor (noiseState shl 13)
    noiseState = noiseState xor (noiseState ushr 17)
    noiseState = noiseState xor (noiseState shl 5)

    return (noiseState.toLong() and 0xFFFF_FFFFL).toDouble() / 2_147_483_648.0 - 1
  }

  companion object {
    // §5.1 modes
    const val FUNDAMENTAL_HZ = 2100.0
    private val MODE_RATIOS = doubleArrayOf(1.0, 1.003, 2.76, 5.40, 8.93)
    private val MODE_AMPLITUDES = doubleArrayOf(1.0, 0.35, 0.55, 0.30, 0.15)
    private val MODE_DECAY_SECONDS = doubleArrayOf(0.9, 0.9, 0.45, 0.25, 0.12)

    // §5.2 strike excitation: modes from this index on are weighted by brightness
    const val FIRST_BRIGHT_MODE = 2
    const val BRIGHT_BASE_WEIGHT = 0.4
    const val BRIGHT_GAIN_WEIGHT = 0.6

    // §5.2 transient click
    const val CLICK_DURATION_SECONDS = 0.004
    const val CLICK_AMPLITUDE = 0.3
    const val CLICK_DECAY_SECONDS = 0.003
    const val CLICK_SEED = 0x9E3779B9.toInt()

    // §5.2 output stage
    const val MASTER = 0.36
    const val LIMITER_KNEE = 0.9
    const val LIMITER_RANGE = 0.1
    const val OUTPUT_CEILING = 0.999

    // §5.3 silence
    const val SILENCE_ENERGY = 1e-9

    /** §5.2 strikes queued between two render calls; overflow drops the new strike. */
    const val PENDING_CAPACITY = 64

    /** Soft knee above [LIMITER_KNEE], then a hard clamp so Float never rounds to ±1 (Spec §5.2). */
    private fun limit(sample: Double): Double {
      val magnitude = abs(sample)

      if (magnitude <= LIMITER_KNEE) {
        return sample
      }

      val limited = minOf(LIMITER_KNEE + LIMITER_RANGE * tanh((magnitude - LIMITER_KNEE) / LIMITER_RANGE), OUTPUT_CEILING)

      return if (sample < 0) -limited else limited
    }
  }
}
