/**
 * simulateCorridorMigration — 预测迁移后的世界结构（后果场），非迁移动作本身。
 */

import { createHash } from 'node:crypto';
import type { TripPlan } from '../plan-model';
import type { ProposedCorridorMigration } from './proposed-corridor-migration.types';
import type { MigrationSimulationResult } from './migration-simulation.types';

function sumSequenceDriftMinutes(plan: TripPlan): number {
  const drifts = plan.temporal?.timeDrifts ?? [];
  return drifts
    .filter(d => d.propagationPolicy === 'PROPAGATE_SEQUENCE')
    .reduce((s, d) => s + Math.max(0, d.deltaMinutes), 0);
}

function crossDayDriftMinutes(plan: TripPlan): number {
  const drifts = plan.temporal?.timeDrifts ?? [];
  return drifts
    .filter(d => d.propagationPolicy === 'PROPAGATE_CROSS_DAY')
    .reduce((s, d) => s + Math.max(0, d.deltaMinutes), 0);
}

/**
 * 走廊夜间迁移的启发式驾驶 / 重锚成本 minutes（与 evaluator 默认南岸走廊一致量级）。
 */
const CORRIDOR_NIGHT_DRIVE_SURCHARGE_MIN = 150;

export function simulateCorridorMigration(
  proposal: ProposedCorridorMigration,
  plan: TripPlan,
): MigrationSimulationResult {
  const seq = sumSequenceDriftMinutes(plan);
  const cross = crossDayDriftMinutes(plan);

  const downstreamShiftMinutes = Math.round(
    CORRIDOR_NIGHT_DRIVE_SURCHARGE_MIN + seq * 0.25 + cross * 0.35,
  );

  const bookingConflicts: MigrationSimulationResult['bookingConflicts'] = [];
  for (const date of proposal.affectedDates) {
    const day = plan.days.find(d => d.date === date);
    const lockedHotel = day?.timeSlots.some(
      s => s.type === 'hotel' && s.locked,
    );
    if (lockedHotel) {
      bookingConflicts.push({
        date,
        severity: 'BLOCKING',
        reason: '目标日存在 locked 住宿锚点，走廊迁移需改订或解锁后才能落地',
      });
    }
  }

  const ripplePressure = Math.min(
    1,
    (seq + cross) / 280,
  );

  const temporalStressDelta = {
    ripplePressure01: ripplePressure,
    sequenceBackpressureMinutes: seq,
    notes: [
      `PROPAGATE_SEQUENCE≈${Math.round(seq)}min，PROPAGATE_CROSS_DAY≈${Math.round(cross)}min → 占位应力`,
    ],
  };

  return {
    downstreamShiftMinutes,
    bookingConflicts,
    estimatedOpportunityGain: deriveEstimatedGainFromProposal(proposal),
    temporalStressDelta,
  };
}

function deriveEstimatedGainFromProposal(p: ProposedCorridorMigration): number {
  if (typeof p.expectedOpportunityGain === 'number') {
    return Math.max(0, Math.min(1, p.expectedOpportunityGain));
  }
  const raw = p.economicApproval.tradeoffScore;
  return Math.max(0, Math.min(1, raw + 0.35));
}

/**
 * Step 2：对每条提案附加后果模拟（仍不落库、不改 plan）。
 */
export function enrichProposalsWithSimulation(
  proposals: ProposedCorridorMigration[],
  plan: TripPlan,
): ProposedCorridorMigration[] {
  return proposals.map(p => ({
    ...p,
    simulationPreview: simulateCorridorMigration(p, plan),
  }));
}

export function proposalStableHash(input: {
  sourceRegion: string;
  targetRegion: string;
  dates: readonly string[];
}): string {
  const payload = `${input.sourceRegion}|${input.targetRegion}|${[...input.dates].sort().join(',')}`;
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}
