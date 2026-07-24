import type { CommsSyncIncomingMessage } from '../types/in-trip-comms.types';

const DATA_URI_PATTERN = /^data:audio\/[^;]+;base64,/i;
const BASE64_HEAVY_PATTERN = /^[A-Za-z0-9+/=\s]{500,}$/;

export function assertCommsSyncMessagePayloadAllowed(msg: CommsSyncIncomingMessage): void {
  if (DATA_URI_PATTERN.test(msg.body) || (msg.body.length > 512 && BASE64_HEAVY_PATTERN.test(msg.body))) {
    throw new Error('COMMS_AUDIO_IN_JSON: 原始音频不得通过 sync JSON 上传，请走 BLE 或 POST comms/transcribe');
  }

  const audio = msg.audio as Record<string, unknown> | undefined;
  if (audio) {
    for (const key of ['data', 'base64', 'pcm', 'buffer', 'content']) {
      if (audio[key] != null) {
        throw new Error('COMMS_AUDIO_IN_JSON: audio 字段不得包含原始音频数据');
      }
    }
    const url = typeof audio.url === 'string' ? audio.url : '';
    if (DATA_URI_PATTERN.test(url)) {
      throw new Error('COMMS_AUDIO_IN_JSON: audio.url 不得为 data URI');
    }
  }

  const meta = msg.metadata;
  if (meta && typeof meta === 'object') {
    for (const key of ['audioData', 'pcm', 'base64', 'rawAudio']) {
      if (key in meta && (meta as Record<string, unknown>)[key] != null) {
        throw new Error('COMMS_AUDIO_IN_JSON: metadata 不得包含原始音频');
      }
    }
  }
}
