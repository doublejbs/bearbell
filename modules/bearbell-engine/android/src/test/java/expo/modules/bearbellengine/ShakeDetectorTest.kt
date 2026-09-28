package expo.modules.bearbellengine

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class ShakeDetectorTest {
  private fun magnitudeG(detector: ShakeDetector, g: Float, t: Long, s: ShakeSensitivity = ShakeSensitivity.MID) =
    detector.process(0f, 0f, g, t, s)

  @Test
  fun thresholdsMatchSpec() {
    assertEquals(0.55f, ShakeSensitivity.HIGH.thresholdG, 1e-6f)
    assertEquals(0.90f, ShakeSensitivity.MID.thresholdG, 1e-6f)
    assertEquals(1.40f, ShakeSensitivity.LOW.thresholdG, 1e-6f)
  }

  @Test
  fun belowThresholdReturnsNull() {
    val detector = ShakeDetector()

    assertNull(magnitudeG(detector, 1.0f, 0L))
    assertNull(magnitudeG(detector, 1.85f, 1_000L)) // dev 0.85 < 0.90
    assertNull(ShakeDetector().process(0f, 0f, 2.3f, 0L, ShakeSensitivity.LOW)) // dev 1.3 < 1.4
  }

  @Test
  fun aboveThresholdRings() {
    val detector = ShakeDetector()

    assertNotNull(magnitudeG(detector, 1.95f, 0L)) // dev 0.95
    assertNotNull(ShakeDetector().process(0f, 0f, 0.4f, 0L, ShakeSensitivity.HIGH)) // dev 0.6 (free fall side)
    assertNotNull(ShakeDetector().process(0f, 0f, 2.5f, 0L, ShakeSensitivity.LOW)) // dev 1.5
  }

  @Test
  fun cooldownOf300ms() {
    val detector = ShakeDetector()

    assertNotNull(magnitudeG(detector, 2.5f, 1_000L))
    assertNull(magnitudeG(detector, 2.5f, 1_299L))
    assertNotNull(magnitudeG(detector, 2.5f, 1_300L))
  }

  @Test
  fun volumeIsClamped() {
    val nearThreshold = ShakeDetector().process(0f, 0f, 1.91f, 0L, ShakeSensitivity.MID)!! // dev 0.91
    val huge = ShakeDetector().process(0f, 0f, 5f, 0L, ShakeSensitivity.MID)!!
    val double = ShakeDetector().process(0f, 0f, 2.1f, 0L, ShakeSensitivity.HIGH)!! // dev 1.1 = 2 × thr

    assertEquals(0.555f, nearThreshold, 1e-3f)
    assertEquals(true, nearThreshold >= 0.55f)
    assertEquals(1.0f, huge, 1e-6f)
    assertEquals(1.0f, double, 1e-4f)
    assertEquals(0.775f, ShakeDetector().process(0f, 0f, 1.825f, 0L, ShakeSensitivity.HIGH)!!, 1e-4f) // dev 0.825
  }

  @Test
  fun unknownSensitivityFallsBackToMid() {
    assertEquals(ShakeSensitivity.MID, ShakeSensitivity.from("xyz"))
    assertEquals(ShakeSensitivity.MID, ShakeSensitivity.from(null))
    assertEquals(ShakeSensitivity.HIGH, ShakeSensitivity.from("high"))
    assertEquals(ShakeSensitivity.LOW, ShakeSensitivity.from("low"))
  }
}
