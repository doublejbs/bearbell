import { BELL_DURATION_SECONDS, SAMPLE_RATE, createSilence, encodeWav, synthesizeBell } from '../BellSynth';

const readAscii = (bytes: Uint8Array, offset: number, length: number) =>
  String.fromCharCode(...bytes.slice(offset, offset + length));

describe('BellSynth', () => {
  it('44.1kHz 로 1.6초 분량을 합성한다', () => {
    const samples = synthesizeBell();

    expect(SAMPLE_RATE).toBe(44100);
    expect(BELL_DURATION_SECONDS).toBe(1.6);
    expect(samples.length).toBe(Math.round(SAMPLE_RATE * BELL_DURATION_SECONDS));
  });

  it('피크가 0.89로 정규화되고 클리핑이 없다', () => {
    const samples = synthesizeBell();
    const peak = samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0);

    expect(peak).toBeCloseTo(0.89, 2);
  });

  it('시작과 끝이 0 근처라 클릭 노이즈가 없다', () => {
    const samples = synthesizeBell();

    expect(Math.abs(samples[0])).toBeLessThan(0.01);
    expect(Math.abs(samples[samples.length - 1])).toBeLessThan(0.001);
  });

  it('소리가 시간이 지날수록 감쇠한다', () => {
    const samples = synthesizeBell();
    const rms = (from: number, to: number) => {
      let sum = 0;

      for (let i = from; i < to; i++) {
        sum += samples[i] * samples[i];
      }

      return Math.sqrt(sum / (to - from));
    };
    const window = Math.round(SAMPLE_RATE * 0.1);

    expect(rms(0, window)).toBeGreaterThan(rms(window * 5, window * 6));
    expect(rms(window * 5, window * 6)).toBeGreaterThan(rms(window * 14, window * 15));
  });

  it('결정적이다 — 두 번 합성해도 동일하다', () => {
    expect(synthesizeBell()).toEqual(synthesizeBell());
  });

  it('무음은 모든 샘플이 0이다', () => {
    const silence = createSilence(1);

    expect(silence.length).toBe(SAMPLE_RATE);
    expect(silence.every((value) => value === 0)).toBe(true);
  });

  it('16bit PCM mono WAV 헤더를 올바르게 쓴다', () => {
    const samples = new Float32Array([0, 1, -1, 0.5]);
    const wav = encodeWav(samples);
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);

    expect(wav.byteLength).toBe(44 + samples.length * 2);
    expect(readAscii(wav, 0, 4)).toBe('RIFF');
    expect(view.getUint32(4, true)).toBe(36 + samples.length * 2);
    expect(readAscii(wav, 8, 4)).toBe('WAVE');
    expect(readAscii(wav, 12, 4)).toBe('fmt ');
    expect(view.getUint32(16, true)).toBe(16);
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(SAMPLE_RATE);
    expect(view.getUint32(28, true)).toBe(SAMPLE_RATE * 2);
    expect(view.getUint16(32, true)).toBe(2);
    expect(view.getUint16(34, true)).toBe(16);
    expect(readAscii(wav, 36, 4)).toBe('data');
    expect(view.getUint32(40, true)).toBe(samples.length * 2);
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(32767);
    expect(view.getInt16(48, true)).toBe(-32767);
    expect(view.getInt16(50, true)).toBe(16384);
  });
});
