import {
  BadRequestException,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { VoiceService } from '../../../voice/voice.service';
import { isInTripCommsEnabled } from '../utils/in-trip-comms-config.util';
import { InTripAccessService } from './in-trip-access.service';

export interface CommsTranscribeResult {
  transcriptId: string;
  transcript: string;
  durationSec: number;
  language?: string;
  confidence?: number;
  clientId?: string;
}

@Injectable()
export class InTripCommsTranscribeService {
  constructor(
    private readonly access: InTripAccessService,
    @Optional() private readonly voiceService?: VoiceService,
  ) {}

  async transcribe(
    tripId: string,
    userId: string,
    audioBuffer: Buffer,
    options?: {
      language?: string;
      format?: string;
      clientId?: string;
      durationSec?: number;
    },
  ): Promise<CommsTranscribeResult> {
    this.assertCommsEnabled();
    await this.access.assertInTripPhase(tripId);
    await this.access.assertTripMember(tripId, userId);

    if (!audioBuffer?.length) {
      throw new BadRequestException({
        code: 'TRANSCRIBE_AUDIO_MISSING',
        message: '请上传音频文件',
      });
    }
    if (audioBuffer.length > 10 * 1024 * 1024) {
      throw new BadRequestException({
        code: 'TRANSCRIBE_UNSUPPORTED_FORMAT',
        message: '音频文件不能超过 10MB',
      });
    }
    if (!this.voiceService) {
      throw new ServiceUnavailableException({
        code: 'TRANSCRIBE_PROVIDER_UNAVAILABLE',
        message: 'VoiceService 未注入，无法进行语音转写',
      });
    }

    const stt = await this.voiceService.transcribe(audioBuffer, {
      language: options?.language,
      format: options?.format,
    });

    if (!stt.success || !stt.data?.transcript?.trim()) {
      throw new ServiceUnavailableException({
        code: 'TRANSCRIBE_PROVIDER_UNAVAILABLE',
        message: stt.error?.message ?? '语音转写失败',
      });
    }

    const durationSec =
      options?.durationSec ??
      inferDurationFromWords(stt.data.words) ??
      estimateDurationFromBuffer(audioBuffer.length);

    return {
      transcriptId: `vt_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      transcript: stt.data.transcript.trim(),
      durationSec,
      language: stt.data.language,
      confidence: stt.data.confidence,
      clientId: options?.clientId,
    };
  }

  private assertCommsEnabled(): void {
    if (!isInTripCommsEnabled()) {
      throw new ServiceUnavailableException({
        code: 'COMMS_EXECUTION_DISABLED',
        message: '行中团队对讲未启用',
      });
    }
  }
}

function inferDurationFromWords(
  words?: Array<{ end?: number }>,
): number | undefined {
  if (!words?.length) return undefined;
  const last = words[words.length - 1]?.end;
  return last != null && Number.isFinite(last) ? Math.round(last * 10) / 10 : undefined;
}

function estimateDurationFromBuffer(byteLength: number): number {
  return Math.max(1, Math.round(byteLength / 4000));
}
