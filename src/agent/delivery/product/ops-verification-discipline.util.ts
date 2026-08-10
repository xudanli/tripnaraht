/**
 * 运营验证期纪律 — 任何动作必须能回答：
 * 被哪一个真实 Trip / Incident / 用户行为证据触发？
 * 回答不了 → 先不做。
 */

export const OPS_VERIFICATION_DISCIPLINE_SCHEMA =
  'nara.ops_verification_discipline@v1' as const;

export type OpsActionTriggerV1 = {
  tripId: string;
  incidentId?: string;
  userBehaviorEvidenceRef: string;
  summaryZh: string;
};

export type OpsActionAdmissionV1 =
  | {
      ok: true;
      trigger: OpsActionTriggerV1;
      phase: 'OPERATIONS_VERIFICATION';
      engineeringRoadmapComplete: true;
    }
  | {
      ok: false;
      code: 'NO_REAL_TRIGGER_EVIDENCE';
      reasonZh: string;
      doNotProceed: true;
    };

/**
 * 门禁：无真实 Trip + 证据 → 不做。
 */
export function admitOpsVerificationAction(input: {
  tripId?: string;
  incidentId?: string;
  userBehaviorEvidenceRef?: string;
  summaryZh: string;
}): OpsActionAdmissionV1 {
  if (
    !input.tripId?.trim() ||
    !input.userBehaviorEvidenceRef?.trim()
  ) {
    return {
      ok: false,
      code: 'NO_REAL_TRIGGER_EVIDENCE',
      reasonZh:
        '回答不了「被哪一个真实 Trip / Incident / 用户行为证据触发」→ 先不做',
      doNotProceed: true,
    };
  }
  return {
    ok: true,
    trigger: {
      tripId: input.tripId,
      incidentId: input.incidentId,
      userBehaviorEvidenceRef: input.userBehaviorEvidenceRef,
      summaryZh: input.summaryZh,
    },
    phase: 'OPERATIONS_VERIFICATION',
    engineeringRoadmapComplete: true,
  };
}

/** 主循环：Use → Observe → Diagnose → Fix → Verify → Release */
export const OPS_MAIN_LOOP = [
  'USE',
  'OBSERVE',
  'DIAGNOSE',
  'FIX',
  'VERIFY',
  'RELEASE',
] as const;

export type OpsMainLoopStep = (typeof OPS_MAIN_LOOP)[number];
