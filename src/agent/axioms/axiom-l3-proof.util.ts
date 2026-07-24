import type { AxiomId } from './axiom-schema';
import type { AxiomMetricDetails } from './axiom-schema';
import type { AxiomMatchResult } from './axiom-matchers';

function round(n: number, d = 2): number {
  const p = 10 ** d;
  return Math.round(n * p) / p;
}

export function inferMetricDetailsFromMatch(match: AxiomMatchResult): AxiomMetricDetails {
  const existing = match.evidence.metric_details;
  if (existing) return existing;

  const ev = match.evidence;
  switch (match.axiom_id as AxiomId) {
    case 'TERRAIN_F_ROAD_UNFIT':
      return { actual: 2, limit: 4, unit: 'WD', cmp: 'GEQ', slack: -2 };
    case 'FATIGUE_OVERLOAD': {
      const plannedMin = Number(ev.planned_duration_minutes);
      const actualH = Number.isFinite(plannedMin) ? plannedMin / 60 : 10;
      const limitH = 8;
      return {
        actual: round(actualH, 2),
        limit: limitH,
        unit: 'h',
        cmp: 'LEQ',
        slack: round(limitH - actualH, 2),
      };
    }
    case 'ETA_INFEASIBLE':
      return { actual: 1, limit: 0, unit: 'bool', cmp: 'LEQ', slack: -1 };
    default:
      return { actual: 0, limit: 0, unit: 'bool', cmp: 'LEQ', slack: 0 };
  }
}

/** Canonical L3-PROOF prefix aligned with verify-executor / audit parsers. */
export function buildL3ProofPrefixFromMatch(match: AxiomMatchResult, entityId: string): string {
  const md = inferMetricDetailsFromMatch(match);
  const source = String(match.evidence.match_source ?? 'HEURISTIC');
  return (
    `[L3-PROOF|${match.axiom.cid}|${entityId}|cmp:${md.cmp}|actual:${md.actual}|limit:${md.limit}|unit:${md.unit}|slack:${md.slack}|evidence:${source}]`
  );
}
