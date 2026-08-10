/**
 * Pre-plan 单节点执行宿主。
 */

import type { GraphRunOutcome } from '../orchestration/graph/orchestration-graph.types';
import type { PrePlanGraphRunParams } from '../orchestration/graph/pre-plan-graph.types';

export interface RunPrePlanNodeHost {
  runPrePlanFullChain(params: PrePlanGraphRunParams): Promise<GraphRunOutcome>;
}
