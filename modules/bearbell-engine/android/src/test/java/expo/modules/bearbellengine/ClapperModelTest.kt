package expo.modules.bearbellengine

import kotlin.math.ceil
import kotlin.math.pow
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Spec §8.1 시나리오 + §3.4 세기 매핑. */
class ClapperModelTest {
  private fun runScenario(
    samples: List<AccelSample>,
    sensitivity: ShakeSensitivity = ShakeSensitivity.MID,
  ): List<ClapperStrike> = ClapperScenarios.run(ClapperModel(sensitivity), samples)

  // §8.1-1
  @Test
  fun stationaryInVariousPosturesProducesNoStrikes() {
    val postures = listOf(Vec3(0.0, 0.0, 1.0), Vec3(0.0, -1.0, 0.0), Vec3(0.6, 0.0, 0.8))

    for (gravity in postures) {
      val strikes = runScenario(ClapperScenarios.stationary(gravity, 5.0))

      assertEquals("posture $gravity", 0, strikes.size)
    }
  }

  // §8.1-2
  @Test
  fun slowTiltProducesNoStrikes() {
    val strikes = runScenario(ClapperScenarios.slowRotation())

    assertEquals(0, strikes.size)
  }

  // §8.1-3
  @Test
  fun singleStepImpulseRingsPromptlyAndSettles() {
    val start = ClapperScenarios.IMPULSE_START
    val end = start + ClapperScenarios.IMPULSE_DURATION
    val strikes = runScenario(ClapperScenarios.impulse(2.0))

    assertTrue("strike within 150ms: $strikes", strikes.any { it.timestamp - start in 0.0..0.15 })
    assertTrue("at most 6 strikes: ${strikes.size}", strikes.size <= 6)
    assertTrue("no strikes 1s after impulse end: $strikes", strikes.none { it.timestamp >= end + 1.0 })
    assertTrue("velocities >= vMin(mid): $strikes", strikes.all { it.velocity >= MID_V_MIN })
  }

  // §8.1-4
  @Test
  fun tinyImpulseProducesNoStrikes() {
    val strikes = runScenario(ClapperScenarios.impulse(0.05))

    assertEquals(0, strikes.size)
  }

  // §8.1-5
  @Test
  fun sensitivityOrdering() {
    for (peak in listOf(1.0, 1.5)) {
      val samples = ClapperScenarios.impulse(peak)
      val highModel = ClapperModel()

      highModel.sensitivity = ShakeSensitivity.HIGH

      val high = ClapperScenarios.run(highModel, samples).size
      val mid = runScenario(samples, ShakeSensitivity.MID).size
      val low = runScenario(samples, ShakeSensitivity.LOW).size

      if (peak == 1.0) {
        assertTrue("high rings at 1.0g", high >= 1)
        assertEquals("low silent at 1.0g", 0, low)
      }

      assertTrue("peak $peak: high($high) >= mid($mid) >= low($low)", high >= mid && mid >= low)
    }
  }

  // §8.1-6
  @Test
  fun strongerImpulseHitsHarder() {
    val strong = runScenario(ClapperScenarios.impulse(3.0))
    val weak = runScenario(ClapperScenarios.impulse(2.0))

    assertTrue("3.0g rings", strong.isNotEmpty())
    assertTrue("2.0g rings", weak.isNotEmpty())
    assertTrue("${strong.first()} > ${weak.first()}", strong.first().velocity > weak.first().velocity)
  }

  // §8.1-7
  @Test
  fun strikesAreAtLeast20msApart() {
    val strikes = runScenario(ClapperScenarios.sineShake(5.0, 2.0, 3.0))

    assertTrue("shake rings", strikes.size >= 2)

    strikes.zipWithNext().forEach { (a, b) ->
      assertTrue("gap ${b.timestamp - a.timestamp}", b.timestamp - a.timestamp >= MIN_STRIKE_GAP - 1e-9)
    }
  }

