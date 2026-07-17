import { Injectable, Logger, Optional } from '@nestjs/common';
import { LlmService } from '../../../llm/services/llm.service';
import { parseJsonFromLlmText } from '../../../llm/utils/parse-llm-json.util';
import {
  compileSameDayIntent,
  type SameDayCompiledIntent,
} from '../utils/same-day-intent-compiler.util';
import type {
  ContextualRecommendationsContextDelta,
  DesiredIntensity,
  TeamEnergyLevel,
  TripPhaseHint,
} from '../types/contextual-recommendations.types';

@Injectable()
export class SameDayIntentCompileService {
  private readonly logger = new Logger(SameDayIntentCompileService.name);

  constructor(@Optional() private readonly llm?: LlmService) {}

  async compile(
    intent: string | null | undefined,
    options?: { useLlm?: boolean },
  ): Promise<SameDayCompiledIntent> {
    const raw = intent?.trim() ?? '';
    const base = compileSameDayIntent(raw);
    if (!raw) return base;

    const rulesSufficient = base.matchedPhrases.length >= 2;
    if (!options?.useLlm || !this.llm || rulesSufficient) {
      return base;
    }

    try {
      const refined = await this.refineWithLlm(raw, base);
      return {
        contextDelta: { ...base.contextDelta, ...refined },
        matchedPhrases: [...base.matchedPhrases, 'llm_refine'],
        source: 'rules+llm',
      };
    } catch (error) {
      this.logger.warn(
        `Same-day intent LLM refine fallback: ${error instanceof Error ? error.message : error}`,
      );
      return base;
    }
  }

  private async refineWithLlm(
    intent: string,
    base: SameDayCompiledIntent,
  ): Promise<ContextualRecommendationsContextDelta> {
    const provider = this.llm!.getDefaultProvider();
    const prompt = `你是旅行「当天微规划」意图解析器。把用户话术转为 JSON 现场状态（Context Delta）。
不要编造酒店/家庭结构等后端权威事实。

用户输入：「${intent}」

规则引擎已解析：
${JSON.stringify(base.contextDelta, null, 2)}

仅输出 JSON：
{
  "tripPhase": "ARRIVAL_DAY" | "IN_TRIP" | "DEPARTURE_DAY" | "UNKNOWN",
  "desiredIntensity": "LIGHT" | "MODERATE" | "FULL",
  "desiredReturnTime": "HH:mm",
  "teamState": { "energy": "LOW"|"MEDIUM"|"HIGH", "temporaryConstraints": string[] },
  "preference": string[]
}`;

    const rawText = await this.llm!.callLlmWithSchema(provider, prompt, {
      type: 'object',
      properties: {
        tripPhase: { type: 'string' },
        desiredIntensity: { type: 'string' },
        desiredReturnTime: { type: 'string' },
        teamState: { type: 'object' },
        preference: { type: 'array', items: { type: 'string' } },
      },
    });
    const parsed = parseJsonFromLlmText(rawText) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') return {};

    const tripPhase = asTripPhase(parsed.tripPhase);
    const desiredIntensity = asIntensity(parsed.desiredIntensity);
    const desiredReturnTime =
      typeof parsed.desiredReturnTime === 'string' && /^\d{2}:\d{2}$/.test(parsed.desiredReturnTime)
        ? parsed.desiredReturnTime
        : undefined;
    const teamRaw =
      parsed.teamState && typeof parsed.teamState === 'object'
        ? (parsed.teamState as Record<string, unknown>)
        : {};
    const energy = asEnergy(teamRaw.energy);
    const temporaryConstraints = Array.isArray(teamRaw.temporaryConstraints)
      ? teamRaw.temporaryConstraints.filter((x): x is string => typeof x === 'string')
      : undefined;
    const preference = Array.isArray(parsed.preference)
      ? parsed.preference.filter((x): x is string => typeof x === 'string')
      : undefined;

    return {
      ...(tripPhase ? { tripPhase } : {}),
      ...(desiredIntensity ? { desiredIntensity } : {}),
      ...(desiredReturnTime
        ? { desiredReturnTime, availableUntil: desiredReturnTime }
        : {}),
      ...((energy || temporaryConstraints?.length)
        ? {
            teamState: {
              ...(energy ? { energy } : {}),
              ...(temporaryConstraints?.length ? { temporaryConstraints } : {}),
            },
          }
        : {}),
      ...(preference?.length ? { preference } : {}),
    };
  }
}

function asTripPhase(raw: unknown): TripPhaseHint | undefined {
  if (
    raw === 'ARRIVAL_DAY' ||
    raw === 'IN_TRIP' ||
    raw === 'DEPARTURE_DAY' ||
    raw === 'UNKNOWN'
  ) {
    return raw;
  }
  return undefined;
}

function asIntensity(raw: unknown): DesiredIntensity | undefined {
  if (raw === 'LIGHT' || raw === 'MODERATE' || raw === 'FULL') return raw;
  return undefined;
}

function asEnergy(raw: unknown): TeamEnergyLevel | undefined {
  if (raw === 'LOW' || raw === 'MEDIUM' || raw === 'HIGH') return raw;
  return undefined;
}
