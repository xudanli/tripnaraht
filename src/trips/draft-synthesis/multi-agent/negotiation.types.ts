import type { AgentContribution } from './agent.types';
import type { PlanConstraintReport } from './constraint-report.types';
import type { TravelPersonaType } from '../persona-policy/travel-persona.types';
import type { ObjectiveVector } from '../pareto/objective-vector.types';

export interface MultiAgentNegotiationInput {
  /** 仅对 Pareto 前沿上的候选做协商（与现有管线一致） */
  paretoPlans: Array<{ planId: string; objectives: ObjectiveVector }>;
  personaType: TravelPersonaType;
  reports: PlanConstraintReport[];
  /** 各专职 agent 的「主张」，用于可解释性，不参与数学时也可缺省 */
  contributions?: AgentContribution[];
  /** 草案门控极弱时略抬风险权重（可选） */
  draftGateStatus?: 'APPROVED' | 'NEEDS_REPAIR' | 'REJECTED';
}

export interface ConflictResolutionLogEntry {
  planId: string;
  action: 'ACCEPTED' | 'FILTERED_BY_CONSTRAINT' | 'SELECTED_UTILITY';
  detail: string;
}

export interface MultiAgentNegotiationResult {
  selectedPlanId: string;
  /** Constraint dominance 优先；余下为人格效用最大 */
  conflictResolutionLog: ConflictResolutionLogEntry[];
  contributions: AgentContribution[];
}
