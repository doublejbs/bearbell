package expo.modules.bearbellengine

import android.content.Context
import android.media.AudioAttributes
import android.media.SoundPool

/**
 * Bell playback via a lazily created, process-wide SoundPool.
 *
 * The pool is intentionally never released: it lives for the whole process so that
 * ringOnce() and the service can ring instantly without reloading the sample.
 */
internal object BellPlayer {
  private const val MAX_STREAMS = 4
  private const val LOAD_PRIORITY = 1
  private const val PLAY_PRIORITY = 1
  private const val NO_LOOP = 0
  private const val NORMAL_RATE = 1f
  private const val LOAD_SUCCESS = 0

  private val lock = Any()
  private var soundPool: SoundPool? = null
  private var soundId = 0
  private var isLoaded = false
  private var pendingVolume: Float? = null

  fun play(context: Context, volume: Float) {
    val v = volume.coerceIn(0f, 1f)

    synchronized(lock) {
      val pool = soundPool ?: createPool(context.applicationContext)

      if (isLoaded) {
        pool.play(soundId, v, v, PLAY_PRIORITY, NO_LOOP, NORMAL_RATE)
      } else {
        // 로드 전 요청은 한 번만 기억했다가 로드 완료 시 재생
        pendingVolume = v
      }
    }
  }

  private fun createPool(appContext: Context): SoundPool {
    val attributes = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_MEDIA)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()
    val pool = SoundPool.Builder()
      .setMaxStreams(MAX_STREAMS)
      .setAudioAttributes(attributes)
      .build()

    pool.setOnLoadCompleteListener { loadedPool, sampleId, status ->
      synchronized(lock) {
        if (status != LOAD_SUCCESS || sampleId != soundId) {
          pendingVolume = null

          return@synchronized
        }

        isLoaded = true

        val pending = pendingVolume

        pendingVolume = null

        if (pending != null) {
          loadedPool.play(sampleId, pending, pending, PLAY_PRIORITY, NO_LOOP, NORMAL_RATE)
        }
      }
    }

    soundPool = pool
    soundId = pool.load(appContext, R.raw.bearbell_bell, LOAD_PRIORITY)

    return pool
  }
}
