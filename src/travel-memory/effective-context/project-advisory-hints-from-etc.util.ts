/**
 * EffectiveTravelerContext → CGUS advisory DecisionHints（M3 软面）。
 *
 * 一律 advisoryOnly；禁止写成 hardConstraints。
 * active：下游 travelMemoryDecisionHints 以此为准。
 * shadow：仅对照 TMR hints，不替换线上 soft 注入。
 */

import type { TravelMemoryDecisionHintV1 } from '../context-assembly/selective-consume.util';
import type {
  EffectiveMemoryItemV1,
  EffectiveTravelerContextV1,
  EtcSoftHintsAuditV1,
} from './effective-traveler-context.types';
import { mayEnterSoftDecisionSurface } from './effective-memory-authority.util';

export type { EtcSoftHintsAuditV1 };
function memoryIdFromItem(item: EffectiveMemoryItemV1, fallback: string): string {
  const ref = item.sourceRefs.find((r) => r.startsWith('tmr.evidence:'));
  if (ref) return ref.slice('tmr.evidence:'.length);
  const first = item.sourceRefs[0];
  return first && first.trim() ? first : fallback;
}

function softEligible(item: EffectiveMemoryItemV1 | undefined): item is EffectiveMemoryItemV1 {
  return !!item && mayEnterSoftDecisionSurface(item.authority);
}

/**
 * 从 ETC.effective / items / advisoryHints 投影 soft hints。
 * 跳过 HABIT(CONTEXT)；CONSTRAINT/ADVISORY/PENALTY/UTILITY 可进 soft（一律 advisoryOnly）。
 * L2 pace → trip.paceOverride；L1 pace → travel.pace。
 */
export function projectAdvisoryHintsFromEffectiveContext(
  etc: EffectiveTravelerContextV1,
): TravelMemoryDecisionHintV1[] {
  const hints: TravelMemoryDecisionHintV1[] = [];
  const seen = new Set<string>();

  const push = (hint: TravelMemoryDecisionHintV1) => {
    if (seen.has(hint.key)) return;
    seen.add(hint.key);
    hints.push({ ...hint, advisoryOnly: true });
  };

  const pace = etc.effective.pace;
  if (softEligible(pace)) {
    if (pace.layer === 'L2_TRIP_OVERRIDE') {
      push({
        key: 'trip.paceOverride',
        value: pace.value,
        influence: 'TRIP_OVERRIDE',
        confidence: pace.confidence,
        memoryId: memoryIdFromItem(pace, 'etc.pace.l2'),
        advisoryOnly: true,
      });
    } else {
      push({
        key: 'travel.pace',
        value: pace.value,
        influence: 'PACE_CONSTRAINT',
        confidence: pace.confidence,
        memoryId: memoryIdFromItem(pace, 'etc.pace.l1'),
        advisoryOnly: true,
      });
    }
  }

  const risk = etc.effective.riskTolerance;
  if (softEligible(risk)) {
    push({
      key: 'decision.riskTolerance',
      value: risk.value,
      influence: 'RISK_PREFERENCE',
      confidence: risk.confidence,
      memoryId: memoryIdFromItem(risk, 'etc.risk'),
      advisoryOnly: true,
    });
  }

  const stay = etc.effective.accommodationMovement;
  if (softEligible(stay)) {
    push({
      key: 'travel.accommodationMovement',
      value: stay.value,
      influence: 'MEMBER_CONSTRAINT',
      confidence: stay.confidence,
      memoryId: memoryIdFromItem(stay, 'etc.stay'),
      advisoryOnly: true,
    });
  }

  const tmp = etc.items.find(
    (i) => i.key === 'temporary_constraints' && i.layer === 'L2_TRIP_OVERRIDE',
  );
  if (softEligible(tmp)) {
    push({
      key: 'trip.temporaryConstraints',
      value: tmp.value,
      influence: 'MEMBER_CONSTRAINT',
      confidence: tmp.confidence,
      memoryId: memoryIdFromItem(tmp, 'etc.trip.constraints'),
      advisoryOnly: true,
    });
  }

  // Episode / 其它 TMR advisory：只补 ETC 尚未覆盖的 key（尤其 episode.*）
  for (const h of etc.advisoryHints) {
    if (!h?.key || !h.advisoryOnly) continue;
    if (seen.has(h.key)) continue;
    // 结构化字段已由 effective 投影；跳过会被 L2 覆盖的旧 L1 pace
    if (h.key === 'travel.pace' && seen.has('trip.paceOverride')) continue;
    push({
      key: h.key,
      value: h.value,
      influence: h.influence,
      confidence: h.confidence,
      memoryId: h.memoryId,
      advisoryOnly: true,
    });
  }

  return hints;
}

export function buildEtcSoftHintsAudit(input: {
  mode: 'off' | 'shadow' | 'active';
  etcHints: TravelMemoryDecisionHintV1[];
  tmrHints: TravelMemoryDecisionHintV1[];
  softSource: 'tmr' | 'etc' | 'none';
  applied: boolean;
}): EtcSoftHintsAuditV1 {
  const etcHintKeys = input.etcHints.map((h) => h.key).sort();
  const tmrHintKeys = input.tmrHints.map((h) => h.key).sort();
  const etcSet = new Set(etcHintKeys);
  const tmrSet = new Set(tmrHintKeys);
  return {
    schemaId: 'tripnara.etc_soft_hints_audit@v1',
    version: 1,
    mode: input.mode,
    softSource: input.softSource,
    applied: input.applied,
    etcHintKeys,
    tmrHintKeys,
    keysOnlyInEtc: etcHintKeys.filter((k) => !tmrSet.has(k)),
    keysOnlyInTmr: tmrHintKeys.filter((k) => !etcSet.has(k)),
    etcHintCount: etcHintKeys.length,
    tmrHintCount: tmrHintKeys.length,
  };
}
