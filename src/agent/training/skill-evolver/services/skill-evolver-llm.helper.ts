import { Injectable, Logger, Optional } from '@nestjs/common';
import { LlmService } from '../../../../llm/services/llm.service';
import type { LlmProvider } from '../../../../llm/dto/llm-request.dto';

@Injectable()
export class SkillEvolverLlmHelper {
  private readonly logger = new Logger(SkillEvolverLlmHelper.name);
  private static fallbackWarned = false;

  constructor(@Optional() private readonly llmService?: LlmService) {}

  isAvailable(): boolean {
    return !!this.llmService;
  }

  private parseStructuredResponse<T>(raw: unknown): T {
    if (typeof raw !== 'string') return raw as T;
    let cleaned = raw.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
    cleaned = cleaned.replace(/\s*```$/i, '');
    cleaned = cleaned.trim();
    const fenced = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (fenced) cleaned = fenced[1];
    return JSON.parse(cleaned) as T;
  }

  async structured<T>(prompt: string, schema: Record<string, unknown>, fallback: T): Promise<T> {
    if (!this.llmService) {
      if (!SkillEvolverLlmHelper.fallbackWarned) {
        SkillEvolverLlmHelper.fallbackWarned = true;
        this.logger.warn('[SkillEvolverLlm] LlmService 未注入，后续将静默使用 fallback');
      }
      return fallback;
    }
    try {
      const provider = this.llmService.getDefaultProvider() as LlmProvider;
      const raw = await this.llmService.callLlmWithSchema(provider, prompt, schema);
      return this.parseStructuredResponse<T>(raw);
    } catch (err) {
      this.logger.warn(
        `[SkillEvolverLlm] 调用失败: ${err instanceof Error ? err.message : err}`,
      );
      return fallback;
    }
  }

  async text(prompt: string, fallback: string): Promise<string> {
    if (!this.llmService) return fallback;
    try {
      const provider = this.llmService.getDefaultProvider() as LlmProvider;
      return await this.llmService.callLlmWithSchema(provider, prompt, undefined);
    } catch (err) {
      this.logger.warn(
        `[SkillEvolverLlm] text 失败: ${err instanceof Error ? err.message : err}`,
      );
      return fallback;
    }
  }
}
