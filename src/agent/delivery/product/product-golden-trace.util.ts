/**
 * Product Golden 管线 — NL → Canonical Result → Card → CTA → Confirm → Apply → Receipt → 页面刷新。
 * 验收单位：用户任务闭环（Capability Ready ≠ Product Ready）。
 */

import type {
  V1JourneyId,
  V1ProductStageId,
} from './v1-journey-contract.util';
import { getV1JourneyContract, V1_PRODUCT_STAGES } from './v1-journey-contract.util';

export const PRODUCT_GOLDEN_TRACE_SCHEMA =
  'nara.v1_product_golden_trace@v1' as const;

export type ProductStageEvidenceV1 = {
  stage: V1ProductStageId;
  present: boolean;
  refId?: string;
  summaryZh?: string;
};

export type ProductGoldenTraceV1 = {
  schemaId: typeof PRODUCT_GOLDEN_TRACE_SCHEMA;
  version: 1;
  goldenId: string;
  journeyId: V1JourneyId;
  naturalLanguageInputZh: string;
  stages: ProductStageEvidenceV1[];
  /** 用户无需理解内部架构即可完成 */
  userNeedNotUnderstandInternalArchitecture: true;
  capabilityReadyIsNotProductReady: true;
  silentApplyAttempted: boolean;
  autoApplyAttempted: boolean;
  autoCancelAttempted: boolean;
  autoRerouteAttempted: boolean;
};

export type ProductGoldenVerdictV1 = {
  passed: boolean;
  missingStages: V1ProductStageId[];
  forbiddenViolations: string[];
  reasonsZh: string[];
  acceptanceUnit: 'USER_TASK_CLOSED_LOOP';
};

export function createProductGoldenTrace(input: {
  goldenId: string;
  journeyId: V1JourneyId;
  naturalLanguageInputZh: string;
  stageEvidence: Partial<Record<V1ProductStageId, Omit<ProductStageEvidenceV1, 'stage'>>>;
  silentApplyAttempted?: boolean;
  autoApplyAttempted?: boolean;
  autoCancelAttempted?: boolean;
  autoRerouteAttempted?: boolean;
}): ProductGoldenTraceV1 {
  const stages: ProductStageEvidenceV1[] = V1_PRODUCT_STAGES.map((stage) => {
    const ev = input.stageEvidence[stage];
    return {
      stage,
      present: !!ev?.present,
      refId: ev?.refId,
      summaryZh: ev?.summaryZh,
    };
  });
  return {
    schemaId: PRODUCT_GOLDEN_TRACE_SCHEMA,
    version: 1,
    goldenId: input.goldenId,
    journeyId: input.journeyId,
    naturalLanguageInputZh: input.naturalLanguageInputZh,
    stages,
    userNeedNotUnderstandInternalArchitecture: true,
    capabilityReadyIsNotProductReady: true,
    silentApplyAttempted: !!input.silentApplyAttempted,
    autoApplyAttempted: !!input.autoApplyAttempted,
    autoCancelAttempted: !!input.autoCancelAttempted,
    autoRerouteAttempted: !!input.autoRerouteAttempted,
  };
}

/**
 * 按 Journey 合同核验产品 Golden（非内部 Runtime 完成度）。
 */
export function evaluateProductGoldenTrace(
  trace: ProductGoldenTraceV1,
): ProductGoldenVerdictV1 {
  const contract = getV1JourneyContract(trace.journeyId);
  const byStage = new Map(trace.stages.map((s) => [s.stage, s]));
  const missingStages = contract.requiredStages.filter(
    (s) => !byStage.get(s)?.present,
  );

  const forbiddenViolations: string[] = [];
  if (trace.silentApplyAttempted) {
    forbiddenViolations.push('silent_apply_forbidden');
  }
  if (trace.autoApplyAttempted) {
    forbiddenViolations.push('auto_apply_closed');
  }
  if (trace.autoCancelAttempted) {
    forbiddenViolations.push('auto_cancel_closed');
  }
  if (trace.autoRerouteAttempted) {
    forbiddenViolations.push('auto_reroute_closed');
  }

  const reasonsZh: string[] = [];
  if (!trace.naturalLanguageInputZh.trim() && trace.journeyId !== 'PROACTIVE') {
    reasonsZh.push('缺少自然语言输入（用户任务入口）');
  }
  for (const s of missingStages) {
    reasonsZh.push(`产品闭环缺阶段: ${s}`);
  }
  for (const v of forbiddenViolations) {
    reasonsZh.push(`禁止行为: ${v}`);
  }

  const passed = reasonsZh.length === 0;
  if (passed) {
    reasonsZh.push(
      `Journey ${trace.journeyId} 产品 Golden 通过：用户任务闭环完整（Capability Ready ≠ Product Ready）`,
    );
  }

  return {
    passed,
    missingStages,
    forbiddenViolations,
    reasonsZh,
    acceptanceUnit: 'USER_TASK_CLOSED_LOOP',
  };
}
