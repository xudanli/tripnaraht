import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmService } from '../../llm/services/llm.service';
import { LlmProvider } from '../../llm/dto/llm-request.dto';
import {
  VIBE_LLM_JSON_SCHEMA,
  VIBE_LLM_SYSTEM_PROMPT,
  buildVibeLlmUserPrompt,
} from '../config/vibe-llm-system-prompt.config';
import {
  calibrateLlmPayloadWithRules,
  normalizeVibeLlmPayload,
  parseVibeFreeTextWithRules,
} from '../engine/vibe-llm-parse.engine';
import type { VibeLlmParsePayload } from '../types/vibe-llm.types';

@Injectable()
export class VibeLlmGateway {
  private readonly logger = new Logger(VibeLlmGateway.name);

  constructor(
    @Optional() private readonly llmService?: LlmService,
    @Optional() private readonly configService?: ConfigService,
  ) {}

  /** 线上默认开启 LLM；设 VIBE_LLM_ENABLED=false 可回退纯规则引擎 */
  isLlmEnabled(): boolean {
    const flag =
      this.configService?.get<string>('VIBE_LLM_ENABLED') ??
      process.env.VIBE_LLM_ENABLED ??
      'true';
    return flag !== 'false' && flag !== '0';
  }

  /**
   * 主解析路径：LLM 语义 → 规则校准 → LLM 失败时全量规则兜底。
   */
  async parsePrimary(freeText: string): Promise<VibeLlmParsePayload> {
    const trimmed = freeText.trim();
    if (!trimmed) {
      return parseVibeFreeTextWithRules('');
    }

    if (!this.isLlmEnabled() || !this.llmService) {
      return parseVibeFreeTextWithRules(trimmed);
    }

    const llmPayload = await this.invokeLlmParse(trimmed);
    if (llmPayload) {
      return calibrateLlmPayloadWithRules(trimmed, llmPayload);
    }

    this.logger.warn('[VibeLLM] LLM unavailable or failed — falling back to rules engine');
    return parseVibeFreeTextWithRules(trimmed);
  }

  /** @deprecated 使用 parsePrimary；保留供旧调用方兼容 */
  async parseWithLlm(freeText: string): Promise<VibeLlmParsePayload | null> {
    if (!this.isLlmEnabled() || !this.llmService) return null;
    return this.invokeLlmParse(freeText.trim());
  }

  private async invokeLlmParse(freeText: string): Promise<VibeLlmParsePayload | null> {
    if (!freeText.trim() || !this.llmService) return null;

    const providerName =
      this.configService?.get<string>('VIBE_LLM_PROVIDER') ??
      process.env.VIBE_LLM_PROVIDER ??
      'deepseek';

    const provider =
      providerName === 'openai'
        ? LlmProvider.OPENAI
        : providerName === 'vllm'
          ? LlmProvider.VLLM
          : LlmProvider.DEEPSEEK;

    const prompt = `${VIBE_LLM_SYSTEM_PROMPT}

${buildVibeLlmUserPrompt(freeText)}`;

    try {
      const raw = await this.llmService.callLlmWithSchema(
        provider,
        prompt,
        VIBE_LLM_JSON_SCHEMA,
      );
      const parsed = JSON.parse(raw) as unknown;
      return normalizeVibeLlmPayload(parsed, 'llm');
    } catch (error) {
      this.logger.warn(`[VibeLLM] LLM parse failed: ${(error as Error).message}`);
      return null;
    }
  }
}

export function parseVibeTextSync(freeText: string): VibeLlmParsePayload {
  if (!freeText.trim()) {
    return parseVibeFreeTextWithRules('');
  }
  return parseVibeFreeTextWithRules(freeText);
}
