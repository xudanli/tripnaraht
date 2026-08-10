/**
 * Temporal Failure Attribution — 区分不准的根因类别。
 * STATE / EVIDENCE / PROJECTION / RULE_BOUNDARY / EXTERNAL_CHANGE / USER_BEHAVIOR / OBSERVATION_GAP
 */

import type { TemporalEvaluationV1 } from '../temporal-graduation/temporal-evaluation.util';
import type { OutcomeInterpretationV1 } from './outcome-interpretation.util';

export const TEMPORAL_FAILURE_ATTRIBUTION_SCHEMA =
  'nara.temporal_failure_attribution@v1' as const;

export type TemporalFailureCategory =
  | 'STATE'
  | 'EVIDENCE'
  | 'PROJECTION'
  | 'RULE_BOUNDARY'
  | 'EXTERNAL_CHANGE'
  | 'USER_BEHAVIOR'
  | 'OBSERVATION_GAP';

export type TemporalFailureAttributionV1 = {
  schemaId: typeof TEMPORAL_FAILURE_ATTRIBUTION_SCHEMA;
  version: 1;
  attributionId: string;
  impactId: string;
  primary: TemporalFailureCategory | 'NONE_SUCCESS';
  secondary?: TemporalFailureCategory[];
  rationaleZh: string;
  /** 成功样本不强制归因失败类 */
  isFailure: boolean;
};

export type TemporalFailureHintsV1 = {
  staleOrWeakWorldState?: boolean;
  insufficientOrWrongEvidence?: boolean;
  ruleOutsideContractBoundary?: boolean;
  projectionLogicSuspect?: boolean;
};

/**
 * 对不准样本归因；准样本标记 NONE_SUCCESS。
 */
export function attributeTemporalFailure(input: {
  evaluation: TemporalEvaluationV1;
  interpretation?: OutcomeInterpretationV1 | null;
  hints?: TemporalFailureHintsV1;
  attributionId?: string;
}): TemporalFailureAttributionV1 {
  const ev = input.evaluation;
  const interp = input.interpretation;
  const hints = input.hints ?? {};
  const isFailure =
    !ev.directionHit ||
    (!!ev.falseAlert && (interp?.mayCountAsFalseAlert ?? true)) ||
    (!!ev.missedDeterioration &&
      (interp?.mayCountAsMissedDeterioration ?? true));

  if (!isFailure || interp?.inconclusive) {
    if (interp?.inconclusive) {
      const primary: TemporalFailureCategory = interp.hints.observationGap
        ? 'OBSERVATION_GAP'
        : interp.hints.userTrajectoryChanged
          ? 'USER_BEHAVIOR'
          : interp.hints.externalRealityChanged
            ? 'EXTERNAL_CHANGE'
            : 'OBSERVATION_GAP';
      return {
        schemaId: TEMPORAL_FAILURE_ATTRIBUTION_SCHEMA,
        version: 1,
        attributionId:
          input.attributionId ?? `tfa_${ev.impactId}_inconclusive`,
        impactId: ev.impactId,
        primary,
        rationaleZh: interp.reasonZh,
        isFailure: false,
      };
    }
    return {
      schemaId: TEMPORAL_FAILURE_ATTRIBUTION_SCHEMA,
      version: 1,
      attributionId: input.attributionId ?? `tfa_${ev.impactId}_ok`,
      impactId: ev.impactId,
      primary: 'NONE_SUCCESS',
      rationaleZh: '方向/告警对账可接受，不记失败归因',
      isFailure: false,
    };
  }

  const secondary: TemporalFailureCategory[] = [];
  let primary: TemporalFailureCategory = 'PROJECTION';
  let rationaleZh = '预测与可比观测不一致，默认归因投影误差';

  if (hints.staleOrWeakWorldState) {
    primary = 'STATE';
    rationaleZh = '预测时 WorldState 质量不足或陈旧';
  } else if (hints.insufficientOrWrongEvidence) {
    primary = 'EVIDENCE';
    rationaleZh = '预测时 Evidence 不足或关键信号错误';
  } else if (hints.ruleOutsideContractBoundary) {
    primary = 'RULE_BOUNDARY';
    rationaleZh = '事件落在 deterministic 规则边界之外';
  } else if (hints.projectionLogicSuspect) {
    primary = 'PROJECTION';
    rationaleZh = '规则投影逻辑与真实方向不符';
  } else if (interp?.hints.userTrajectoryChanged) {
    primary = 'USER_BEHAVIOR';
    rationaleZh = '用户行为变化导致偏离（若仍计失败则次级）';
  } else if (interp?.hints.externalRealityChanged) {
    primary = 'EXTERNAL_CHANGE';
    rationaleZh = '外部环境变化导致偏离';
  } else if (interp?.hints.observationGap) {
    primary = 'OBSERVATION_GAP';
    rationaleZh = '观测缺口导致无法可靠对账';
  } else if (ev.falseAlert) {
    primary = 'PROJECTION';
    rationaleZh = 'False Alert：投影过度告警';
  } else if (ev.missedDeterioration) {
    primary = 'PROJECTION';
    rationaleZh = 'Missed Deterioration：投影漏检恶化';
  }

  if (primary !== 'EVIDENCE' && hints.insufficientOrWrongEvidence) {
    secondary.push('EVIDENCE');
  }
  if (primary !== 'STATE' && hints.staleOrWeakWorldState) {
    secondary.push('STATE');
  }

  return {
    schemaId: TEMPORAL_FAILURE_ATTRIBUTION_SCHEMA,
    version: 1,
    attributionId: input.attributionId ?? `tfa_${ev.impactId}`,
    impactId: ev.impactId,
    primary,
    secondary: secondary.length ? secondary : undefined,
    rationaleZh,
    isFailure: true,
  };
}
