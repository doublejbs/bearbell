package expo.modules.bearbellengine

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sqrt

/** ModalBellSynth 테스트용 신호 분석 도우미. */
internal object SignalAnalysis {
  fun peak(samples: FloatArray, from: Int = 0, to: Int = samples.size): Double {
    var maxAbs = 0.0

    for (i in from until to) {
      maxAbs = maxOf(maxAbs, abs(samples[i].toDouble()))
    }

    return maxAbs
  }

  fun rms(samples: FloatArray, from: Int = 0, to: Int = samples.size): Double {
    if (to <= from) {
      return 0.0
    }

    var sum = 0.0

    for (i in from until to) {
      sum += samples[i].toDouble() * samples[i]
    }

    return sqrt(sum / (to - from))
  }

  fun zeroCrossings(samples: FloatArray, from: Int = 0, to: Int = samples.size): Int {
    var count = 0

    for (i in from + 1 until to) {
      if ((samples[i - 1] < 0f) != (samples[i] < 0f)) {
        count++
      }
    }

    return count
  }

  /** Goertzel 알고리즘으로 frequencyHz 성분의 에너지. */
  fun goertzelPower(samples: FloatArray, sampleRate: Int, frequencyHz: Double, from: Int, to: Int): Double {
    val coeff = 2 * cos(2 * PI * frequencyHz / sampleRate)
    var s1 = 0.0
    var s2 = 0.0

    for (i in from until to) {
      val s0 = samples[i] + coeff * s1 - s2

      s2 = s1
      s1 = s0
    }

    return s1 * s1 + s2 * s2 - coeff * s1 * s2
  }

  /** chunkFrames 단위로 렌더해 seconds 분량을 이어 붙인다 (실제 오디오 콜백과 유사). */
  fun renderSeconds(synth: ModalBellSynth, sampleRate: Int, seconds: Double, chunkFrames: Int = sampleRate / 100): FloatArray {
    val total = (seconds * sampleRate).toInt()
    val out = FloatArray(total)
    val chunk = FloatArray(chunkFrames)
    var pos = 0

    while (pos < total) {
      val n = minOf(chunkFrames, total - pos)

      synth.render(chunk, 0, n)
      chunk.copyInto(out, pos, 0, n)
      pos += n
    }

    return out
  }
}
