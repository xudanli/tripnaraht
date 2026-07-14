import { Injectable, Logger, Optional } from '@nestjs/common';
import { LlmService } from '../../../llm/services/llm.service';
import { parseJsonFromLlmText } from '../../../llm/utils/parse-llm-json.util';
import {
  compileAttractionExploreIntent,
  isAttractionExplorePlaceNameLookup,
  type AttractionExploreCompiledIntent,
} from '../utils/attraction-explore-intent-compiler.util';

export type IntentCompileSource = 'rules' | 'rules+llm';

export type CompiledExploreIntentResult = AttractionExploreCompiledIntent & {
  source: IntentCompileSource;
};

const VALID_THEMES = new Set([
  'first_time_essentials',
  'nature_landscapes',
  'waterfalls',
  'hot_springs',
  'glaciers',
  'highlands',
  'photography',
  'culture_history',
]);

const VALID_SUITABILITIES = new Set([
  'family',
  'couple',
  'solo',
  'seniors',
  'adventure_seekers',
  'relaxed_pace',
]);

const VALID_ROUTE_CONTEXTS = new Set([
  'GOLDEN_CIRCLE',
  'SOUTH_COAST',
  'RING_ROAD',
  'REYKJAVIK',
  'SNOWFELL_PENINSULA',
]);

@Injectable()
export class AttractionExploreIntentCompileService {
  private readonly logger = new Logger(AttractionExploreIntentCompileService.name);

  constructor(@Optional() private readonly llm?: LlmService) {}

  async compile(
    query: string,
    options?: { useLlm?: boolean },
  ): Promise<CompiledExploreIntentResult> {
    const base = compileAttractionExploreIntent(query);
    const rulesSufficient =
      base.matchedPhrases.length >= 2 ||
      (base.themes.length > 0 && base.suitableFor.length > 0) ||
      isAttractionExplorePlaceNameLookup(base);

    if (!options?.useLlm || !this.llm || rulesSufficient) {
      return { ...base, source: 'rules' };
    }

    try {
      const refined = await this.refineWithLlm(query, base);
      return {
        ...this.mergeIntent(base, refined),
        source: 'rules+llm',
      };
    } catch (error) {
      this.logger.warn(
        `LLM intent refine fallback to rules: ${error instanceof Error ? error.message : error}`,
      );
      return { ...base, source: 'rules' };
    }
  }

  private async refineWithLlm(
    query: string,
    base: AttractionExploreCompiledIntent,
  ): Promise<Partial<AttractionExploreCompiledIntent>> {
    const provider = this.llm!.getDefaultProvider();
    const prompt = `你是冰岛行程探索意图解析器。将用户自然语言转为 JSON 检索条件。

用户输入：「${query}」

规则引擎已解析（可参考或覆盖）：
${JSON.stringify(base, null, 2)}

仅输出 JSON 对象，字段均可选：
{
  "themes": string[],
  "suitableFor": string[],
  "mobilityRequirement": "LOW_INTENSITY" | "MEDIUM" | "HIGH",
  "parkingRequired": boolean,
  "routeContext": "GOLDEN_CIRCLE" | "SOUTH_COAST" | "RING_ROAD" | "REYKJAVIK" | "SNOWFELL_PENINSULA",
  "maxDetourMinutes": number,
  "weatherMode": "ALL_WEATHER" | "RAINY_DAY" | "OUTDOOR",
  "excludeVisited": boolean,
  "keywords": string[]
}

theme 取值：first_time_essentials, nature_landscapes, waterfalls, hot_springs, glaciers, highlands, photography, culture_history
suitableFor 取值：family, couple, solo, seniors, adventure_seekers, relaxed_pace`;

    const raw = await this.llm!.callLlmWithSchema(provider, prompt, {
      type: 'object',
      properties: {
        themes: { type: 'array', items: { type: 'string' } },
        suitableFor: { type: 'array', items: { type: 'string' } },
      },
    });

    const parsed = parseJsonFromLlmText(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return this.sanitizeLlmIntent(parsed as Record<string, unknown>);
  }

  private sanitizeLlmIntent(
    raw: Record<string, unknown>,
  ): Partial<AttractionExploreCompiledIntent> {
    const themes = Array.isArray(raw.themes)
      ? raw.themes.filter((t): t is string => typeof t === 'string' && VALID_THEMES.has(t))
      : undefined;
    const suitableFor = Array.isArray(raw.suitableFor)
      ? raw.suitableFor.filter(
          (s): s is string => typeof s === 'string' && VALID_SUITABILITIES.has(s),
        )
      : undefined;

    const mobilityRequirement =
      raw.mobilityRequirement === 'LOW_INTENSITY' ||
      raw.mobilityRequirement === 'MEDIUM' ||
      raw.mobilityRequirement === 'HIGH'
        ? raw.mobilityRequirement
        : undefined;

    const weatherMode =
      raw.weatherMode === 'ALL_WEATHER' ||
      raw.weatherMode === 'RAINY_DAY' ||
      raw.weatherMode === 'OUTDOOR'
        ? raw.weatherMode
        : undefined;

    const routeContext =
      typeof raw.routeContext === 'string' && VALID_ROUTE_CONTEXTS.has(raw.routeContext)
        ? raw.routeContext
        : undefined;

    return {
      themes: themes?.length ? themes : undefined,
      suitableFor: suitableFor?.length ? suitableFor : undefined,
      mobilityRequirement,
      parkingRequired: typeof raw.parkingRequired === 'boolean' ? raw.parkingRequired : undefined,
      routeContext,
      maxDetourMinutes:
        typeof raw.maxDetourMinutes === 'number' && raw.maxDetourMinutes > 0
          ? Math.round(raw.maxDetourMinutes)
          : undefined,
      weatherMode,
      excludeVisited: typeof raw.excludeVisited === 'boolean' ? raw.excludeVisited : undefined,
      keywords: Array.isArray(raw.keywords)
        ? raw.keywords.filter((k): k is string => typeof k === 'string').slice(0, 8)
        : undefined,
    };
  }

  private mergeIntent(
    base: AttractionExploreCompiledIntent,
    refined: Partial<AttractionExploreCompiledIntent>,
  ): AttractionExploreCompiledIntent {
    const matchedPhrases = [...base.matchedPhrases];
    if (refined.routeContext && !matchedPhrases.includes(refined.routeContext)) {
      matchedPhrases.push(refined.routeContext);
    }
    if (refined.weatherMode === 'RAINY_DAY' && !matchedPhrases.includes('雨天友好')) {
      matchedPhrases.push('雨天友好');
    }

    return {
      rawQuery: base.rawQuery,
      themes: [...new Set([...base.themes, ...(refined.themes ?? [])])],
      suitableFor: [...new Set([...base.suitableFor, ...(refined.suitableFor ?? [])])],
      mobilityRequirement: refined.mobilityRequirement ?? base.mobilityRequirement,
      parkingRequired: refined.parkingRequired ?? base.parkingRequired,
      routeContext: refined.routeContext ?? base.routeContext,
      maxDetourMinutes: refined.maxDetourMinutes ?? base.maxDetourMinutes,
      weatherMode: refined.weatherMode ?? base.weatherMode,
      excludeVisited: refined.excludeVisited ?? base.excludeVisited,
      keywords: refined.keywords?.length
        ? [...new Set([...base.keywords, ...refined.keywords])].slice(0, 8)
        : base.keywords,
      matchedPhrases,
    };
  }
}