  // §8.1-8
  @Test
  fun walkingRingsOnMostSteps() {
    val input = ClapperScenarios.walking(verticalG = 1.6, horizontalG = 0.6)
    val strikes = runScenario(input.samples)
    val stepsWithStrike = input.stepStarts.count { step ->
      strikes.any { it.timestamp - step in 0.0..0.2 }
    }
    val required = ceil(input.stepStarts.size * 0.8).toInt()

    assertEquals(18, input.stepStarts.size)
    assertTrue("strike count ${strikes.size} in 18..90", strikes.size in 18..90)
    assertTrue("steps with strike $stepsWithStrike >= $required", stepsWithStrike >= required)
  }

  // §8.1-9
  @Test
  fun sensorGapReinitializesWithoutStrike() {
    val before = ClapperScenarios.stationary(Vec3.UNIT_Z, 1.0)
    val resumeAt = before.last().timestamp + 2.0
    val after = ClapperScenarios.stationary(Vec3(0.0, -1.0, 0.0), 2.0, resumeAt)
    val strikes = runScenario(before + after)

    assertEquals(0, strikes.size)
  }

  // §8.1-10
  @Test
  fun deterministicAndResettable() {
    val walking = ClapperScenarios.walking(verticalG = 1.6, horizontalG = 0.6).samples
    val first = runScenario(walking)
    val second = runScenario(walking)

    assertTrue(first.isNotEmpty())
    assertEquals(first, second)

    val reused = ClapperModel()

    ClapperScenarios.run(reused, ClapperScenarios.sineShake(5.0, 2.0, 1.0))
    reused.reset()

    assertEquals(first, ClapperScenarios.run(reused, walking))
  }

  /** Strikes per step for an 18-step walk with the given vertical/forward impulse peaks. */
  private fun strikesPerStep(verticalG: Double, horizontalG: Double, sensitivity: ShakeSensitivity): Double {
    val input = ClapperScenarios.walking(verticalG = verticalG, horizontalG = horizontalG)

    assertEquals(18, input.stepStarts.size)

    return runScenario(input.samples, sensitivity).size.toDouble() / input.stepStarts.size
  }

  private fun perSensitivity(verticalG: Double, horizontalG: Double): Map<ShakeSensitivity, Double> =
    ShakeSensitivity.entries.associateWith { strikesPerStep(verticalG, horizontalG, it) }

  // §8.1-11
  @Test
  fun sensitivitiesFeelDistinct() {
    val gentle = perSensitivity(0.8, 0.3)
    val normal = perSensitivity(1.6, 0.6)
    val strong = perSensitivity(2.0, 0.7)
    val vigorousLow = strikesPerStep(2.6, 0.9, ShakeSensitivity.LOW)

    assertTrue("gentle high $gentle", gentle.getValue(ShakeSensitivity.HIGH) >= 0.7)
    assertTrue("gentle mid $gentle", gentle.getValue(ShakeSensitivity.MID) == 0.0)
    assertTrue("gentle low $gentle", gentle.getValue(ShakeSensitivity.LOW) == 0.0)
    assertTrue("normal high $normal", normal.getValue(ShakeSensitivity.HIGH) >= 1.5)
    assertTrue("normal mid $normal", normal.getValue(ShakeSensitivity.MID) in 0.7..1.5)
    assertTrue("normal low $normal", normal.getValue(ShakeSensitivity.LOW) == 0.0)
    assertTrue("strong high $strong", strong.getValue(ShakeSensitivity.HIGH) >= 1.5)
    assertTrue("strong mid $strong", strong.getValue(ShakeSensitivity.MID) in 0.7..1.5)
    assertTrue("strong low $strong", strong.getValue(ShakeSensitivity.LOW) >= 0.7)
    assertTrue("vigorous low $vigorousLow", vigorousLow >= 0.7)
  }

