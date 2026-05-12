import type { AxiomId, AxiomSchema } from './axiom-schema';
import { AXIOM_REGISTRY } from './axiom-registry';

export interface AxiomMatchContext {
  message?: string;
  constraints?: Record<string, any> | undefined;
}

export interface AxiomMatchResult {
  axiom: AxiomSchema;
  axiom_id: AxiomId;
  /** Arbitrary extracted evidence to populate L3 proof & audit. */
  evidence: Record<string, any>;
}

function msg(s: unknown): string {
  return String(s ?? '').trim();
}

function detectVehicleType(input: { message?: string; constraints?: Record<string, any> }): '2WD' | '4WD' | '' {
  const c = String(input.constraints?.vehicle_type ?? '').toUpperCase();
  if (c === '2WD' || c === '4WD') return c as any;
  const m = msg(input.message);
  if (/4wd|4x4|四驱/i.test(m)) return '4WD';
  if (/2wd|两驱/i.test(m)) return '2WD';
  return '';
}

function wantsFRoad(message?: string): boolean {
  const m = msg(message);
  if (!m) return false;
  return /\bf-?road\b/i.test(m) || /\bF\d{2,4}\b/i.test(m) || /高地|内陆|山地|河渡|涉水/i.test(m);
}

export function matchAxioms(ctx: AxiomMatchContext): AxiomMatchResult[] {
  const out: AxiomMatchResult[] = [];

  // 1) TERRAIN_F_ROAD_UNFIT
  try {
    const vehicle = detectVehicleType({ message: ctx.message, constraints: ctx.constraints });
    const wants = wantsFRoad(ctx.message);
    if (wants && vehicle === '2WD') {
      out.push({
        axiom: AXIOM_REGISTRY.TERRAIN_F_ROAD_UNFIT,
        axiom_id: 'TERRAIN_F_ROAD_UNFIT',
        evidence: {
          vehicle_type: '2WD',
          requires_4wd: true,
          intent_froad: true,
        },
      });
    }
  } catch {
    // best-effort
  }

  // 2) FATIGUE_OVERLOAD (v2.0 minimal heuristic: long driving intent)
  // NOTE: real proof-carrying evidence will be filled from verifier/repair later;
  // here we only provide a match hook so sim/real can share the same label.
  try {
    const m = msg(ctx.message);
    // Heuristic tokens: "10 小时驾驶"/"12h driving"/"连续驾驶"
    const drivingHours =
      (() => {
        // Support both orders:
        // - "12 小时驾驶" / "12h driving"
        // - "驾驶 12 小时" / "driving 12h"
        const a = m.match(/(\d+(?:\.\d+)?)\s*(?:h|小时)\s*(?:驾驶|driving)/i);
        if (a) return Number(a[1]);
        const b = m.match(/(?:驾驶|driving)\s*(\d+(?:\.\d+)?)\s*(?:h|小时)/i);
        if (b) return Number(b[1]);
        return undefined;
      })() ?? undefined;
    if (typeof drivingHours === 'number' && Number.isFinite(drivingHours) && drivingHours >= 10) {
      out.push({
        axiom: AXIOM_REGISTRY.FATIGUE_OVERLOAD,
        axiom_id: 'FATIGUE_OVERLOAD',
        evidence: {
          planned_duration_minutes: Math.round(drivingHours * 60),
        },
      });
    }
  } catch {
    // best-effort
  }

  // 3) ETA_INFEASIBLE (v2.0 minimal heuristic: tight time window intent)
  try {
    const m = msg(ctx.message);
    // Tokens: "赶不上/必须在xx前到/日落前"
    const wantsBy = /赶不上|必须在.+前到|日落前|latest\s+arrival/i.test(m);
    if (wantsBy) {
      out.push({
        axiom: AXIOM_REGISTRY.ETA_INFEASIBLE,
        axiom_id: 'ETA_INFEASIBLE',
        evidence: {
          intent_time_window: true,
        },
      });
    }
  } catch {
    // best-effort
  }

  return out;
}

export function pickDominantAxiom(matches: AxiomMatchResult[]): AxiomMatchResult | undefined {
  if (!Array.isArray(matches) || matches.length === 0) return undefined;
  // minimal deterministic priority: P0 > P1 > P2, otherwise first
  const score = (a: AxiomMatchResult) => (a.axiom.severity === 'P0' ? 0 : a.axiom.severity === 'P1' ? 1 : 2);
  return [...matches].sort((a, b) => score(a) - score(b))[0];
}

