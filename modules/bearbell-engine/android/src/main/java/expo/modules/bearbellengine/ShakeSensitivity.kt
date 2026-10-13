package expo.modules.bearbellengine

/** Shake sensitivity chosen in the UI; maps to clapper gap, min strike speed, damping ratio and restitution (Spec §3.3). */
enum class ShakeSensitivity(val raw: String) {
  HIGH("high"),
  MID("mid"),
  LOW("low");

  companion object {
    fun from(raw: String?): ShakeSensitivity = entries.firstOrNull { it.raw == raw } ?: MID
  }
}
