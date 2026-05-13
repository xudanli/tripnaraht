import type { PhaseExecutorContext } from '../../../decision/kernel/interfaces/phase-executor.interface';
import type { ResearchAssetScope } from '../../utils/research-asset-scope.util';
import { isResearchAssetScope } from '../../utils/research-asset-scope.util';
import type { ResearchTeamState } from './research-team.types';

/**
 * 从 Kernel Phase 上下文窄化队状态；不持有 DSO / 全量 trip 请求。
 * `priorData` 可选：与 ctx.priorResearchData 合并判断「是否有先验研究」。
 */
export function initResearchTeamState(
  ctx: PhaseExecutorContext,
  priorData?: Record<string, unknown>,
): ResearchTeamState {
  const prior = ctx.priorResearchData ?? priorData;
  const hasPrior =
    !!prior && typeof prior === 'object' && Object.keys(prior as object).length > 0;
  const rs = ctx.researchScopesToRecompute;
  const scopes =
    Array.isArray(rs) && rs.length > 0
      ? (rs.filter((s): s is ResearchAssetScope => isResearchAssetScope(s)))
      : undefined;
  const rb = ctx.researchAtomicRollbackSnapshot;
  const hasRollback =
    !!rb && typeof rb === 'object' && Object.keys(rb as object).length > 0;
  return {
    requestId: ctx.requestId,
    researchMode: ctx.researchMode,
    researchScopesToRecompute: scopes,
    hasPriorResearchData: hasPrior,
    hasRollbackSnapshot: hasRollback,
  };
}
