package expo.modules.bearbellengine

import android.content.Context
import android.content.Intent
import android.os.Build
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class BearbellEngineModule : Module() {
  private var runningListener: ((Boolean, RunningChangeSource) -> Unit)? = null

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("BearbellEngine")

    Events(RUNNING_CHANGE_EVENT)

    OnCreate {
      // reactContext 가 아직 없으면 건너뛴다 — 모듈 생성 자체가 실패하면 안 되고, 서비스 onCreate 에서도 불러온다
      val reactContext = appContext.reactContext

      if (!EngineState.isSensitivityLoaded && reactContext != null) {
        EngineState.sensitivity = SensitivityStore.load(reactContext)
        EngineState.isSensitivityLoaded = true
      }

      val listener: (Boolean, RunningChangeSource) -> Unit = { isRunning, source ->
        sendRunningChange(isRunning, source)
      }

      runningListener = listener
      EngineState.onRunningChange = listener
    }

    // 마운트 시 엔진을 끄지 않으므로 JS가 구독을 시작하면 현재 상태를 1회 알려 준다 (Spec §1.6, §2.0)
    OnStartObserving(RUNNING_CHANGE_EVENT) {
      sendRunningChange(EngineState.isRunning, RunningChangeSource.RESTORE)
    }

    OnDestroy {
      // 다른 인스턴스(리로드 등)가 등록한 리스너는 건드리지 않는다
      if (EngineState.onRunningChange === runningListener) {
        EngineState.onRunningChange = null
      }

      runningListener = null
    }

    // 이미 실행 중이면 서비스 onStartCommand가 멱등하게 처리하고 감도만 갱신된다
    AsyncFunction("start") { sensitivity: String ->
      val intent = serviceIntent()

      EngineState.sensitivity = ShakeSensitivity.from(sensitivity)
      SensitivityStore.save(context, EngineState.sensitivity)

      EngineState.isStartRequested = true

      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(intent)
        } else {
          context.startService(intent)
        }
      } catch (e: Exception) {
        EngineState.isStartRequested = false

        throw e
      }

      Unit
    }

    // 실행 중이 아니면 아무것도 하지 않는다 (정지하려고 서비스를 새로 띄우지 않음)
    AsyncFunction("stop") {
      if (!EngineState.isRunning && !EngineState.isStartRequested) {
        // 앱에서 끄면 꺼짐 알림도 남기지 않는다 (Spec §4.1.1)
        BearbellService.cancelOffNotification(context)

        return@AsyncFunction Unit
      }

      val intent = serviceIntent().setAction(BearbellService.ACTION_STOP)

      try {
        context.startService(intent)
      } catch (e: IllegalStateException) {
        // 앱이 백그라운드라 startService가 거부되면 stopService로 대체
        context.stopService(serviceIntent())
      }

      Unit
    }

    Function("setSensitivity") { sensitivity: String ->
      EngineState.sensitivity = ShakeSensitivity.from(sensitivity)
      SensitivityStore.save(context, EngineState.sensitivity)
    }

    Function("ringOnce") {
      BellPlayer.play(context, 1f)
    }
  }

  private fun sendRunningChange(isRunning: Boolean, source: RunningChangeSource) {
    val payload = mapOf(
      "isRunning" to isRunning,
      "source" to source.raw,
      "sensitivity" to EngineState.sensitivity.raw,
    )

    sendEvent(RUNNING_CHANGE_EVENT, payload)
  }

  private fun serviceIntent(): Intent = Intent(context, BearbellService::class.java)

  companion object {
    private const val RUNNING_CHANGE_EVENT = "onRunningChange"
  }
}
