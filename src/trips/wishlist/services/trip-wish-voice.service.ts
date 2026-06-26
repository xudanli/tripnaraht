import {
  BadRequestException,
  Injectable,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { VoiceService } from '../../../voice/voice.service';
import { TripWishAccessService } from './trip-wish-access.service';
import { TripWishStructuringService } from './trip-wish-structuring.service';
import { TripWishService } from './trip-wish.service';
import type {
  TripWishItemRecord,
  WishCategory,
  WishStructuredHints,
  WishVisibility,
} from '../types/trip-wish.types';
import {
  inferWishCategoryFromText,
  inferWishImportanceFromText,
} from '../utils/wish-voice-category.util';

export interface WishVoiceTranscribeResult {
  voiceTranscriptId: string;
  transcript: string;
  language?: string;
  confidence?: number;
  suggestedDraft: {
    text: string;
    category: WishCategory;
    importance: number;
    structuredHints: WishStructuredHints;
  };
}

export interface CreateWishFromVoiceInput {
  voiceTranscriptId: string;
  text: string;
  category?: WishCategory;
  importance?: number;
  visibility?: WishVisibility;
}

@Injectable()
export class TripWishVoiceService {
  constructor(
    private readonly access: TripWishAccessService,
    private readonly structuring: TripWishStructuringService,
    private readonly wishService: TripWishService,
    @Optional() private readonly voiceService?: VoiceService,
  ) {}

  async transcribe(
    tripId: string,
    userId: string,
    audioBuffer: Buffer,
    options?: { language?: string; format?: string },
  ): Promise<WishVoiceTranscribeResult> {
    await this.access.assertTripMember(tripId, userId);
    if (!audioBuffer?.length) {
      throw new BadRequestException('音频文件不能为空');
    }
    if (!this.voiceService) {
      throw new BadRequestException('VoiceService 未注入，无法进行语音转写');
    }

    const stt = await this.voiceService.transcribe(audioBuffer, options);
    if (!stt.success || !stt.data?.transcript?.trim()) {
      throw new BadRequestException(stt.error?.message ?? '语音转写失败');
    }

    return this.buildTranscribeResult(stt.data.transcript, {
      language: stt.data.language,
      confidence: stt.data.confidence,
    });
  }

  async createFromConfirmed(
    tripId: string,
    userId: string,
    input: CreateWishFromVoiceInput,
  ): Promise<TripWishItemRecord> {
    const category = input.category ?? inferWishCategoryFromText(input.text);
    const structuredHints = this.structuring.inferStructuredHints(input.text, category);

    return this.wishService.create(tripId, userId, {
      category,
      text: input.text,
      importance: input.importance ?? inferWishImportanceFromText(input.text),
      inputMode: 'voice',
      visibility: input.visibility ?? 'private',
      sourceRef: { voiceTranscriptId: input.voiceTranscriptId },
      structuredHints,
    });
  }

  async createFromAudio(
    tripId: string,
    userId: string,
    audioBuffer: Buffer,
    options?: {
      language?: string;
      format?: string;
      category?: WishCategory;
      importance?: number;
      visibility?: WishVisibility;
    },
  ): Promise<{ transcribe: WishVoiceTranscribeResult; wish: TripWishItemRecord }> {
    const transcribe = await this.transcribe(tripId, userId, audioBuffer, options);
    const wish = await this.createFromConfirmed(tripId, userId, {
      voiceTranscriptId: transcribe.voiceTranscriptId,
      text: transcribe.suggestedDraft.text,
      category: options?.category ?? transcribe.suggestedDraft.category,
      importance: options?.importance ?? transcribe.suggestedDraft.importance,
      visibility: options?.visibility,
    });
    return { transcribe, wish };
  }

  private buildTranscribeResult(
    transcript: string,
    meta?: { language?: string; confidence?: number },
  ): WishVoiceTranscribeResult {
    const text = transcript.trim();
    const category = inferWishCategoryFromText(text);
    const structuredHints = this.structuring.inferStructuredHints(text, category);

    return {
      voiceTranscriptId: randomUUID(),
      transcript: text,
      language: meta?.language,
      confidence: meta?.confidence,
      suggestedDraft: {
        text,
        category,
        importance: inferWishImportanceFromText(text),
        structuredHints,
      },
    };
  }
}
