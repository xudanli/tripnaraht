/**
 * Narrative Theme Generator — LLM 主路径 + 规则降级（V1 骨架默认规则）
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { LlmService } from '../../../llm/services/llm.service';
import type { ThemeCandidate, TravelStoryform } from '../types/travel-storyform.types';
import type { NarrativeArcTemplate } from '../types/narrative-arc.types';
import { resolvePrimaryArcTemplate } from '../encoders/travel-dna.encoder';

const ARC_POOL: NarrativeArcTemplate[] = [
  'exploration',
  'healing',
  'connection',
  'neutral',
];

const RULE_TEMPLATES: Record<
  NarrativeArcTemplate,
  { title: string; tagline: string; resonanceHint?: string }
> = {
  exploration: {
    title: '《向未知借一条路》',
    tagline: '不是去看更多，而是允许被未知重新排列',
    resonanceHint: '适合在少人路段、开阔地貌留出空白时刻',
  },
  healing: {
    title: '《慢下来，才算真正到达》',
    tagline: '把节奏还给身体，把答案留给时间',
    resonanceHint: '适合在安静停留点，不赶下一段路',
  },
  connection: {
    title: '《在别处遇见自己》',
    tagline: '通过人与地方，看见关系里的另一种可能',
    resonanceHint: '适合在本地生活场景与文化接触点',
  },
  neutral: {
    title: '《一次没有结论的出发》',
    tagline: '允许这次旅行不回答任何问题',
    resonanceHint: '适合保留弹性，不为意义设 KPI',
  },
};

@Injectable()
export class NarrativeThemeGeneratorService {
  private readonly logger = new Logger(NarrativeThemeGeneratorService.name);

  constructor(@Optional() private readonly llmService?: LlmService) {}

  async generate(
    storyform: TravelStoryform,
    options?: { locale?: string; seed?: number },
  ): Promise<ThemeCandidate[]> {
    try {
      const viaLlm = await this.generateViaLlm(storyform, options?.locale ?? 'zh-CN');
      if (viaLlm.length >= 3) {
        return viaLlm.slice(0, 3);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[NarrativeTheme] LLM generation failed, using rules: ${msg}`);
    }
    return this.generateViaRules(storyform, options?.seed);
  }

  async generateViaLlm(
    storyform: TravelStoryform,
    locale: string,
  ): Promise<ThemeCandidate[]> {
    if (!this.llmService || process.env.NARRATIVE_THEME_LLM_ENABLED !== 'true') {
      return [];
    }

    const prompt = this.buildLlmPrompt(storyform, locale);
    const response = await this.llmService.callLlmWithSchema(
      this.llmService.getDefaultProvider(),
      prompt,
      this.themeCandidatesSchema(),
    );

    const cleaned = response
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    const raw = JSON.parse(cleaned) as { candidates?: Array<Record<string, unknown>> };

    if (!Array.isArray(raw.candidates)) {
      return [];
    }

    const parsed = raw.candidates;
    return parsed.slice(0, 3).map((c) => ({
      id: randomUUID(),
      title: String(c.title ?? RULE_TEMPLATES.neutral.title),
      tagline: String(c.tagline ?? ''),
      arcTemplate: this.normalizeArc(String(c.arcTemplate ?? 'neutral')),
      resonanceHint: c.resonanceHint ? String(c.resonanceHint) : undefined,
      confidence: 'high' as const,
      fallbackGenerated: false,
    }));
  }

  generateViaRules(storyform: TravelStoryform, seed = 0): ThemeCandidate[] {
    const primary = resolvePrimaryArcTemplate(storyform.catalyst.motivations);
    const ordered = this.orderArcPool(primary, seed);

    return ordered.slice(0, 3).map((arc, index) => {
      const tpl = RULE_TEMPLATES[arc];
      const mood = storyform.narrativePreferences.moodKeywords?.[0];
      const title =
        index === 0 && mood
          ? `《在${mood}里重新认识自己》`
          : tpl.title;

      return {
        id: randomUUID(),
        title,
        tagline: tpl.tagline,
        arcTemplate: arc,
        resonanceHint: tpl.resonanceHint,
        confidence: index === 0 ? 'high' : 'medium',
        fallbackGenerated: true,
      };
    });
  }

  private orderArcPool(primary: NarrativeArcTemplate, seed: number): NarrativeArcTemplate[] {
    const rest = ARC_POOL.filter((a) => a !== primary);
    const rotate = seed % Math.max(rest.length, 1);
    const rotated = [...rest.slice(rotate), ...rest.slice(0, rotate)];
    return [primary, ...rotated];
  }

  private normalizeArc(value: string): NarrativeArcTemplate {
    if (ARC_POOL.includes(value as NarrativeArcTemplate)) {
      return value as NarrativeArcTemplate;
    }
    return 'neutral';
  }

  private buildLlmPrompt(storyform: TravelStoryform, locale: string): string {
    const intake = storyform.meta.intakeSnapshot;
    return [
      '你是 TripNARA 叙事主题助手。根据用户 intake 生成恰好 3 个旅行主题候选。',
      `语言: ${locale}`,
      '约束:',
      '- title 用《》包裹，≤20字',
      '- tagline ≤40字',
      '- arcTemplate 只能是 exploration|healing|connection|neutral',
      '- 禁止输出具体 POI、预订、价格',
      '- 不强迫正面 redemption 叙事；允许 neutral',
      '- 3 个候选 arcTemplate 尽量不重复',
      `输入: ${JSON.stringify(intake)}`,
      `目的地: ${storyform.objective.destination ?? '未指定'}`,
    ].join('\n');
  }

  private themeCandidatesSchema(): Record<string, unknown> {
    return {
      type: 'object',
      properties: {
        candidates: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              tagline: { type: 'string' },
              arcTemplate: { type: 'string' },
              resonanceHint: { type: 'string' },
            },
            required: ['title', 'tagline', 'arcTemplate'],
          },
        },
      },
      required: ['candidates'],
    };
  }
}
