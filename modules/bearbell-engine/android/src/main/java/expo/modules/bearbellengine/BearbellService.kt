package expo.modules.bearbellengine

import android.annotation.SuppressLint
import android.app.ForegroundServiceStartNotAllowedException
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.content.res.Configuration
import android.graphics.drawable.Icon
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log

/** Foreground service that keeps shake detection alive in the background (Spec §4.2). */
class BearbellService : Service(), SensorEventListener {
  private val detector = ShakeDetector()
  private var sensorManager: SensorManager? = null
  private var isSensorRegistered = false
  private var wakeLock: PowerManager.WakeLock? = null
  private var isForeground = false
  private var stopSource = RunningChangeSource.APP

  override fun onCreate() {
    super.onCreate()

    if (!EngineState.isSensitivityLoaded) {
      EngineState.sensitivity = SensitivityStore.load(this)
      EngineState.isSensitivityLoaded = true
    }

    createNotificationChannel()
  }

  // START_NOT_STICKY: 엔진은 사용자만 켠다. 프로세스가 죽으면 조용히 재시작하지 않는다 (Spec §1.6)
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val action = intent?.action

    if (action == ACTION_STOP || action == ACTION_STOP_FROM_NOTIFICATION) {
      val isFromNotification = action == ACTION_STOP_FROM_NOTIFICATION

      // startForegroundService 계약상 정지 전에 한 번은 startForeground를 호출해야 한다
      if (!isForeground) {
        enterForeground()
      }

      if (isFromNotification && EngineState.isRunning) {
        stopSource = RunningChangeSource.NOTIFICATION
        postOffNotification()
      } else {
        stopSource = RunningChangeSource.APP
        cancelOffNotification(this)
      }

      stopSelf()

      return START_NOT_STICKY
    }

    val isStartFromNotification = action == ACTION_START_FROM_NOTIFICATION

    // 알림 '켜기'는 모듈을 거치지 않으므로 여기서 표시해 승격 전 앱의 stop()이 무시되지 않게 한다
    if (isStartFromNotification) {
      if (!EngineState.isSensitivityLoaded) {
        EngineState.sensitivity = SensitivityStore.load(this)
        EngineState.isSensitivityLoaded = true
      }

      EngineState.isStartRequested = true
    }

    val startSource = if (isStartFromNotification) {
      RunningChangeSource.NOTIFICATION
    } else {
      RunningChangeSource.APP
    }

    if (!enterForeground()) {
      stopSelf()

      return START_NOT_STICKY
    }

    cancelOffNotification(this)
    registerSensor()
    acquireWakeLock()
    EngineState.updateRunning(true, startSource)

