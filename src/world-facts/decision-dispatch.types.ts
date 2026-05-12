import type { DecisionExecutableActionType } from './decision-execution.types';

/** P3：统一调度执行状态 */
export type ActionDispatchStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

export interface ActionDispatchTrace {
  actionIndex: number;
  actionType: DecisionExecutableActionType;
  status: ActionDispatchStatus;
  message?: string;
  startedAt: string;
  finishedAt?: string;
  /** 与 RouteDecisionEngine 快照关联，可调用 rollback */
  rollbackToken?: string;
}
