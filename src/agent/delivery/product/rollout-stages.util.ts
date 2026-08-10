/**
 * V1 分阶段放量：Invite-only → 5% → 20% → 50% → 100%。
 * Trust/Safety 回归立即 Pause / Rollback。
 */

import type { ReleaseGateResultV1 } from './release-gate.util';

export const ROLLOUT_PLAN_SCHEMA = 'nara.v1_rollout_plan@v1' as const;

export type RolloutStageId =
  | 'INVITE_ONLY'
  | 'PCT_5'
  | 'PCT_20'
  | 'PCT_50'
  | 'PCT_100'
  | 'PAUSED'
  | 'ROLLED_BACK';

export const ROLLOUT_STAGE_ORDER: RolloutStageId[] = [
  'INVITE_ONLY',
  'PCT_5',
  'PCT_20',
  'PCT_50',
  'PCT_100',
];

export type RolloutPlanV1 = {
  schemaId: typeof ROLLOUT_PLAN_SCHEMA;
  version: 1;
  stage: RolloutStageId;
  percent: number;
  paused: boolean;
  rolledBack: boolean;
  architectureFreeze: true;
  historyZh: string[];
};

export function createInviteOnlyRollout(): RolloutPlanV1 {
  return {
    schemaId: ROLLOUT_PLAN_SCHEMA,
    version: 1,
    stage: 'INVITE_ONLY',
    percent: 0,
    paused: false,
    rolledBack: false,
    architectureFreeze: true,
    historyZh: ['Invite-only 启动'],
  };
}

function percentFor(stage: RolloutStageId): number {
  switch (stage) {
    case 'INVITE_ONLY':
      return 0;
    case 'PCT_5':
      return 5;
    case 'PCT_20':
      return 20;
    case 'PCT_50':
      return 50;
    case 'PCT_100':
      return 100;
    default:
      return 0;
  }
}

/**
 * 仅在 Release Gate 通过时可升阶段；Trust/Safety 问题 → Pause/Rollback。
 */
export function advanceRolloutStage(input: {
  plan: RolloutPlanV1;
  releaseGate: ReleaseGateResultV1;
}): RolloutPlanV1 {
  if (input.plan.paused || input.plan.rolledBack) {
    return {
      ...input.plan,
      historyZh: [
        ...input.plan.historyZh,
        '当前已 Pause/Rollback，禁止升量',
      ],
    };
  }
  if (!input.releaseGate.passed) {
    return {
      ...input.plan,
      historyZh: [
        ...input.plan.historyZh,
        `升量拒绝：Release Gate 未过 — ${input.releaseGate.reasonsZh[0] ?? ''}`,
      ],
    };
  }
  if (!input.releaseGate.safetyOk || !input.releaseGate.zeroToleranceOk) {
    return pauseOrRollbackRollout({
      plan: input.plan,
      reason: 'TRUST_SAFETY',
      mode: 'PAUSE',
      noteZh: 'Safety / 零容忍未过，禁止升量',
    });
  }

  const idx = ROLLOUT_STAGE_ORDER.indexOf(
    input.plan.stage as (typeof ROLLOUT_STAGE_ORDER)[number],
  );
  if (idx < 0 || idx >= ROLLOUT_STAGE_ORDER.length - 1) {
    return {
      ...input.plan,
      historyZh: [...input.plan.historyZh, '已在最高放量阶段或不可推进'],
    };
  }
  const next = ROLLOUT_STAGE_ORDER[idx + 1]!;
  return {
    ...input.plan,
    stage: next,
    percent: percentFor(next),
    historyZh: [
      ...input.plan.historyZh,
      `升量 ${input.plan.stage} → ${next} (${percentFor(next)}%)`,
    ],
  };
}

export function pauseOrRollbackRollout(input: {
  plan: RolloutPlanV1;
  reason: 'TRUST_SAFETY' | 'RELIABILITY' | 'EXPERIENCE';
  mode: 'PAUSE' | 'ROLLBACK';
  noteZh: string;
}): RolloutPlanV1 {
  if (input.mode === 'ROLLBACK') {
    return {
      ...input.plan,
      stage: 'ROLLED_BACK',
      percent: 0,
      paused: false,
      rolledBack: true,
      historyZh: [
        ...input.plan.historyZh,
        `ROLLBACK (${input.reason}): ${input.noteZh}`,
      ],
    };
  }
  return {
    ...input.plan,
    stage: 'PAUSED',
    paused: true,
    historyZh: [
      ...input.plan.historyZh,
      `PAUSE (${input.reason}): ${input.noteZh}`,
    ],
  };
}
