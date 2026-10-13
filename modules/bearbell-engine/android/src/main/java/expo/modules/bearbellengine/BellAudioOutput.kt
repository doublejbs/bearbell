package expo.modules.bearbellengine

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.os.Build
import android.os.Process
import android.util.Log
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

/**
 * Process-wide streaming bell output (Spec §4.2): one [ModalBellSynth] rendered into a low-latency
 * float [AudioTrack] by a dedicated audio thread. Shared by the service (sensor thread) and ringOnce
 * (JS thread); [strike] is safe from any thread.
 *
 * Lifecycle:
 * - The track and thread are created lazily on the first strike.
 * - After [SILENCE_PAUSE_SECONDS] of silence the track is pause()+flush()ed and the thread parks on
 *   a condition until the next strike, which play()s and renders immediately.
 * - The paused track is deliberately kept rather than released after a longer idle: a paused track
 *   holds no active output (AudioFlinger puts the output in standby on its own), so releasing would
 *   save little power while adding track-creation latency to the first strike after a pause.
 *   The track is released and recreated (with a fresh synth) only after a creation/write error.
 */
internal object BellAudioOutput {
  private const val TAG = "BellAudioOutput"
  private const val THREAD_NAME = "bearbell-audio"
  private const val CHUNK_SECONDS = 0.005
  private const val SILENCE_PAUSE_SECONDS = 1.5
  private const val BUFFER_MULTIPLIER = 2
  private const val FALLBACK_SAMPLE_RATE = 48_000
  private const val FALLBACK_BUFFER_CHUNKS = 4

  private val lock = ReentrantLock()
  private val wake = lock.newCondition()

  // Written under [lock]; volatile so [strike] can skip the sample-rate query without locking
  @Volatile private var synth: ModalBellSynth? = null

  // Guarded by [lock]
  private var thread: Thread? = null
  private var isWakeRequested = false

  /** Queues a strike (Spec §3.4 loudness/brightness) and wakes the audio thread. */
  fun strike(loudness: Double, brightness: Double) {
    var candidate: ModalBellSynth? = null

    while (true) {
      // Sample-rate binder call and synth allocation stay outside the lock
      if (synth == null && candidate == null) {
        candidate = ModalBellSynth(nativeSampleRate())
      }

      lock.withLock {
        val current = synth ?: candidate?.also { synth = it }

        // Synth was discarded between the check and the lock; build one and retry
        if (current == null) {
          return@withLock
        }

        current.strike(loudness, brightness)
        isWakeRequested = true

        if (thread?.isAlive != true) {
          thread = Thread(::runAudioLoop, THREAD_NAME).apply {
            isDaemon = true
            start()
          }
        }

        wake.signal()

        return
      }
    }
  }

  private fun nativeSampleRate(): Int {
    val rate = AudioTrack.getNativeOutputSampleRate(AudioManager.STREAM_MUSIC)

    return if (rate > 0) rate else FALLBACK_SAMPLE_RATE
  }

  /** Blocks until a strike arrives on a live synth, then returns that synth to render. */
  private fun awaitStrike(): ModalBellSynth {
    lock.withLock {
      while (true) {
        val current = synth

        if (isWakeRequested && current != null) {
          isWakeRequested = false

          return current
        }

        wake.await()
      }
    }
  }

  /**
   * Called after [SILENCE_PAUSE_SECONDS] of silence. Returns true when the loop should pause.
   * Checked under [lock]: [strike] queues into the synth before raising the flag, so a silent synth
   * here means every flagged strike was already rendered, and any later strike wakes the parked thread.
   */
  private fun shouldPause(synth: ModalBellSynth): Boolean {
    lock.withLock {
      if (!synth.isSilent) {
        return false
      }

      isWakeRequested = false

      return true
    }
  }

  /**
   * Drops the synth (and its pending/ringing state) so the next strike starts on a fresh one.
   * The wake flag belongs to the dropped synth's strikes, so it is cleared with it.
   */
  private fun discardSynth(failed: ModalBellSynth?) {
    lock.withLock {
      if (failed != null && synth === failed) {
        synth = null
        isWakeRequested = false
      }
    }
  }

  private fun runAudioLoop() {
    Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_AUDIO)

