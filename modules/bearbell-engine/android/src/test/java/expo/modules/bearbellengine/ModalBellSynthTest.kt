package expo.modules.bearbellengine

import kotlin.math.abs
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Spec §8.2 시나리오. */
class ModalBellSynthTest {
  private fun render(synth: ModalBellSynth, seconds: Double, sampleRate: Int = FS): FloatArray =
    SignalAnalysis.renderSeconds(synth, sampleRate, seconds)

  private fun struckRender(loudness: Double, brightness: Double, seconds: Double, sampleRate: Int = FS): FloatArray {
    val synth = ModalBellSynth(sampleRate)

    synth.strike(loudness, brightness)

    return render(synth, seconds, sampleRate)
  }

  /** 10ms 창 RMS가 최대 창 RMS 대비 −40dB 아래로 떨어지는 시각 (초). */
  private fun timeToMinus40dB(samples: FloatArray, sampleRate: Int): Double {
    val window = sampleRate / 100
    val rmsList = (0 until samples.size / window).map { SignalAnalysis.rms(samples, it * window, (it + 1) * window) }
    val threshold = rmsList.max() * 0.01
    val lastLoud = rmsList.indexOfLast { it >= threshold }

    return (lastLoud + 1) * 0.01
  }

  // §8.2-1
  @Test
  fun newSynthIsSilent() {
    val synth = ModalBellSynth(FS)
    val buffer = FloatArray(FS / 10) { 0.5f }

    assertTrue(synth.isSilent)

    synth.render(buffer)

    assertTrue(buffer.all { it == 0f })
    assertTrue(synth.isSilent)
  }

  // §8.2-2
  @Test
  fun singleStrikePeakAndDecayToSilence() {
    val synth = ModalBellSynth(FS)
    val firstChunk = FloatArray(FS / 100)

    synth.strike(1.0, 1.0)
    synth.render(firstChunk)

    assertFalse("not silent right after strike", synth.isSilent)

    val rest = render(synth, SILENCE_RENDER_SECONDS - 0.01)
    val all = firstChunk + rest
    val peak = SignalAnalysis.peak(all, 0, FS)

    assertTrue("peak $peak in 0.6..0.95", peak in 0.6..0.95)
    assertTrue("silent after ${SILENCE_RENDER_SECONDS}s", synth.isSilent)

    val tailRms = SignalAnalysis.rms(all, all.size - FS / 10, all.size)

    assertTrue("tail RMS $tailRms < 1e-4", tailRms < 1e-4)

    val after = FloatArray(FS / 100) { 0.5f }

    synth.render(after)

    assertTrue("silent render fills zeros", after.all { it == 0f })
  }

  // §8.2-3
  @Test
  fun loudnessScalesPeak() {
    val loud = SignalAnalysis.peak(struckRender(1.0, 1.0, 0.5))
    val soft = SignalAnalysis.peak(struckRender(0.2, 1.0, 0.5))

    assertTrue("soft strike is audible", soft > 0)
    assertTrue("loud $loud >= 3 × soft $soft", loud >= 3 * soft)
  }

  // §8.2-4
  @Test
  fun brightnessAddsHighPartials() {
    val frames = (0.05 * FS).toInt()
    val bright = SignalAnalysis.zeroCrossings(struckRender(1.0, 1.0, 0.05), 0, frames)
    val dull = SignalAnalysis.zeroCrossings(struckRender(1.0, 0.1, 0.05), 0, frames)

    assertTrue("bright $bright > dull $dull", bright > dull)
  }

  // §8.2-5
  @Test
  fun fundamentalIs2100Hz() {
    val samples = struckRender(1.0, 1.0, 0.6)
    val from = (0.1 * FS).toInt()
    val to = (0.6 * FS).toInt()
    val fundamental = SignalAnalysis.goertzelPower(samples, FS, 2100.0, from, to)
    val off = SignalAnalysis.goertzelPower(samples, FS, 1500.0, from, to)

    assertTrue("2100Hz component present", fundamental > 0)
    assertTrue("E(2100) $fundamental >= 10 × E(1500) $off", fundamental >= 10 * off)
  }

  // §8.2-6
  @Test
  fun decayIndependentOfSampleRate() {
    val out44 = struckRender(1.0, 1.0, 6.0, FS_44K)
    val out48 = struckRender(1.0, 1.0, 6.0, FS)
    val t44 = timeToMinus40dB(out44, FS_44K)
    val t48 = timeToMinus40dB(out48, FS)

    assertTrue("both rates produce sound", SignalAnalysis.peak(out44) > 0 && SignalAnalysis.peak(out48) > 0)
    assertTrue("t48 $t48 within render length", t48 > 0 && t48 < 6.0)
    assertTrue("t44 $t44 vs t48 $t48 within 10%", abs(t44 - t48) / t48 <= 0.1)
  }

  // §8.2-7
  @Test
  fun rapidStrikesNeverClip() {
    val synth = ModalBellSynth(FS)
    val chunk = FloatArray(FS / 100)
    var maxAbs = 0.0

    repeat(20) {
      synth.strike(1.0, 1.0)
      synth.render(chunk)
      maxAbs = maxOf(maxAbs, SignalAnalysis.peak(chunk))
    }

    maxAbs = maxOf(maxAbs, SignalAnalysis.peak(render(synth, 1.0)))

    assertTrue("rapid strikes produce sound", maxAbs > 0)
    assertTrue("max |y| $maxAbs < 1", maxAbs < 1.0)
  }

