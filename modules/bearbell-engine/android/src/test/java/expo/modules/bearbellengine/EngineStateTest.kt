package expo.modules.bearbellengine

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class EngineStateTest {
  private val events = mutableListOf<Pair<Boolean, RunningChangeSource>>()

  @Before
  fun setUp() {
    EngineState.onRunningChange = null
    EngineState.updateRunning(false, RunningChangeSource.APP)
    EngineState.onRunningChange = { isRunning, source -> events.add(isRunning to source) }
  }

  @After
  fun tearDown() {
    EngineState.onRunningChange = null
    EngineState.updateRunning(false, RunningChangeSource.APP)
  }

  @Test
  fun notifiesOnlyOnRealTransitions() {
    assertTrue(EngineState.updateRunning(true, RunningChangeSource.APP))
    assertFalse(EngineState.updateRunning(true, RunningChangeSource.APP))
    assertTrue(EngineState.updateRunning(false, RunningChangeSource.NOTIFICATION))
    assertFalse(EngineState.updateRunning(false, RunningChangeSource.APP))

    assertEquals(
      listOf(true to RunningChangeSource.APP, false to RunningChangeSource.NOTIFICATION),
      events,
    )
  }

  @Test
  fun updatesStateWithoutListener() {
    EngineState.onRunningChange = null

    assertTrue(EngineState.updateRunning(true, RunningChangeSource.NOTIFICATION))
    assertTrue(EngineState.isRunning)
    assertTrue(events.isEmpty())
  }

  @Test
  fun sourceRawValuesMatchJsEnum() {
    assertEquals("app", RunningChangeSource.APP.raw)
    assertEquals("liveActivity", RunningChangeSource.LIVE_ACTIVITY.raw)
    assertEquals("notification", RunningChangeSource.NOTIFICATION.raw)
    assertEquals("restore", RunningChangeSource.RESTORE.raw)
  }
}