  // §3.1
  @Test
  fun nonFiniteSampleIsIgnored() {
    val walking = ClapperScenarios.walking(verticalG = 1.6, horizontalG = 0.6).samples
    val expected = runScenario(walking)
    val corrupted = ArrayList<AccelSample>()

    walking.forEachIndexed { index, sample ->
      corrupted.add(sample)

      if (index == 300) {
        corrupted.add(AccelSample(sample.timestamp + 0.005, Vec3(Double.NaN, 0.0, 1.0)))
        corrupted.add(AccelSample(sample.timestamp + 0.005, Vec3(0.0, Double.POSITIVE_INFINITY, 1.0)))
        corrupted.add(AccelSample(Double.NaN, Vec3(3.0, 3.0, 3.0)))
      }
    }

    assertTrue("walking rings", expected.isNotEmpty())
    assertEquals(expected, runScenario(corrupted))
  }

  // §3.1
  @Test
  fun duplicateAndSmallBackwardTimestampsAreIgnored() {
    val walking = ClapperScenarios.walking(verticalG = 1.6, horizontalG = 0.6).samples
    val expected = runScenario(walking)
    val noisy = ArrayList<AccelSample>()

    walking.forEachIndexed { index, sample ->
      noisy.add(sample)
      noisy.add(AccelSample(sample.timestamp, sample.accel * 3.0))

      if (index % 50 == 0) {
        noisy.add(AccelSample(sample.timestamp - 0.2, Vec3(5.0, 5.0, 5.0)))
      }
    }

    assertEquals(expected, runScenario(noisy))
  }

  // §3.1
  @Test
  fun backwardClockJumpReinitializes() {
    val before = ClapperScenarios.impulse(2.0, gravity = Vec3(0.0, -1.0, 0.0))
    val offset = before.last().timestamp - 10.0
    val after = ClapperScenarios.impulse(2.0).map { AccelSample(it.timestamp + offset, it.accel) }
    val impulseAt = offset + ClapperScenarios.IMPULSE_START
    val beforeStrikes = runScenario(before)
    val afterJump = runScenario(before + after).filter { it.timestamp < before.first().timestamp }

    assertTrue("rings before the jump", beforeStrikes.isNotEmpty())
    assertTrue("no strikes before the new impulse: $afterJump", afterJump.none { it.timestamp < impulseAt })
    assertTrue("impulse after jump rings: $afterJump", afterJump.any { it.timestamp - impulseAt in 0.0..0.15 })
  }

  // §3.3
  @Test
  fun sensitivityChangeDuringShakeIsSafe() {
    val samples = ClapperScenarios.sineShake(5.0, 2.0, 3.0)
    val switchIndex = 150
    val switchAt = samples[switchIndex].timestamp
    val cases = listOf(
      ShakeSensitivity.HIGH to ShakeSensitivity.LOW,
      ShakeSensitivity.LOW to ShakeSensitivity.HIGH,
    )

    for ((from, to) in cases) {
      val model = ClapperModel(from)
      val strikes = ArrayList<ClapperStrike>()

      samples.forEachIndexed { index, sample ->
        if (index == switchIndex) {
          model.sensitivity = to
        }

        strikes += model.process(sample.accel.x, sample.accel.y, sample.accel.z, sample.timestamp)
      }

      assertTrue("$from→$to rings: ${strikes.size}", strikes.size >= 2)
      assertTrue("$from→$to finite: $strikes", strikes.all { it.timestamp.isFinite() && it.velocity.isFinite() })

      strikes.zipWithNext().forEach { (a, b) ->
        assertTrue("$from→$to gap ${b.timestamp - a.timestamp}", b.timestamp - a.timestamp >= MIN_STRIKE_GAP - 1e-9)
      }

      if (ClapperModel.gapOf(to) > ClapperModel.gapOf(from)) {
        val early = strikes.filter { it.timestamp > switchAt - 0.01 && it.timestamp <= switchAt + 0.005 }

        assertTrue("$from→$to larger gap creates no strike: $early", early.isEmpty())
      }
    }
  }

