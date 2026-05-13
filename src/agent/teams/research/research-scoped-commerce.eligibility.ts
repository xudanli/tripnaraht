import type { PhaseExecutorContext } from '../../../decision/kernel/interfaces/phase-executor.interface';
import type { ResearchAssetScope } from '../../utils/research-asset-scope.util';
import { isResearchAssetScope } from '../../utils/research-asset-scope.util';

/** Leader 编排允许的 scoped 资产域（不含 common，避免与杂项键混排）。 */
const LEADER_SCOPED_MEMBER_SCOPES = new Set<ResearchAssetScope>([
  'hotel',
  'flight',
  'transport',
  'destination',
  'compliance',
]);

/**
 * scoped_partial 且 scopes 仅为 commerce + transport + destination/compliance 子集时，
 * 可由 Leader 拓扑编排（其余含 common 或大组合仍走 Monolith `execute`）。
 */
export function isLeaderScopedMemberPackContext(ctx: PhaseExecutorContext): boolean {
  if ((ctx.researchMode ?? 'full') !== 'scoped_partial') return false;
  if (!ctx.tripPlanRequest) return false;
  const scopes = ctx.researchScopesToRecompute;
  if (!Array.isArray(scopes) || scopes.length === 0) return false;
  if (
    !ctx.priorResearchData ||
    typeof ctx.priorResearchData !== 'object' ||
    Object.keys(ctx.priorResearchData as object).length === 0
  ) {
    return false;
  }
  const normalized = scopes.filter((s): s is ResearchAssetScope => isResearchAssetScope(s));
  if (normalized.length !== scopes.length) return false;
  return normalized.every((s) => LEADER_SCOPED_MEMBER_SCOPES.has(s));
}

/** @deprecated 使用 isLeaderScopedMemberPackContext（语义已扩展至 destination/compliance） */
export const isScopedCommerceTransportOnlyContext = isLeaderScopedMemberPackContext;
