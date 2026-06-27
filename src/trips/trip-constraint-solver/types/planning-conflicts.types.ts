/**
 * Plan Studio 冲突中心 — 聚合读模型（P0-1 M2）
 */

import type { ConflictDto } from '../../dto/trip-conflicts.dto';
import type {
  FeasibilityIssueDto,
  GateExecuteStatusDto,
} from './trip-constraint-solver.types';

export type PlanningConflictSource = 'feasibility' | 'schedule';

export type PlanningConflictCategory =
  | 'schedule'
  | 'transport'
  | 'team_fit'
  | 'access_capacity'
  | 'experience_expectation'
  | 'booking'
  | 'structure'
  | 'environment'
  | 'other';

export interface PlanningConflictItem {
  id: string;
  source: PlanningConflictSource;
  priority: FeasibilityIssueDto['priority'];
  category: PlanningConflictCategory;
  title: string;
  message: string;
  affectedDays?: number[];
  /** 与 feasibility dedupe 对齐的稳定键 */
  semanticKey?: string;
  issue?: FeasibilityIssueDto;
  studioConflict?: ConflictDto;
}

export interface PlanningConflictsSummary {
  total: number;
  mustHandle: number;
  suggestAdjust: number;
  pendingConfirm: number;
  byCategory: Record<string, number>;
}

export interface PlanningConflictsResponse {
  tripId: string;
  verdict?: {
    status: string;
    headline?: string;
  };
  gateExecute?: GateExecuteStatusDto;
  canStartExecute?: boolean;
  isStale?: boolean;
  /** feasibility-report 验证时间 */
  reportVerifiedAt?: string;
  /** schedule 冲突扫描时间 */
  conflictsGeneratedAt?: string;
  summary: PlanningConflictsSummary;
  conflicts: PlanningConflictItem[];
  /** P2：?includeConstraintsSummary=1 */
  constraintsSummary?: import('./constraints-summary.types').ConstraintsSummaryResponse;
}
