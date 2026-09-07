import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { convertToWav, mimeToExt } from '../audio-utils';

// ── 可控 OfflineAudioContext mock ─────────────────────

interface FakeAudioBuffer {
  numberOfChannels: number;
  sampleRate: number;
  channelData: Float32Array;
}

let fakeBuffer: FakeAudioBuffer;

function stubOfflineAudioContext() {
  vi.stubGlobal(
    'OfflineAudioContext',
    class {
      constructor() {}
      decodeAudioData() {
        return Promise.resolve({
          numberOfChannels: fakeBuffer.numberOfChannels,
          sampleRate: fakeBuffer.sampleRate,
          getChannelData: () => fakeBuffer.channelData,
          close: () => {},
        } as any);
      }
      close() {}
    },
  );
}

function makeBlob(bytes: ArrayBuffer, type = 'audio/webm'): Blob {
  return new Blob([bytes], { type });
}

/** 解析 WAV ArrayBuffer：返回头部关键字段与 PCM 采样 */
function parseWav(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  const text = (offset: number, len: number) =>
    String.fromCharCode(...Array.from({ length: len }, (_, i) => view.getUint8(offset + i)));
  const readInt16s = (offset: number, count: number) =>
    Array.from({ length: count }, (_, i) => view.getInt16(offset + i * 2, true));

  return {
    riff: text(0, 4),
    wave: text(8, 4),
    fmt: text(12, 4),
    chunkSize: view.getUint32(4, true),
    audioFormat: view.getUint16(20, true),
    numChannels: view.getUint16(22, true),
    sampleRate: view.getUint32(24, true),
    byteRate: view.getUint32(28, true),
    blockAlign: view.getUint16(32, true),
    bitsPerSample: view.getUint16(34, true),
    dataTag: text(36, 4),
    dataSize: view.getUint32(40, true),
    samples: readInt16s(44, Math.floor((buffer.byteLength - 44) / 2)),
    byteLength: buffer.byteLength,
  };
}

beforeEach(() => {
  fakeBuffer = {
    numberOfChannels: 1,
    sampleRate: 48000,
    channelData: new Float32Array([0, 0, 0]),
  };
  stubOfflineAudioContext();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('convertToWav', () => {
  it('encodes a valid RIFF/WAVE header with PCM16 mono layout', async () => {
    const blob = makeBlob(new ArrayBuffer(8));
    const result = await convertToWav(blob);

    const buf = await result.arrayBuffer();
    const wav = parseWav(buf);

    expect(wav.riff).toBe('RIFF');
    expect(wav.wave).toBe('WAVE');
    expect(wav.fmt).toBe('fmt ');
    expect(wav.audioFormat).toBe(1); // PCM
    expect(wav.numChannels).toBe(1);
    expect(wav.sampleRate).toBe(48000);
    expect(wav.bitsPerSample).toBe(16);
    expect(wav.blockAlign).toBe(2); // 1ch * 16bit/8
    expect(wav.byteRate).toBe(48000 * 2);
    expect(wav.dataTag).toBe('data');
    expect(wav.dataSize).toBe(3 * 2); // 3 samples * 2 bytes
    expect(wav.byteLength).toBe(44 + 6);
    expect(wav.chunkSize).toBe(36 + 6); // RIFF chunk 不含头 8 字节 → 36 + dataSize
    // 端序必须是 little-endian：chunkSize 低字节出现在 buffer[4]
    const view = new DataView(buf);
    expect(view.getUint8(4)).toBe(42 & 0xff);
    expect(view.getUint8(5)).toBe((42 >> 8) & 0xff);
    expect(result.type).toBe('audio/wav');
  });

  it('clamps positive samples above 1.0 to 0x7fff', async () => {
    fakeBuffer.channelData = new Float32Array([1.0, 0.5, 0.0]);
    const blob = makeBlob(new ArrayBuffer(8));
    const buf = await (await convertToWav(blob)).arrayBuffer();
    const wav = parseWav(buf);

    expect(wav.samples[0]).toBe(32767);
    expect(wav.samples[1]).toBe(16383); // 0.5 * 0x7fff = 16383.5 → Int16 截断为 16383
    expect(wav.samples[2]).toBe(0);
  });

  it('encodes negative samples with 0x8000 scale and clamps below -1.0', async () => {
    fakeBuffer.channelData = new Float32Array([-0.5, -1.0, -2.0]);
    const blob = makeBlob(new ArrayBuffer(8));
    const buf = await (await convertToWav(blob)).arrayBuffer();
    const wav = parseWav(buf);

    expect(wav.samples[0]).toBe(-16384); // -0.5 * 0x8000
    expect(wav.samples[1]).toBe(-32768); // -1.0 * 0x8000
    expect(wav.samples[2]).toBe(-32768); // -2.0 clamped to -1.0
  });

  it('encodes positive zero, exact 0x7fff boundary and mixed samples', async () => {
    fakeBuffer.channelData = new Float32Array([0.0, 1.0, -1.0, 0.25, -0.25]);
    const blob = makeBlob(new ArrayBuffer(8));
    const buf = await (await convertToWav(blob)).arrayBuffer();
    const wav = parseWav(buf);

    expect(wav.samples).toEqual([0, 32767, -32768, 8191, -8192]);
  });

  it('produces an empty data section for an empty sample buffer', async () => {
    fakeBuffer.channelData = new Float32Array(0);
    const blob = makeBlob(new ArrayBuffer(8));
    const result = await convertToWav(blob);

    const buf = await result.arrayBuffer();
    const wav = parseWav(buf);

    expect(wav.dataSize).toBe(0);
    expect(wav.samples).toEqual([]);
    expect(buf.byteLength).toBe(44);
  });

  it('keeps the source sampleRate in the WAV header', async () => {
    fakeBuffer.sampleRate = 16000;
    fakeBuffer.channelData = new Float32Array([0.1]);
    const blob = makeBlob(new ArrayBuffer(8));
    const buf = await (await convertToWav(blob)).arrayBuffer();
    const wav = parseWav(buf);

    expect(wav.sampleRate).toBe(16000);
    expect(wav.byteRate).toBe(16000 * 2);
  });
});

describe('mimeToExt', () => {
  it('maps known audio mime types', () => {
    expect(mimeToExt('audio/webm')).toBe('webm');
    expect(mimeToExt('audio/ogg')).toBe('ogg');
    expect(mimeToExt('audio/mp4')).toBe('mp4');
    expect(mimeToExt('audio/aac')).toBe('aac');
    expect(mimeToExt('audio/wav')).toBe('wav');
    expect(mimeToExt('audio/x-wav')).toBe('wav');
    expect(mimeToExt('audio/mpeg')).toBe('mp3');
  });

  it('falls back to webm for unknown or empty mime', () => {
    expect(mimeToExt('audio/flac')).toBe('webm');
    expect(mimeToExt('')).toBe('webm');
  });

  it('strips parameters and whitespace from the mime type', () => {
    expect(mimeToExt('audio/webm; codecs=opus')).toBe('webm');
    expect(mimeToExt(' audio/ogg ')).toBe('ogg');
  });
});
