import type { PhaseExecutorContext } from '../../../decision/kernel/interfaces/phase-executor.interface';

/** 合规域 Member：SafeTravel RSS 等写入 `research_data`（供后续 GATE_EVAL 消费）。 */
export type ResearchMemberComplianceRunInput = {
  requestId: string;
  tripPlanRequest: NonNullable<PhaseExecutorContext['tripPlanRequest']>;
  researchData: Record<string, unknown>;
  evidenceRefs: string[];
};
