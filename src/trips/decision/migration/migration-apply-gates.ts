/**
 * Phase 3 前置：自动落地闸门（当前默认全部为 false，仅占位审计）。
 *
 * 至少需：economics 批准 + 模拟稳定 + booking 可存活 + 下游应力可接受。
 */

import type { ProposedCorridorMigration } from './proposed-corridor-migration.types';

const MAX_ACCEPTABLE_DOWNSTREAM_SHIFT_MIN = 360;
const MAX_TEMPORAL_STRESS = 0.92;

export interface MigrationApplyReadiness {
  allowed: boolean;
  reasons: string[];
}

export function evaluateMigrationApplyReadiness(
  proposal: ProposedCorridorMigration,
): MigrationApplyReadiness {
  const reasons: string[] = [];
  const sim = proposal.simulationPreview;
  if (!sim) {
    reasons.push('尚未附加 simulationPreview');
    return { allowed: false, reasons };
  }

  const blockingBookings = sim.bookingConflicts.filter(
    c => c.severity === 'BLOCKING',
  );
  if (blockingBookings.length > 0) {
    reasons.push(`booking：${blockingBookings.length} 条阻断冲突`);
  }

  if (sim.downstreamShiftMinutes > MAX_ACCEPTABLE_DOWNSTREAM_SHIFT_MIN) {
    reasons.push(
      `下游平移 ${sim.downstreamShiftMinutes}min 超过接受上限 ${MAX_ACCEPTABLE_DOWNSTREAM_SHIFT_MIN}`,
    );
  }

  const stress = sim.temporalStressDelta.ripplePressure01 ?? 0;
  if (stress > MAX_TEMPORAL_STRESS) {
    reasons.push(`temporal 应力 ${stress.toFixed(2)} 过高`);
  }

  return {
    allowed: reasons.length === 0,
    reasons,
  };
}