    var track: AudioTrack? = null
    var buffer = FloatArray(0)

    // The thread must never die: any unexpected failure drops the track and synth and waits again
    while (true) {
      var current: ModalBellSynth? = null

      try {
        val synth = awaitStrike()

        current = synth

        val active = track?.takeIf { it.sampleRate == synth.sampleRate } ?: run {
          track?.release()
          track = null
          createTrack(synth.sampleRate)
        }

        if (active == null) {
          discardSynth(synth)

          continue
        }

        track = active

        val chunkFrames = (synth.sampleRate * CHUNK_SECONDS).toInt().coerceAtLeast(1)

        if (buffer.size != chunkFrames) {
          buffer = FloatArray(chunkFrames)
        }

        if (!renderUntilSilent(active, synth, buffer)) {
          active.release()
          track = null
          discardSynth(synth)
        }
      } catch (e: RuntimeException) {
        Log.w(TAG, "audio loop failed; recreating on next strike", e)

        try {
          track?.release()
        } catch (releaseError: RuntimeException) {
          Log.w(TAG, "failed to release AudioTrack", releaseError)
        }

        track = null
        discardSynth(current)
      }
    }
  }

  /** Plays until [SILENCE_PAUSE_SECONDS] of silence, then pause()+flush(). Returns false on a track error. */
  private fun renderUntilSilent(track: AudioTrack, synth: ModalBellSynth, buffer: FloatArray): Boolean {
    val pauseFrames = (synth.sampleRate * SILENCE_PAUSE_SECONDS).toLong()
    var silentFrames = 0L

    try {
      track.play()

      while (true) {
        synth.render(buffer, 0, buffer.size)

        if (!writeFully(track, buffer)) {
          return false
        }

        silentFrames = if (synth.isSilent) silentFrames + buffer.size else 0L

        if (silentFrames >= pauseFrames) {
          if (shouldPause(synth)) {
            track.pause()
            track.flush()

            return true
          }

          silentFrames = 0L
        }
      }
    } catch (e: IllegalStateException) {
      Log.w(TAG, "audio track failed; recreating on next strike", e)

      return false
    }
  }

  private fun writeFully(track: AudioTrack, buffer: FloatArray): Boolean {
    var written = 0

    while (written < buffer.size) {
      val result = track.write(buffer, written, buffer.size - written, AudioTrack.WRITE_BLOCKING)

      if (result < 0) {
        Log.w(TAG, "AudioTrack.write failed ($result); recreating on next strike")

        return false
      }

      // 0 means the track stopped accepting data; treat it as an error rather than spin
      if (result == 0) {
        Log.w(TAG, "AudioTrack.write wrote nothing; recreating on next strike")

        return false
      }

      written += result
    }

    return true
  }

  private fun createTrack(sampleRate: Int): AudioTrack? {
    val minBufferBytes = AudioTrack.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_FLOAT)
    val fallbackBytes = (sampleRate * CHUNK_SECONDS).toInt() * Float.SIZE_BYTES * FALLBACK_BUFFER_CHUNKS
    val bufferBytes = if (minBufferBytes > 0) minBufferBytes * BUFFER_MULTIPLIER else fallbackBytes
    val attributes = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_MEDIA)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()
    val format = AudioFormat.Builder()
      .setEncoding(AudioFormat.ENCODING_PCM_FLOAT)
      .setSampleRate(sampleRate)
      .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
      .build()

    val track = try {
      val builder = AudioTrack.Builder()
        .setAudioAttributes(attributes)
        .setAudioFormat(format)
        .setBufferSizeInBytes(bufferBytes)
        .setTransferMode(AudioTrack.MODE_STREAM)

      // API 24–25 has no performance mode; the track still works, just without the fast path
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        builder.setPerformanceMode(AudioTrack.PERFORMANCE_MODE_LOW_LATENCY)
      }

      builder.build()
    } catch (e: Exception) {
      // UnsupportedOperationException / IllegalArgumentException from the builder
      Log.w(TAG, "failed to create AudioTrack", e)

      return null
    }

    if (track.state != AudioTrack.STATE_INITIALIZED) {
      Log.w(TAG, "AudioTrack not initialized (state ${track.state})")
      track.release()

      return null
    }

    return track
  }
}