  // §3.3
  @Test
  fun sensitivityChangeAtRestCreatesNoStrike() {
    val samples = ClapperScenarios.stationary(Vec3.UNIT_Z, 2.0)
    val model = ClapperModel(ShakeSensitivity.LOW)
    val strikes = ArrayList<ClapperStrike>()

    samples.forEachIndexed { index, sample ->
      if (index == 100) {
        model.sensitivity = ShakeSensitivity.HIGH
      }

      strikes += model.process(sample.accel.x, sample.accel.y, sample.accel.z, sample.timestamp)
    }

    assertEquals(0, strikes.size)
  }

  // §3.3 table: gap (m), vMin (m/s), ζ, e
  @Test
  fun sensitivityTableMatchesSpec() {
    val table = mapOf(
      ShakeSensitivity.HIGH to doubleArrayOf(0.009, 0.15, 0.20, 0.3),
      ShakeSensitivity.MID to doubleArrayOf(0.013, 0.22, 0.30, 0.2),
      ShakeSensitivity.LOW to doubleArrayOf(0.017, 0.30, 0.40, 0.15),
    )

    for ((sensitivity, row) in table) {
      assertEquals("$sensitivity gap", row[0], ClapperModel.gapOf(sensitivity), 1e-9)
      assertEquals("$sensitivity vMin", row[1], ClapperModel.minVelocityOf(sensitivity), 1e-9)
      assertEquals("$sensitivity ζ", row[2], ClapperModel.dampingRatioOf(sensitivity), 1e-9)
      assertEquals("$sensitivity e", row[3], ClapperModel.restitutionOf(sensitivity), 1e-9)
    }
  }

  // §3.4
  @Test
  fun loudnessAtVMinIsFloor() {
    val cases = mapOf(
      ShakeSensitivity.HIGH to HIGH_V_MIN,
      ShakeSensitivity.MID to MID_V_MIN,
      ShakeSensitivity.LOW to LOW_V_MIN,
    )

    for ((sensitivity, vMin) in cases) {
      val (loudness, brightness) = ClapperModel.loudness(vMin, sensitivity)

      assertEquals("$sensitivity loudness", 0.12, loudness, 1e-9)
      assertEquals("$sensitivity brightness", 0.0, brightness, 1e-9)
    }
  }

  @Test
  fun loudnessAtVRefIsFull() {
    val (loudness, brightness) = ClapperModel.loudness(V_REF, ShakeSensitivity.MID)

    assertEquals(1.0, loudness, 1e-9)
    assertEquals(1.0, brightness, 1e-9)
  }

  @Test
  fun loudnessMidpointFollowsCurve() {
    val v = MID_V_MIN + 0.5 * (V_REF - MID_V_MIN)
    val (loudness, brightness) = ClapperModel.loudness(v, ShakeSensitivity.MID)

    assertEquals(0.12 + 0.88 * 0.5.pow(0.8), loudness, 1e-9)
    assertEquals(0.5, brightness, 1e-9)
  }

  @Test
  fun loudnessIsClamped() {
    val (lowLoudness, lowBrightness) = ClapperModel.loudness(0.0, ShakeSensitivity.MID)
    val (highLoudness, highBrightness) = ClapperModel.loudness(5.0, ShakeSensitivity.MID)

    assertEquals(0.12, lowLoudness, 1e-9)
    assertEquals(0.0, lowBrightness, 1e-9)
    assertEquals(1.0, highLoudness, 1e-9)
    assertEquals(1.0, highBrightness, 1e-9)
  }

  @Test
  fun loudnessOfNaNIsFloor() {
    val (loudness, brightness) = ClapperModel.loudness(Double.NaN, ShakeSensitivity.MID)

    assertEquals(0.12, loudness, 1e-9)
    assertEquals(0.0, brightness, 1e-9)
  }

  companion object {
    private const val HIGH_V_MIN = 0.15
    private const val MID_V_MIN = 0.22
    private const val LOW_V_MIN = 0.30
    private const val V_REF = 0.6
    private const val MIN_STRIKE_GAP = 0.02
  }
}
