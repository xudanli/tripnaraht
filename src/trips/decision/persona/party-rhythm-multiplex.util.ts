/**
 * Party Rhythm Multiplex — Dr.Dre 时段复用：物理木桶 + 心理波峰交替。
 */

import type { ExperienceFlowModel } from '../models/experience-flow.model';
import type { PaceConstraints } from '../interfaces/day-profile.interface';
import type { DecisionLogEntry } from '../shared/decision-result.types';
import type { WorldModelContext } from '../shared/world-model.types';

function parseHour(slotHint: string): number {
  const start = slotHint.split('-')[0]?.trim() ?? '12:00';
  const [h] = start.split(':');
  const hour = Number(h);
  return Number.isFinite(hour) ? hour : 12;
}

/**
 * 按日解析派对节奏对 PaceConstraints 的调制（白天松弛 / 晚间探险）。
 */
export function resolveDayPaceWithPartyRhythm(
  world: WorldModelContext,
  basePace: PaceConstraints,
  options?: { dayIndex?: number; date?: string },
): PaceConstraints {
  const multiplex = world.partyAggregation?.rhythmMultiplexPlan;
  const flow = world.partyAggregation?.effectiveExperienceFlow ?? world.experienceFlow;
  if (!multiplex?.length && !flow) return basePace;

  const tempo = flow?.tempo;

  const dayRows = multiplex?.filter(
    (r) => !options?.date || !r.date || r.date === options.date,
  );

  const elderlyDominantDaytime = dayRows?.some(
    (r) => r.tempo === 'EMPATHY_RECOVERY' && parseHour(r.slotHint) < 18,
  );
  const eveningAdventure = dayRows?.some(
    (r) => r.tempo === 'ACCELERATED' && parseHour(r.slotHint) >= 18,
  );

  if (elderlyDominantDaytime || tempo === 'EMPATHY_RECOVERY') {
    return {
      ...basePace,
      maxDailyDistanceKm: Math.min(basePace.maxDailyDistanceKm, 16),
      maxMovingHours: Math.min(basePace.maxMovingHours, 7),
    };
  }

  if (eveningAdventure) {
    return {
      ...basePace,
      maxMovingHours: Math.min(basePace.maxMovingHours + 1, 11),
    };
  }

  return basePace;
}

export function buildPartyRhythmDecisionLogs(world: WorldModelContext): DecisionLogEntry[] {
  const plan = world.partyAggregation?.rhythmMultiplexPlan;
  if (!plan?.length) return [];

  return plan.slice(0, 4).map((row) => ({
    persona: 'DR_DRE',
    action: 'EVALUATE',
    explanation: `派对节奏时分复用：${row.slotHint} 由成员 ${row.dominantMemberId} 主导（${tempoLabelZh(row.tempo)}）`,
    reasonCodes: ['PARTY_RHYTHM_TDM', row.tempo],
    evidenceRefs: ['partyAggregation.rhythmMultiplexPlan'],
    timestamp: new Date().toISOString(),
    decisionSource: 'HUMAN',
    decisionStage: 'PACE_ADJUST',
    metadata: {
      dominantMemberId: row.dominantMemberId,
      slotHint: row.slotHint,
      tempo: row.tempo,
      rationale: row.rationale,
    },
  }));
}

function tempoLabelZh(tempo: ExperienceFlowModel['tempo']): string {
  switch (tempo) {
    case 'EMPATHY_RECOVERY':
      return '松弛恢复';
    case 'ACCELERATED':
      return '探险加速';
    default:
      return '均衡';
  }
}
