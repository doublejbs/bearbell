package expo.modules.bearbellengine

import org.junit.Assert.assertEquals
import org.junit.Test

class SensitivityStoreTest {
  @Test
  fun unknownRawValuesMapToMid() {
    assertEquals(ShakeSensitivity.MID, ShakeSensitivity.from("unknown"))
    assertEquals(ShakeSensitivity.MID, ShakeSensitivity.from(""))
    assertEquals(ShakeSensitivity.MID, ShakeSensitivity.from(null))
  }

  @Test
  fun validRawValuesRoundTrip() {
    assertEquals(ShakeSensitivity.HIGH, ShakeSensitivity.from("high"))
    assertEquals(ShakeSensitivity.MID, ShakeSensitivity.from("mid"))
    assertEquals(ShakeSensitivity.LOW, ShakeSensitivity.from("low"))
  }

  @Test
  fun rawPropertyMatchesEnumValues() {
    assertEquals("high", ShakeSensitivity.HIGH.raw)
    assertEquals("mid", ShakeSensitivity.MID.raw)
    assertEquals("low", ShakeSensitivity.LOW.raw)
  }

  @Test
  fun fromAndRawAreInverse() {
    listOf(ShakeSensitivity.HIGH, ShakeSensitivity.MID, ShakeSensitivity.LOW).forEach { sensitivity ->
      assertEquals(sensitivity, ShakeSensitivity.from(sensitivity.raw))
    }
  }
}
