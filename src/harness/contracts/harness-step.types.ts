/**
 * Harness 步骤名与契约类型（对齐 docs/Harness Runtime.md）
 */

export enum HarnessStepName {
  INTAKE = 'INTAKE',
  RESEARCH = 'RESEARCH',
  GATE_EVAL = 'GATE_EVAL',
  PLAN_GEN = 'PLAN_GEN',
  VERIFY = 'VERIFY',
  REPAIR = 'REPAIR',
  NARRATE = 'NARRATE',
}

export type HarnessFailureRoutingLevel1 = 'RETRY' | 'CONTINUE_WITH_WARNING';
export type HarnessFailureRoutingLevel2 =
  | 'RETURN_TO_RESEARCH'
  | 'RETURN_TO_PREVIOUS_STEP';
export type HarnessFailureRoutingLevel3 =
  | 'BLOCK'
  | 'NEED_USER_CONFIRM'
  | 'ABORT';

export interface HarnessStepOnFailurePolicy {
  level1: HarnessFailureRoutingLevel1;
  level2: HarnessFailureRoutingLevel2;
  level3: HarnessFailureRoutingLevel3;
}

/** 证据版本绑定：RESEARCH 产出快照，VERIFY 等步校验引用一致 */
export interface HarnessEvidenceVersionPolicy {
  statePath: string;
  bindToProducerStep?: HarnessStepName;
}

export interface HarnessStepContract {
  name: HarnessStepName;
  allowedTools: string[];
  requiredInputPaths: string[];
  requiredOutputPaths: string[];
  readableStatePaths: string[];
  writableStatePaths: string[];
  deterministicValidators: string[];
  inferentialGraders?: string[];
  evidenceVersion?: HarnessEvidenceVersionPolicy;
  /** 为 true 时，执行上下文 metadata 须带非空 idempotencyKey（外部工具/计费安全） */
  requireIdempotencyKey?: boolean;
  onFailure: HarnessStepOnFailurePolicy;
}
