package expo.modules.bearbellengine

/** Mirrors the JS `RunningChangeSource` enum (Spec §2.0). */
enum class RunningChangeSource(val raw: String) {
  APP("app"),
  LIVE_ACTIVITY("liveActivity"),
  NOTIFICATION("notification"),
  RESTORE("restore"),
}
