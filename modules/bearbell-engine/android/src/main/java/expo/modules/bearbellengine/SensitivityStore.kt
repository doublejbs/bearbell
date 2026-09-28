package expo.modules.bearbellengine

import android.content.Context

/** Persists shake sensitivity to SharedPreferences (Spec §12). */
internal object SensitivityStore {
  private const val PREFS_FILE = "bearbell_engine"
  private const val KEY_SENSITIVITY = "sensitivity"

  /**
   * Loads the last-saved sensitivity, or MID if missing/unknown.
   */
  fun load(context: Context): ShakeSensitivity {
    val prefs = context.applicationContext.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)
    val raw = prefs.getString(KEY_SENSITIVITY, null)

    return ShakeSensitivity.from(raw)
  }

  /**
   * Saves the sensitivity to SharedPreferences.
   */
  fun save(context: Context, sensitivity: ShakeSensitivity) {
    val prefs = context.applicationContext.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)

    prefs.edit().putString(KEY_SENSITIVITY, sensitivity.raw).apply()
  }
}
