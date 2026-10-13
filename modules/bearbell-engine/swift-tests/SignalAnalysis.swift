import Foundation

/// ModalBellSynth 테스트용 신호 분석 도우미.
enum SignalAnalysis {
  static func peak(_ samples: [Float], _ range: Range<Int>? = nil) -> Double {
    let r = range ?? 0..<samples.count
    var maxAbs = 0.0

    for i in r {
      maxAbs = max(maxAbs, abs(Double(samples[i])))
    }

    return maxAbs
  }

  static func rms(_ samples: [Float], _ range: Range<Int>? = nil) -> Double {
    let r = range ?? 0..<samples.count

    if r.isEmpty {
      return 0
    }

    var sum = 0.0

    for i in r {
      sum += Double(samples[i]) * Double(samples[i])
    }

    return (sum / Double(r.count)).squareRoot()
  }

  static func zeroCrossings(_ samples: [Float], _ range: Range<Int>? = nil) -> Int {
    let r = range ?? 0..<samples.count
    var count = 0

    for i in r.dropFirst() {
      if (samples[i - 1] < 0) != (samples[i] < 0) {
        count += 1
      }
    }

    return count
  }

  /// Goertzel 알고리즘으로 frequencyHz 성분의 에너지.
  static func goertzelPower(_ samples: [Float], sampleRate: Double, frequencyHz: Double, range: Range<Int>) -> Double {
    let coeff = 2 * cos(2 * Double.pi * frequencyHz / sampleRate)
    var s1 = 0.0
    var s2 = 0.0

    for i in range {
      let s0 = Double(samples[i]) + coeff * s1 - s2

      s2 = s1
      s1 = s0
    }

    return s1 * s1 + s2 * s2 - coeff * s1 * s2
  }

  /// 한 번의 render 호출 결과.
  static func renderChunk(_ synth: ModalBellSynth, frames: Int, fill: Float = 0) -> [Float] {
    var chunk = [Float](repeating: fill, count: frames)

    chunk.withUnsafeMutableBufferPointer { buffer in
      synth.render(into: buffer.baseAddress!, frameCount: frames)
    }

    return chunk
  }

  /// chunkFrames(기본 10ms) 단위로 렌더해 seconds 분량을 이어 붙인다.
  static func renderSeconds(_ synth: ModalBellSynth, sampleRate: Double, seconds: Double, chunkFrames: Int? = nil) -> [Float] {
    let total = Int(seconds * sampleRate)
    let chunk = chunkFrames ?? Int(sampleRate / 100)
    var out: [Float] = []

    out.reserveCapacity(total)

    while out.count < total {
      out.append(contentsOf: renderChunk(synth, frames: min(chunk, total - out.count)))
    }

    return out
  }
}
