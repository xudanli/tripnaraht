import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { DeltaTargetType, PlanDeltaIR } from '../contracts/plan-delta-ir.types';

const TARGET_TO_DELTA_NODE: Record<string, DeltaTargetType> = {
  hotel: 'HOTEL',
  accommodation: 'HOTEL',
  flight: 'FLIGHT',
  poi: 'POI',
  attraction: 'POI',
  sightseeing: 'POI',
  activity: 'POI',
  destination: 'ROUTE_CONSTRAINT',
  route: 'ROUTE_CONSTRAINT',
  segment: 'ROUTE_CONSTRAINT',
  constraint: 'ROUTE_CONSTRAINT',
  restriction: 'RESTRICTION',
  visa: 'RESTRICTION',
  policy: 'RESTRICTION',
};

function mapModificationTargetToDeltaNode(raw: string): DeltaTargetType | null {
  const k = String(raw ?? '').trim().toLowerCase();
  return TARGET_TO_DELTA_NODE[k] ?? null;
}

/** 从中文/数字消息中提取 0-based dayIndex（如「第二天」→ 1） */
export function extractDayIndexFromMessage(message: string): number | undefined {
  const zhNums: Record<string, number> = {
    一: 0,
    二: 1,
    三: 2,
    四: 3,
    五: 4,
    六: 5,
    七: 6,
    八: 7,
    九: 8,
    十: 9,
  };
  const m = String(message ?? '').match(/第([一二三四五六七八九十\d]+)天/);
  if (!m) return undefined;
  const token = m[1];
  if (/^\d+$/.test(token)) {
    const n = Number(token);
    return n > 0 ? n - 1 : undefined;
  }
  if (token.length === 1 && zhNums[token] !== undefined) {
    return zhNums[token];
  }
  return undefined;
}

/**
 * 过渡期：将 legacy `itinerary_context` + `modification_targets` 编译为 PlanDeltaIR 列表。
 * Step 2 完成后由 LLMIntentCompiler 取代。
 */
export function compileLegacyPlanDeltaFromRequest(request: RouteAndRunRequestDto): PlanDeltaIR[] {
  const opt = request.options;
  if (!opt) return [];

  const isReplan = opt.itinerary_context?.is_replan === true;
  const ref = opt.refinement_signal?.type;
  const gatedByRefinement = ref === 'REPLACEMENT' || ref === 'REMOVAL' || ref === 'ADDITION';
  if (!isReplan && !gatedByRefinement) return [];

  const targets = opt.intent_flags?.modification_targets;
  if (!Array.isArray(targets) || targets.length === 0) return [];

  const op =
    ref === 'REMOVAL' ? 'REMOVE' : ref === 'ADDITION' ? 'ADD' : 'REPLACE';

  const dayIndex = extractDayIndexFromMessage(request.message ?? '');

  const out: PlanDeltaIR[] = [];
  for (const raw of targets) {
    const nodeType = mapModificationTargetToDeltaNode(String(raw));
    if (!nodeType) continue;
    out.push({
      op,
      target: {
        type: nodeType,
        ...(dayIndex !== undefined ? { dayIndex } : {}),
      },
      payload: {
        query: request.message?.trim() || undefined,
        patchMeta: { source: 'legacy_nlu_compiler' },
      },
    });
  }
  return out;
}
