import { HarnessStepName } from '../../../harness/contracts/harness-step.types';
import type { OrchestrationNodeId } from './orchestration-graph.types';
import { computeResumeGraphEntryFromHarnessLast } from './edges/harness-orchestration-edge.registry';

/**
 * Durable 恢复：由末次 Harness 步推导图入口节点。
 * 实现与 `computeResumeGraphEntryFromHarnessLast` 共用边表注册表。
 */
export function computeResumeGraphEntryFromLast(last?: string): OrchestrationNodeId {
  return computeResumeGraphEntryFromHarnessLast(last);
}

export function shouldSkipIntakeOnResume(last?: string): boolean {
  return last === HarnessStepName.INTAKE || last === 'INTAKE';
}