    return START_NOT_STICKY
  }

  override fun onDestroy() {
    sensorManager?.unregisterListener(this)
    isSensorRegistered = false

    wakeLock?.let {
      if (it.isHeld) {
        it.release()
      }
    }

    wakeLock = null
    EngineState.isStartRequested = false
    EngineState.updateRunning(false, stopSource)

    // 꺼짐 알림은 별도 ID라 REMOVE로 켜짐 알림만 지워지고 남는다
    if (isForeground) {
      stopForeground(STOP_FOREGROUND_REMOVE)
      isForeground = false
    }

    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onSensorChanged(event: SensorEvent) {
    if (event.sensor.type != Sensor.TYPE_ACCELEROMETER) {
      return
    }

    val volume = detector.process(
      event.values[0] / STANDARD_GRAVITY,
      event.values[1] / STANDARD_GRAVITY,
      event.values[2] / STANDARD_GRAVITY,
      SystemClock.elapsedRealtime(),
      EngineState.sensitivity,
    ) ?: return

    BellPlayer.play(this, volume)
  }

  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)

    createNotificationChannel()

    if (isForeground) {
      try {
        getSystemService(NotificationManager::class.java)?.notify(NOTIFICATION_ID, buildNotification())
      } catch (e: Exception) {
        Log.w(TAG, "failed to re-post notification on language change", e)
      }
    }
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }

    val channel = NotificationChannel(CHANNEL_ID, getString(R.string.bearbell_channel_name), NotificationManager.IMPORTANCE_LOW).apply {
      setShowBadge(false)
    }

    getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
  }

  private fun newNotificationBuilder(): Notification.Builder {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }
  }

  private fun buildNotification(): Notification {
    val builder = newNotificationBuilder()
      .setSmallIcon(R.drawable.bearbell_notification)
      .setContentTitle(getString(R.string.bearbell_running_title))
      .setContentText(getString(R.string.bearbell_running_text))
      .setOngoing(true)
      .setShowWhen(false)
      .addAction(buildAction(getString(R.string.bearbell_action_turn_off), buildStopPendingIntent()))

    buildContentIntent()?.let { builder.setContentIntent(it) }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
    }

    return builder.build()
  }

  private fun buildOffNotification(): Notification {
    val builder = newNotificationBuilder()
      .setSmallIcon(R.drawable.bearbell_notification)
      .setContentTitle(getString(R.string.bearbell_off_title))
      .setContentText(getString(R.string.bearbell_off_text))
      .setOngoing(false)
      .setAutoCancel(false)
      .setShowWhen(false)
      .addAction(buildAction(getString(R.string.bearbell_action_turn_on), buildStartPendingIntent()))

    buildContentIntent()?.let { builder.setContentIntent(it) }

    return builder.build()
  }

  private fun postOffNotification() {
    try {
      getSystemService(NotificationManager::class.java)?.notify(OFF_NOTIFICATION_ID, buildOffNotification())
    } catch (e: SecurityException) {
      // POST_NOTIFICATIONS 미허용 등: 꺼짐 알림 없이 정지만 진행
      Log.w(TAG, "failed to post off notification", e)
    }
  }

  private fun buildAction(label: String, intent: PendingIntent): Notification.Action {
    val icon = Icon.createWithResource(this, R.drawable.bearbell_notification)

    return Notification.Action.Builder(icon, label, intent).build()
  }

  private fun buildStopPendingIntent(): PendingIntent {
    val intent = Intent(this, BearbellService::class.java).setAction(ACTION_STOP_FROM_NOTIFICATION)

    // 이미 실행 중인 서비스에 전달하므로 일반 startService로 충분하다
    return PendingIntent.getService(this, STOP_REQUEST_CODE, intent, PENDING_INTENT_FLAGS)
  }

  private fun buildStartPendingIntent(): PendingIntent {
    val intent = Intent(this, BearbellService::class.java).setAction(ACTION_START_FROM_NOTIFICATION)

    // 알림 액션에서의 FGS 시작은 백그라운드 시작 제한의 예외다
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      PendingIntent.getForegroundService(this, START_REQUEST_CODE, intent, PENDING_INTENT_FLAGS)
    } else {
      PendingIntent.getService(this, START_REQUEST_CODE, intent, PENDING_INTENT_FLAGS)
    }
  }

  private fun buildContentIntent(): PendingIntent? {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName) ?: return null

    return PendingIntent.getActivity(this, CONTENT_REQUEST_CODE, launchIntent, PENDING_INTENT_FLAGS)
  }

  /** @return false when the system refused to promote the service to the foreground. */
  private fun enterForeground(): Boolean {
    val notification = buildNotification()

    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
    } catch (e: Exception) {
      val isRefused = e is SecurityException ||
        (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && e is ForegroundServiceStartNotAllowedException)

      if (!isRefused) {
        throw e
      }

      // e.g. background start restriction or missing FOREGROUND_SERVICE_MEDIA_PLAYBACK permission
      Log.w(TAG, "startForeground refused; stopping service", e)

      return false
    }

    isForeground = true

    return true
  }

  private fun registerSensor() {
    if (isSensorRegistered) {
      return
    }

    val manager = sensorManager ?: (getSystemService(Context.SENSOR_SERVICE) as? SensorManager)?.also {
      sensorManager = it
    } ?: return
    val accelerometer = manager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) ?: return

    isSensorRegistered = manager.registerListener(this, accelerometer, SensorManager.SENSOR_DELAY_GAME)
  }

  // 가속도계는 non-wakeup 센서라 화면이 꺼지면 CPU 슬립 시 이벤트가 끊긴다.
  // 엔진이 켜져 있는 동안 계속 감지해야 하므로 타임아웃 없이 잡고, onDestroy에서 해제한다.
  @SuppressLint("WakelockTimeout")
  private fun acquireWakeLock() {
    if (wakeLock?.isHeld == true) {
      return
    }

    val powerManager = getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return

    wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, WAKE_LOCK_TAG).apply {
      setReferenceCounted(false)
      acquire()
    }
  }

  companion object {
    const val ACTION_STOP = "expo.modules.bearbellengine.action.STOP"
    const val ACTION_STOP_FROM_NOTIFICATION = "expo.modules.bearbellengine.action.STOP_FROM_NOTIFICATION"
    const val ACTION_START_FROM_NOTIFICATION = "expo.modules.bearbellengine.action.START_FROM_NOTIFICATION"
    private const val TAG = "BearbellService"
    private const val CHANNEL_ID = "bearbell_engine"
    private const val NOTIFICATION_ID = 0x0BEA
    private const val OFF_NOTIFICATION_ID = 0x0BEB
    private const val CONTENT_REQUEST_CODE = 0
    private const val STOP_REQUEST_CODE = 1
    private const val START_REQUEST_CODE = 2

    // FLAG_IMMUTABLE is API 23+, always available on minSdk 24
    private const val PENDING_INTENT_FLAGS = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    private const val WAKE_LOCK_TAG = "bearbell:engine"
    private const val STANDARD_GRAVITY = 9.80665f

    /** Removes the "off" notification left by the notification stop action, if any. */
    fun cancelOffNotification(context: Context) {
      context.getSystemService(NotificationManager::class.java)?.cancel(OFF_NOTIFICATION_ID)
    }
  }
}
