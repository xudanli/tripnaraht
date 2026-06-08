import { Injectable } from '@nestjs/common';
import { VibeLlmGateway } from './gateway/vibe-llm.gateway';
import {
  combineRecruitmentFreeText,
  buildVibeLlmParseViewFromPayload,
  normalizeClientVibeParseInput,
} from './engine/vibe-llm-parse.engine';
import type { VibeLlmParsePayload, VibeLlmParseView } from './types/vibe-llm.types';

@Injectable()
export class VibeLlmService {
  constructor(private readonly gateway: VibeLlmGateway) {}

  /** 实时解析 — LLM 语义主路径 + 规则校准；LLM 不可用时规则兜底 */
  async parseFreeText(freeText: string): Promise<VibeLlmParseView> {
    const trimmed = freeText.trim();
    const payload = await this.gateway.parsePrimary(trimmed);
    return this.toView({ ...payload, source_text: trimmed || payload.source_text });
  }

  async parseRecruitmentDraft(input: {
    vibeFreeText?: string | null;
    preferenceNotes?: string | null;
    captainMessage?: string | null;
    itinerarySummary?: string | null;
  }): Promise<VibeLlmParseView | null> {
    const combined = combineRecruitmentFreeText(input);
    if (!combined) return null;
    return this.parseFreeText(combined);
  }

  toView(payload: VibeLlmParsePayload): VibeLlmParseView {
    return buildVibeLlmParseViewFromPayload(payload);
  }

  /** 发布 create — 优先使用客户端 vibeParse 快照，否则服务端 parse */
  async resolveCreateVibeParse(input: {
    vibeFreeText?: string | null;
    vibeParse?: unknown;
    vibe_parse?: unknown;
  }): Promise<VibeLlmParseView | null> {
    const sourceText = input.vibeFreeText?.trim() ?? '';
    const clientRaw = input.vibeParse ?? input.vibe_parse;
    if (clientRaw) {
      const fromClient = normalizeClientVibeParseInput(clientRaw, {
        sourceText: sourceText || undefined,
      });
      if (fromClient) return fromClient;
    }
    if (sourceText) {
      return this.parseFreeText(sourceText);
    }
    return null;
  }
}
