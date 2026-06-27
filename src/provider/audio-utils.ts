import { Mp3Encoder } from 'lamejs';

function float32ToInt16(float32: Float32Array): Int16Array {
  const len = float32.length;
  const int16 = new Int16Array(len);
  for (let i = 0; i < len; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]!));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16;
}

export async function convertToMp3(audioBlob: Blob): Promise<Blob> {
  try {
    const arrayBuffer = await audioBlob.arrayBuffer();

    const audioCtx = new AudioContext();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    audioCtx.close();

    const channels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;

    const left = float32ToInt16(audioBuffer.getChannelData(0));
    const right = channels > 1 ? float32ToInt16(audioBuffer.getChannelData(1)) : left;

    const encoder = new Mp3Encoder(channels, sampleRate, 128);
    const mp3Chunks: Int8Array[] = [];

    const blockSize = 1152;
    for (let i = 0; i < left.length; i += blockSize) {
      const chunkLeft = left.subarray(i, i + blockSize);
      const chunkRight = right.subarray(i, i + blockSize);
      const mp3Buf = encoder.encodeBuffer(chunkLeft, chunkRight);
      if (mp3Buf.length > 0) {
        mp3Chunks.push(mp3Buf);
      }
    }

    const last = encoder.flush();
    if (last.length > 0) {
      mp3Chunks.push(last);
    }

    const totalLen = mp3Chunks.reduce((sum, c) => sum + c.length, 0);
    const merged = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of mp3Chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    return new Blob([merged], { type: 'audio/mpeg' });
  } catch {
    return audioBlob;
  }
}

export function mimeToExt(mime: string): string {
  const MIME_TO_EXT: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/mp4': 'mp4',
    'audio/aac': 'aac',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/mpeg': 'mp3',
  };
  const base = mime.split(';')[0]!.trim();
  return MIME_TO_EXT[base] ?? 'webm';
}
