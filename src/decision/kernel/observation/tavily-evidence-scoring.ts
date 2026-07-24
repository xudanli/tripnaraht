import type { TripObservationAction } from '../../../trips/road/trip-action.types';
import type { DecisionState } from '../decision-state.types';
import { LlmService, type LlmTokenContext } from '../../../llm/services/llm.service';
import { LlmProvider } from '../../../llm/dto/llm-request.dto';
import type { ObservationExecutionResult } from './observation-harness.types';
import type { TavilySearchResponse } from './tavily-search.client';

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/** 面向 Arctic / 藏疆 / 特种线路的检索模板 */
export function buildTavilyObservationQuery(action: TripObservationAction, dso: DecisionState): string {
  const dest =
    typeof dso.userIntent?.destination === 'string'
      ? dso.userIntent.destination
      : dso.userIntent?.destination && typeof dso.userIntent.destination === 'object'
        ? `${(dso.userIntent.destination as { lat: number; lng: number }).lat.toFixed(2)},${(dso.userIntent.destination as { lat: number; lng: number }).lng.toFixed(2)}`
        : 'destination';
  if (action.type === 'OBSERVATION_SNS_CRAWL') {
    const loc = action.queryTerms?.length ? action.queryTerms.join(' ') : dest;
    return `Current road conditions, closures, snow, and weather at ${loc} today; official notices and recent traveller reports.`;
  }
  const name = action.poiId || 'POI';
  return `Is ${name} open today near ${dest}? Recent closures, construction, or access restrictions?`;
}

export function snippetsFromTavily(t: TavilySearchResponse, maxChars: number): string {
  const parts: string[] = [];
  if (t.answer) parts.push(`Answer: ${t.answer}`);
  for (const r of t.results ?? []) {
    const line = [r.title, r.content].filter(Boolean).join(' — ');
    if (line) parts.push(line);
  }
  const s = parts.join('\n');
  return s.length > maxChars ? `${s.slice(0, maxChars)}…` : s;
}

function parseEvidenceJson(raw: string): Partial<ObservationExecutionResult> | null {
  let cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) cleaned = m[0];
  try {
    const o = JSON.parse(cleaned) as Record<string, unknown>;
    const passability01 = typeof o.passability01 === 'number' ? clamp01(o.passability01) : undefined;
    const evidenceWeight = typeof o.evidenceWeight === 'number' ? clamp01(o.evidenceWeight) : undefined;
    const routeSegmentInfeasible = o.routeSegmentInfeasible === true;
    const poiOpen = o.poiOpen === null || o.poiOpen === undefined ? undefined : o.poiOpen === true;
    const evidenceContradiction = o.evidenceContradiction === true;
    const summary = typeof o.summary === 'string' ? o.summary : undefined;
    const affectedPoiIds = Array.isArray(o.affectedPoiIds)
      ? (o.affectedPoiIds as unknown[]).filter((x): x is string => typeof x === 'string')
      : undefined;
    return {
      passability01,
      evidenceWeight,
      routeSegmentInfeasible,
      poiOpen,
      summary,
      affectedPoiIds,
      evidenceKind: 'recent_social_image',
      evidenceContradiction: evidenceContradiction ? true : undefined,
    };
  } catch {
    return null;
  }
}

/** 无 LLM / 熔断时的极简关键词启发式 */
export function scoreEvidenceHeuristic(observationKind: 'sns' | 'poi', text: string): ObservationExecutionResult {
  const lower = text.toLowerCase();
  const bad =
    /closed|closure|blocked|impass|avalanche|blizzard|snowed in|do not travel|road closed|封路|关闭|雪崩|塌方/i.test(
      lower,
    );
  const good = /open|accessible|cleared|passable|畅通|开放/i.test(lower);
  let passability01 = 0.55;
  let evidenceWeight = 0.35;
  if (bad && !good) {
    passability01 = observationKind === 'sns' ? 0.22 : 0.35;
    evidenceWeight = 0.42;
  } else if (good && !bad) {
    passability01 = 0.78;
    evidenceWeight = 0.38;
  }
  const contradiction =
    bad &&
    good &&
    /but|however|although|虽然|但/i.test(lower);
  if (contradiction) evidenceWeight *= 0.45;
  return {
    evidenceKind: contradiction ? 'station_forecast' : 'recent_social_image',
    passability01,
    evidenceWeight: clamp01(evidenceWeight),
    evidenceContradiction: contradiction ? true : undefined,
    routeSegmentInfeasible: observationKind === 'sns' && passability01 < 0.35,
    summary: contradiction ? 'Heuristic: mixed signals (contradiction damped).' : 'Heuristic: keyword scan.',
  };
}

/**
 * 使用 gpt-4o-mini（经 LlmService → OpenAI 兼容路径）将 Tavily 摘要压成 passability / evidenceWeight。
 */
export async function scoreTavilyEvidenceWithLlm(
  llm: LlmService,
  input: {
    observationKind: 'sns' | 'poi';
    tavily: TavilySearchResponse;
  },
): Promise<ObservationExecutionResult> {
  const snippets = snippetsFromTavily(input.tavily, 12000);
  const schemaHint = `Return ONLY a JSON object with keys:
passability01 (0-1, 1=fully passable/safe access),
evidenceWeight (0-1, your confidence given source agreement),
routeSegmentInfeasible (boolean, true if road/area effectively unusable today),
poiOpen (boolean or null if unknown),
evidenceContradiction (boolean, true if reputable sources disagree materially),
affectedPoiIds (string[] optional corridor/POI ids mentioned),
summary (one sentence).`;
  const prompt = `${schemaHint}\n\nObservation type: ${input.observationKind}\n\n--- Evidence ---\n${snippets}`;

  const preferOpenAi = !!(process.env.OPENAI_API_KEY || '').trim();
  const provider = preferOpenAi ? LlmProvider.OPENAI : llm.getDefaultProvider();

  try {
    const tokenContext: LlmTokenContext = {
      request_id: 'tavily-observation',
      state_machine_step: 'RESEARCH',
      sub_agent: 'LocalInsight',
    };
    const raw = await llm.callLlmWithSchema(provider, prompt, undefined, tokenContext);
    const parsed = parseEvidenceJson(raw);
    if (parsed && typeof parsed.passability01 === 'number' && typeof parsed.evidenceWeight === 'number') {
      const contradiction = parsed.evidenceContradiction === true;
      let w = clamp01(parsed.evidenceWeight);
      if (contradiction) w *= 0.45;
      return {
        evidenceKind: contradiction ? 'station_forecast' : 'recent_social_image',
        passability01: clamp01(parsed.passability01),
        evidenceWeight: clamp01(w),
        evidenceContradiction: contradiction || undefined,
        routeSegmentInfeasible: !!parsed.routeSegmentInfeasible,
        poiOpen: parsed.poiOpen,
        affectedPoiIds: parsed.affectedPoiIds,
        summary: parsed.summary ?? 'LLM evidence scorer',
      };
    }
  } catch {
    // fall through
  }
  return scoreEvidenceHeuristic(input.observationKind, snippets);
}
