package expo.modules.bearbellengine

/** Process-wide state shared between the module and the service. */
internal object EngineState {
  @Volatile
  var sensitivity: ShakeSensitivity = ShakeSensitivity.MID

  /** True once sensitivity has been loaded from disk (module or service). Prevents redundant loads. */
  @Volatile
  var isSensitivityLoaded: Boolean = false

  /** True once the service has entered the foreground; cleared in onDestroy. Update via [updateRunning]. */
  @Volatile
  var isRunning: Boolean = false
    private set

  /** True between a start request and service teardown, covering the window before onStartCommand runs. */
  @Volatile
  var isStartRequested: Boolean = false

  /** Process-wide listener wired by the module; invoked only on real isRunning transitions (Spec §2.0). */
  @Volatile
  var onRunningChange: ((Boolean, RunningChangeSource) -> Unit)? = null

  private val lock = Any()

  /**
   * Updates [isRunning] and notifies [onRunningChange] on a real transition.
   *
   * The listener is invoked outside the lock so it can't deadlock against callers re-entering
   * [EngineState]. Callers are expected on the main thread (service lifecycle callbacks), which
   * keeps notifications ordered.
   *
   * @return true when the value actually changed (and the listener was notified).
   */
  fun updateRunning(value: Boolean, source: RunningChangeSource): Boolean {
    synchronized(lock) {
      if (isRunning == value) {
        return false
      }

      isRunning = value
    }

    onRunningChange?.invoke(value, source)

    return true
  }
}
