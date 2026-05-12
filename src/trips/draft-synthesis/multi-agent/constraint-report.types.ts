import type { ConstraintViolation } from './agent.types';

export interface PlanConstraintReport {
  planId: string;
  violations: ConstraintViolation[];
  /** 无 blocking 级违规时认为可进入人格效用最大化 */
  isOperationallyFeasible: boolean;
}
