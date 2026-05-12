/**
 * Multi-Constraint Fusion：多域输出 → 槽位级世界状态
 */

import type { ConstraintDomainOutput } from './constraint-domain-output.types';
import type { SlotConstraintFusionTraceV0 } from './fusion-trace.types';
import type { SemanticImpactDeclaration } from '../decision/execution/semantic-impact.types';

export interface SlotConstraintState {
  readonly slotId: string;
  isBlocked: boolean;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  blockingDomains: string[];
  riskScore: number;
}

const SEV_RANK: Record<'LOW' | 'MEDIUM' | 'HIGH', number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
};

function maxSeverity(
  a: 'LOW' | 'MEDIUM' | 'HIGH',
  b: 'LOW' | 'MEDIUM' | 'HIGH',
): 'LOW' | 'MEDIUM' | 'HIGH' {
  return SEV_RANK[b] > SEV_RANK[a] ? b : a;
}

export function fuseConstraints(
  inputs: readonly ConstraintDomainOutput[],
): Map<string, SlotConstraintState> {
  const slotMap = new Map<string, SlotConstraintState>();

  for (const input of inputs) {
    for (const slotId of input.affectedSlots) {
      const sid = String(slotId).trim();
      if (!sid) continue;

      const existing =
        slotMap.get(sid) ??
        ({
          slotId: sid,
          isBlocked: false,
          severity: 'LOW' as const,
          blockingDomains: [] as string[],
          riskScore: 0,
        } satisfies SlotConstraintState);

      if (input.blocking) {
        existing.isBlocked = true;
        if (!existing.blockingDomains.includes(input.domain)) {
          existing.blockingDomains.push(input.domain);
        }
      }

      existing.severity = maxSeverity(existing.severity, input.severity);
      existing.riskScore += input.severity === 'HIGH' ? 1 : 0.3;

      slotMap.set(sid, existing);
    }
  }

  return slotMap;
}

export function buildSlotBlockedSemanticDelta(fused: Map<string, SlotConstraintState>): {
  kind: 'SLOT_BLOCKED';
  payload: {
    blockedSlots: ReadonlyArray<{
      slotId: string;
      blockingDomains: readonly string[];
      severity: 'LOW' | 'MEDIUM' | 'HIGH';
      riskScore: number;
    }>;
  };
  impact: SemanticImpactDeclaration;
} {
  const blockedSlots = [...fused.entries()]
    .filter(([, s]) => s.isBlocked)
    .map(([slotId, s]) => ({
      slotId,
      blockingDomains: [...new Set(s.blockingDomains)] as readonly string[],
      severity: s.severity,
      riskScore: s.riskScore,
    }));

  return {
    kind: 'SLOT_BLOCKED',
    payload: { blockedSlots },
    impact: {
      affectedDomains: ['CONSTRAINT_FUSION'],
      impactScope: 'GLOBAL',
    },
  };
}

export function buildSlotConstraintFusionTrace(
  fused: Map<string, SlotConstraintState>,
): SlotConstraintFusionTraceV0 {
  const blockedSlots = [...fused.entries()]
    .filter(([, s]) => s.isBlocked)
    .map(([slotId, s]) => ({
      slotId,
      blockingDomains: [...new Set(s.blockingDomains)] as readonly string[],
      severity: s.severity,
      riskScore: s.riskScore,
    }));

  const hasMultiDomainHardConflict = blockedSlots.some(
    (b) =>
      b.blockingDomains.includes('ROAD') &&
      b.blockingDomains.includes('WEATHER'),
  );

  return {
    fusionVersion: '1',
    blockedSlots,
    hasMultiDomainHardConflict,
  };
}
