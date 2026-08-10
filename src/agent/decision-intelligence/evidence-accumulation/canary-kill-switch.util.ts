/**
 * Auto Pause / Kill Switch — Safety / Hard Constraint / Unauthorized Mutation 回归立即回退 Production。
 */

import type { CanaryExperimentV1 } from './canary-experiment.util';

export const CANARY_KILL_SWITCH_SCHEMA = 'nara.canary_kill_switch@v1' as const;

export type KillSwitchTrigger =
  | 'SAFETY_REGRESSION'
  | 'FEASIBILITY_REGRESSION'
  | 'HARD_CONSTRAINT_BREACH'
  | 'UNAUTHORIZED_MUTATION';

export type KillSwitchAction = 'PAUSE' | 'KILL_ROLLBACK_PRODUCTION';

export type KillSwitchEventV1 = {
  schemaId: typeof CANARY_KILL_SWITCH_SCHEMA;
  version: 1;
  eventId: string;
  experimentId: string;
  trigger: KillSwitchTrigger;
  action: KillSwitchAction;
  at: string;
  detailZh: string;
  channelForced: 'PRODUCTION';
};

export type KillSwitchEvalInput = {
  experiment: CanaryExperimentV1;
  safetyRegressed?: boolean;
  feasibilityRegressed?: boolean;
  hardConstraintBreached?: boolean;
  unauthorizedMutation?: boolean;
};

export function evaluateCanaryKillSwitch(
  input: KillSwitchEvalInput,
): {
  triggered: boolean;
  event?: KillSwitchEventV1;
  nextExperiment: CanaryExperimentV1;
} {
  const exp = input.experiment;
  let trigger: KillSwitchTrigger | null = null;
  let detailZh = '';

  if (input.unauthorizedMutation && exp.rollback.onUnauthorizedMutation) {
    trigger = 'UNAUTHORIZED_MUTATION';
    detailZh = '检测到未授权 Policy/Gate/Constraint 变更';
  } else if (input.hardConstraintBreached && exp.rollback.onHardConstraintBreach) {
    trigger = 'HARD_CONSTRAINT_BREACH';
    detailZh = 'Hard Constraint / Gate BLOCK / Safety 被触碰';
  } else if (input.safetyRegressed && exp.rollback.onSafetyRegression) {
    trigger = 'SAFETY_REGRESSION';
    detailZh = 'Safety 指标相对 Production 退化';
  } else if (
    input.feasibilityRegressed &&
    exp.rollback.onFeasibilityRegression
  ) {
    trigger = 'FEASIBILITY_REGRESSION';
    detailZh = 'Feasibility 指标相对 Production 退化';
  }

  if (!trigger) {
    return { triggered: false, nextExperiment: exp };
  }

  const action: KillSwitchAction =
    trigger === 'SAFETY_REGRESSION' ||
    trigger === 'HARD_CONSTRAINT_BREACH' ||
    trigger === 'UNAUTHORIZED_MUTATION'
      ? 'KILL_ROLLBACK_PRODUCTION'
      : 'PAUSE';

  const event: KillSwitchEventV1 = {
    schemaId: CANARY_KILL_SWITCH_SCHEMA,
    version: 1,
    eventId: `kill_${exp.experimentId}_${Date.now()}`,
    experimentId: exp.experimentId,
    trigger,
    action,
    at: new Date().toISOString(),
    detailZh,
    channelForced: 'PRODUCTION',
  };

  const nextExperiment: CanaryExperimentV1 = {
    ...exp,
    status: action === 'PAUSE' ? 'PAUSED' : 'KILLED',
    exposure: { ...exp.exposure, trafficFraction: 0 },
  };

  return { triggered: true, event, nextExperiment };
}