  // §8.2-8
  @Test
  fun deterministicOutput() {
    val renderSequence = {
      val synth = ModalBellSynth(FS)
      val first = struckChunk(synth, 0.8, 0.6)
      val second = struckChunk(synth, 1.0, 1.0)

      first + second + render(synth, 0.5)
    }

    val first = renderSequence()

    assertTrue("sequence produces sound", SignalAnalysis.peak(first) > 0)
    assertArrayEquals(first, renderSequence(), 0f)
  }

  @Test
  fun renderRespectsOffsetAndFrameCount() {
    val synth = ModalBellSynth(FS)
    val buffer = FloatArray(400) { SENTINEL }

    synth.strike(1.0, 1.0)
    synth.render(buffer, 100, 200)

    assertTrue("prefix untouched", (0 until 100).all { buffer[it] == SENTINEL })
    assertTrue("suffix untouched", (300 until 400).all { buffer[it] == SENTINEL })
    assertTrue("rendered region has signal", (100 until 300).any { buffer[it] != SENTINEL && buffer[it] != 0f })
    assertEquals(SENTINEL, buffer[399])
  }

  /**
   * Output difference between a synth struck again with [loudness] and an identical synth not struck again,
   * over the first [frames] after the second strike (100ms after the first L=1 strike).
   */
  private fun secondStrikeContribution(loudness: Double, frames: Int): FloatArray {
    val struck = ModalBellSynth(FS)
    val reference = ModalBellSynth(FS)
    val withStrike = FloatArray(frames)
    val without = FloatArray(frames)

    struck.strike(1.0, 1.0)
    reference.strike(1.0, 1.0)
    render(struck, 0.1)
    render(reference, 0.1)
    struck.strike(loudness, 1.0)
    struck.render(withStrike)
    reference.render(without)

    return FloatArray(frames) { withStrike[it] - without[it] }
  }

  // §5.2: a finished click leaves no amplitude behind, so the next click starts at 0.3·L.
  @Test
  fun clickAmplitudeDoesNotCarryOver() {
    val frames = FS / 1000
    val tinyLoudness = 0.001
    val tiny = SignalAnalysis.peak(secondStrikeContribution(tinyLoudness, frames))
    val tinyBound = tinyLoudness * (0.3 + 0.36 * 2.35) * 1.1

    assertTrue("tiny second strike contribution $tiny <= $tinyBound", tiny <= tinyBound)

    val second = SignalAnalysis.peak(secondStrikeContribution(1.0, frames))
    val fresh = SignalAnalysis.peak(struckRender(1.0, 1.0, 0.001))

    assertTrue("second strike peak $second ≈ fresh strike peak $fresh", abs(second - fresh) <= 0.1)
  }

  // §5.2
  @Test
  fun strikeDuringClickNeverClips() {
    val synth = ModalBellSynth(FS)
    val first = FloatArray((0.002 * FS).toInt())

    synth.strike(1.0, 1.0)
    synth.render(first)
    synth.strike(1.0, 1.0)

    val maxAbs = maxOf(SignalAnalysis.peak(first), SignalAnalysis.peak(render(synth, 1.0)))

    assertTrue("produces sound", maxAbs > 0)
    assertTrue("max |y| $maxAbs < 1", maxAbs < 1.0)
  }

  // §5.2
  @Test
  fun pendingOverflowDropsNewStrikes() {
    val renderAfter = { count: Int ->
      val synth = ModalBellSynth(FS)

      repeat(count) { synth.strike(0.01, 1.0) }

      render(synth, 0.2)
    }
    val overflowed = renderAfter(100)

    assertArrayEquals(renderAfter(64), overflowed, 0f)
    assertFalse("64 strikes != 63 strikes", overflowed.contentEquals(renderAfter(63)))
  }

  // §5.2
  @Test
  fun nonFiniteStrikeIsIgnored() {
    val synth = ModalBellSynth(FS)
    val buffer = FloatArray(FS / 100) { 0.5f }

    synth.strike(Double.NaN, 1.0)
    synth.strike(1.0, Double.NaN)
    synth.strike(Double.POSITIVE_INFINITY, 1.0)
    synth.strike(1.0, Double.NEGATIVE_INFINITY)

    assertTrue("silent after non-finite strikes", synth.isSilent)

    synth.render(buffer)

    assertTrue("all zeros", buffer.all { it == 0f })
    assertTrue("still silent", synth.isSilent)
  }

  // §5.2
  @Test
  fun strikeInputIsClamped() {
    val negative = struckRender(-1.0, 1.0, 0.05)

    assertTrue("negative loudness → silence", negative.all { it == 0f })
    assertArrayEquals(struckRender(1.0, 1.0, 0.1), struckRender(1.0, 5.0, 0.1), 0f)
    assertArrayEquals(struckRender(1.0, 0.0, 0.1), struckRender(1.0, -3.0, 0.1), 0f)
  }

  private fun struckChunk(synth: ModalBellSynth, loudness: Double, brightness: Double): FloatArray {
    synth.strike(loudness, brightness)

    return render(synth, 0.1)
  }

  companion object {
    private const val FS = 48_000
    private const val FS_44K = 44_100
    private const val SILENCE_RENDER_SECONDS = 10.0
    private const val SENTINEL = 7f
  }
}
