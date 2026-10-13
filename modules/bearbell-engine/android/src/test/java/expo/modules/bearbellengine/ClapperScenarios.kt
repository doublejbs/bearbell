package expo.modules.bearbellengine

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin

/** 3축 벡터 (g 단위). */
internal data class Vec3(val x: Double, val y: Double, val z: Double) {
  operator fun plus(other: Vec3) = Vec3(x + other.x, y + other.y, z + other.z)

  operator fun times(k: Double) = Vec3(x * k, y * k, z * k)

  companion object {
    val ZERO = Vec3(0.0, 0.0, 0.0)
    val UNIT_X = Vec3(1.0, 0.0, 0.0)
    val UNIT_Z = Vec3(0.0, 0.0, 1.0)
  }
}

/** 가속도계 샘플 하나 (초, g, 중력 포함). */
internal data class AccelSample(val timestamp: Double, val accel: Vec3)

/** 반파 사인 펄스: [start, start + duration] 동안 peak × sin(π·u). */
internal data class HalfSinePulse(val start: Double, val duration: Double, val peak: Vec3)

/** 걷기 입력과 각 걸음의 시작 시각. */
internal data class WalkingInput(val samples: List<AccelSample>, val stepStarts: List<Double>)

/** Spec §8.1 시나리오용 100Hz 합성 가속도 생성기. */
internal object ClapperScenarios {
  const val SAMPLE_INTERVAL = 0.01
  const val IMPULSE_DURATION = 0.08
  const val IMPULSE_START = 0.5

  /** 범용 생성기: 시각별 중력 + 반파 사인 펄스 합. */
  fun generate(
    durationSec: Double,
    startTime: Double = 0.0,
    pulses: List<HalfSinePulse> = emptyList(),
    gravityAt: (Double) -> Vec3 = { Vec3.UNIT_Z },
  ): List<AccelSample> {
    val count = (durationSec / SAMPLE_INTERVAL).roundToInt()

    return List(count) { i ->
      val t = startTime + i * SAMPLE_INTERVAL
      var accel = gravityAt(t)

      for (pulse in pulses) {
        val u = (t - pulse.start) / pulse.duration

        if (u in 0.0..1.0) {
          accel += pulse.peak * sin(PI * u)
        }
      }

      AccelSample(t, accel)
    }
  }

  fun stationary(gravity: Vec3, durationSec: Double, startTime: Double = 0.0): List<AccelSample> =
    generate(durationSec, startTime) { gravity }

  /** 정지 상태에서 IMPULSE_START에 80ms 반파 사인 임펄스 (최대 peakG). */
  fun impulse(
    peakG: Double,
    axis: Vec3 = Vec3.UNIT_X,
    totalDuration: Double = 4.0,
    gravity: Vec3 = Vec3.UNIT_Z,
  ): List<AccelSample> {
    val pulse = HalfSinePulse(IMPULSE_START, IMPULSE_DURATION, axis * peakG)

    return generate(totalDuration, pulses = listOf(pulse)) { gravity }
  }

  /** 정지 restBefore → durationSec 동안 중력 방향 90° 회전 (ease-in-out) → 정지 restAfter. */
  fun slowRotation(durationSec: Double = 4.0, restBefore: Double = 1.0, restAfter: Double = 2.0): List<AccelSample> =
    generate(restBefore + durationSec + restAfter) { t ->
      val u = ((t - restBefore) / durationSec).coerceIn(0.0, 1.0)
      val theta = (PI / 2) * (1 - cos(PI * u)) / 2

      Vec3(sin(theta), 0.0, cos(theta))
    }

  /** 중력 + axis 방향 사인 흔들기. */
  fun sineShake(
    frequencyHz: Double,
    amplitudeG: Double,
    durationSec: Double,
    axis: Vec3 = Vec3.UNIT_X,
    gravity: Vec3 = Vec3.UNIT_Z,
  ): List<AccelSample> =
    generate(durationSec) { t -> gravity + axis * (amplitudeG * sin(2 * PI * frequencyHz * t)) }

  /** stepHz 걸음: 걸음마다 수직(z) verticalG·수평(x) horizontalG 반파 사인 임펄스. */
  fun walking(
    stepHz: Double = 1.8,
    verticalG: Double = 1.6,
    horizontalG: Double = 0.6,
    impulseDuration: Double = 0.1,
    walkDuration: Double = 10.0,
    leadIn: Double = 0.5,
    tail: Double = 1.0,
  ): WalkingInput {
    val stepStarts = generateSequence(0) { it + 1 }
      .map { leadIn + it / stepHz }
      .takeWhile { it < leadIn + walkDuration }
      .toList()

    val peak = Vec3(horizontalG, 0.0, verticalG)
    val pulses = stepStarts.map { HalfSinePulse(it, impulseDuration, peak) }
    val samples = generate(leadIn + walkDuration + tail, pulses = pulses) { Vec3.UNIT_Z }

    return WalkingInput(samples, stepStarts)
  }

  fun run(model: ClapperModel, samples: List<AccelSample>): List<ClapperStrike> =
    samples.flatMap { model.process(it.accel.x, it.accel.y, it.accel.z, it.timestamp) }
}
