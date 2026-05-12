/**
 * Overnight 重构提案候选 — RepairEvaluator 产出；不自动 mutate TripPlan。
 */

import type { ISODate } from '../world-model';

export type OvernightPressureSeverityInProposal = 'LOW' | 'MEDIUM' | 'HIGH';

export type OvernightProposedAction =
  | 'SHIFT_TIMELINE'
  | 'RELOCATE_OVERNIGHT'
  | 'COMPRESS_DAY'
  | 'KEEP_CURRENT';

export interface OvernightRestructuringProposal {
  date: ISODate;
  pressureSeverity: OvernightPressureSeverityInProposal;
  unsafeLegIds: string[];
  rationale: string[];
  proposedAction: OvernightProposedAction;
  /** Key B：拓扑变更宪法闸门 */
  restructuringPressureApproved: boolean;
  /** Key A：与走廊迁移经济学对齐（该日无评估则不填） */
  migrationEconomicsApproved?: boolean;
}
