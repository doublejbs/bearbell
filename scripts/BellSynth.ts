export const SAMPLE_RATE = 44100;
export const BELL_DURATION_SECONDS = 1.6;

const F0_HZ = 2100;
const BELL_LENGTH_SAMPLES = Math.round(SAMPLE_RATE * BELL_DURATION_SECONDS);

const PARTIALS = [
  { ratio: 1.0, amplitude: 1.0, decaySeconds: 0.9 },
  { ratio: 1.003, amplitude: 0.35, decaySeconds: 0.9 },
  { ratio: 2.76, amplitude: 0.55, decaySeconds: 0.45 },
  { ratio: 5.4, amplitude: 0.3, decaySeconds: 0.25 },
  { ratio: 8.93, amplitude: 0.15, decaySeconds: 0.12 },
];

const STRIKE_TIMES = [0, 0.06, 0.14];
const STRIKE_GAINS = [1.0, 0.45, 0.2];

const TRANSIENT_DURATION_SECONDS = 0.004;
const TRANSIENT_AMPLITUDE = 0.3;
const TRANSIENT_DECAY_SECONDS = 0.003;

const ATTACK_DURATION_SECONDS = 0.0015;
const FADEOUT_DURATION_SECONDS = 0.05;

const PRNG_SEED = 0xbea4be11;
const TARGET_PEAK = 0.89;

const createPrng = (seed: number) => {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;

    let t = Math.imul(state ^ (state >>> 15), 1 | state);

    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const synthesizeBell = (): Float32Array => {
  const samples = new Float32Array(BELL_LENGTH_SAMPLES);
  const prng = createPrng(PRNG_SEED);

  const phases = PARTIALS.map(() => prng() * 2 * Math.PI);

  for (let strikeIdx = 0; strikeIdx < STRIKE_TIMES.length; strikeIdx++) {
    const strikeStartTime = STRIKE_TIMES[strikeIdx];
    const strikeGain = STRIKE_GAINS[strikeIdx];
    const strikeStartSample = Math.round(strikeStartTime * SAMPLE_RATE);

    for (let partialIdx = 0; partialIdx < PARTIALS.length; partialIdx++) {
      const partial = PARTIALS[partialIdx];
      const freq = F0_HZ * partial.ratio;
      const phase = phases[partialIdx];
      const decayConstant = partial.decaySeconds;

      for (let i = strikeStartSample; i < BELL_LENGTH_SAMPLES; i++) {
        const strikeRelativeTime = (i - strikeStartSample) / SAMPLE_RATE;
        const envelope = Math.exp(-strikeRelativeTime / decayConstant);
        const partialValue = Math.sin(2 * Math.PI * freq * strikeRelativeTime + phase);

        samples[i] += strikeGain * partial.amplitude * envelope * partialValue;
      }
    }

    const transientStartSample = strikeStartSample;
    const transientEndSample = Math.min(
      strikeStartSample + Math.round(TRANSIENT_DURATION_SECONDS * SAMPLE_RATE),
      BELL_LENGTH_SAMPLES
    );

    for (let i = transientStartSample; i < transientEndSample; i++) {
      const strikeRelativeTime = (i - transientStartSample) / SAMPLE_RATE;
      const noise = (prng() - 0.5) * 2;
      const envelope = Math.exp(-strikeRelativeTime / TRANSIENT_DECAY_SECONDS);

      samples[i] += strikeGain * TRANSIENT_AMPLITUDE * noise * envelope;
    }
  }

  const attackEndSample = Math.round(ATTACK_DURATION_SECONDS * SAMPLE_RATE);
  const fadeoutStartSample = BELL_LENGTH_SAMPLES - Math.round(FADEOUT_DURATION_SECONDS * SAMPLE_RATE);

  for (let i = 0; i < BELL_LENGTH_SAMPLES; i++) {
    let envelope = 1.0;

    if (i < attackEndSample) {
      envelope = i / attackEndSample;
    } else if (i >= fadeoutStartSample) {
      envelope = (BELL_LENGTH_SAMPLES - i) / Math.round(FADEOUT_DURATION_SECONDS * SAMPLE_RATE);
    }

    samples[i] *= envelope;
  }

  let peak = 0;

  for (let i = 0; i < BELL_LENGTH_SAMPLES; i++) {
    peak = Math.max(peak, Math.abs(samples[i]));
  }

  const normalizeGain = TARGET_PEAK / peak;

  for (let i = 0; i < BELL_LENGTH_SAMPLES; i++) {
    samples[i] *= normalizeGain;
  }

  return samples;
};

export const createSilence = (seconds: number): Float32Array => {
  const length = Math.round(SAMPLE_RATE * seconds);

  return new Float32Array(length);
};

export const encodeWav = (samples: Float32Array): Uint8Array => {
  const numChannels = 1;
  const sampleRate = SAMPLE_RATE;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);

  const dataSize = samples.length * 2;
  const fileSize = 36 + dataSize;

  const wav = new Uint8Array(44 + dataSize);
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);

  let offset = 0;

  wav.set([0x52, 0x49, 0x46, 0x46], offset);
  offset += 4;
  view.setUint32(offset, fileSize, true);
  offset += 4;
  wav.set([0x57, 0x41, 0x56, 0x45], offset);
  offset += 4;

  wav.set([0x66, 0x6d, 0x74, 0x20], offset);
  offset += 4;
  view.setUint32(offset, 16, true);
  offset += 4;
  view.setUint16(offset, 1, true);
  offset += 2;
  view.setUint16(offset, numChannels, true);
  offset += 2;
  view.setUint32(offset, sampleRate, true);
  offset += 4;
  view.setUint32(offset, byteRate, true);
  offset += 4;
  view.setUint16(offset, blockAlign, true);
  offset += 2;
  view.setUint16(offset, bitsPerSample, true);
  offset += 2;

  wav.set([0x64, 0x61, 0x74, 0x61], offset);
  offset += 4;
  view.setUint32(offset, dataSize, true);
  offset += 4;

  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    const int16 = Math.round(sample * 32767);

    view.setInt16(offset, int16, true);
    offset += 2;
  }

  return wav;
};
