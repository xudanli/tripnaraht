/**
 * 能力新增门禁 — 防止重新堆功能。
 * Evidence → 证明任务存在 → 证明现有系统解决不了 →
 * Bug / Data / UX / Existing Capability Gap；仅最后一类才可考虑新增能力。
 */

export const CAPABILITY_ADDITION_GATE_SCHEMA =
  'nara.capability_addition_gate@v1' as const;

export type CapabilityGapClass =
  | 'BUG'
  | 'DATA'
  | 'UX'
  | 'EXISTING_CAPABILITY_GAP'
  | 'NEW_CAPABILITY_CANDIDATE';

export type CapabilityAdditionGateResultV1 =
  | {
      ok: false;
      code:
        | 'NO_EVIDENCE'
        | 'TASK_NOT_PROVEN'
        | 'EXISTING_SYSTEM_SUFFICIENT'
        | 'CLASSIFIED_AS_BUG_DATA_OR_UX';
      class?: CapabilityGapClass;
      reasonZh: string;
      newAgentCapabilityForbidden: true;
    }
  | {
      ok: true;
      class: 'NEW_CAPABILITY_CANDIDATE';
      reasonZh: string;
      /** 仍非自动批准建新 Agent */
      stillRequiresHumanProductApproval: true;
    };

export function evaluateCapabilityAdditionGate(input: {
  evidenceRef?: string;
  userTaskProven: boolean;
  existingSystemCannotSolve: boolean;
  classification: CapabilityGapClass;
  summaryZh: string;
}): CapabilityAdditionGateResultV1 {
  if (!input.evidenceRef?.trim()) {
    return {
      ok: false,
      code: 'NO_EVIDENCE',
      reasonZh: '无真实 Evidence，不进入能力讨论',
      newAgentCapabilityForbidden: true,
    };
  }
  if (!input.userTaskProven) {
    return {
      ok: false,
      code: 'TASK_NOT_PROVEN',
      reasonZh: '未证明用户任务真实存在',
      newAgentCapabilityForbidden: true,
    };
  }
  if (!input.existingSystemCannotSolve) {
    return {
      ok: false,
      code: 'EXISTING_SYSTEM_SUFFICIENT',
      reasonZh: '现有系统可解决，禁止借机扩能力',
      newAgentCapabilityForbidden: true,
    };
  }
  if (
    input.classification === 'BUG' ||
    input.classification === 'DATA' ||
    input.classification === 'UX' ||
    input.classification === 'EXISTING_CAPABILITY_GAP'
  ) {
    return {
      ok: false,
      code: 'CLASSIFIED_AS_BUG_DATA_OR_UX',
      class: input.classification,
      reasonZh: `归类为 ${input.classification}：修现有系统，不新增 Agent 能力（${input.summaryZh}）`,
      newAgentCapabilityForbidden: true,
    };
  }
  return {
    ok: true,
    class: 'NEW_CAPABILITY_CANDIDATE',
    reasonZh: `真实缺口且现有系统不可解：可提交人工产品审批（非自动加 Agent）— ${input.summaryZh}`,
    stillRequiresHumanProductApproval: true,
  };
}
