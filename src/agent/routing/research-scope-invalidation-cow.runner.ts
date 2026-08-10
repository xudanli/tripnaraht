/**
 * RESEARCH 前 Harness 研究资产作用域局部无效化（COW）（从 ClaudeOrchestrator 迁出）。
 */

import type { ResearchScopeInvalidationCowHost } from './research-scope-invalidation-cow.host';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import { planResearchScopes } from '../runtime/research-scope-planner.util';
import {
  cloneResearchRecord,
  invalidateResearchScopesInPlace,
} from '../utils/research-asset-scope.util';

export async function applyResearchScopeInvalidationCowBeforeResearch(
  host: ResearchScopeInvalidationCowHost,
  request: RouteAndRunRequestDto,
  state: OrchestratorState,
): Promise<void> {
  const dosCtx = host.resolveDosExecutionContext(request);
  const scopePlan = planResearchScopes({
    request,
    dosContext: dosCtx,
    metadata: state.metadata as Record<string, unknown>,
  });
  const scopes = scopePlan.assetScopes;
  if (scopes.length === 0) return;

  let rdBase: Record<string, unknown> | undefined =
    state.research_data && typeof state.research_data === 'object'
      ? cloneResearchRecord(state.research_data as Record<string, unknown>)
      : undefined;
  if ((!rdBase || Object.keys(rdBase).length === 0) && host.researchPriorSnapshot) {
    const loaded = await host.researchPriorSnapshot.load(request);
    if (loaded && typeof loaded === 'object' && Object.keys(loaded).length > 0) {
      rdBase = cloneResearchRecord(loaded as Record<string, unknown>);
    }
  }
  if (!rdBase || Object.keys(rdBase).length === 0) return;

  const researchAtomicRollbackSnapshot = cloneResearchRecord(rdBase);
  const draftRd = cloneResearchRecord(rdBase);
  if (!draftRd) {
    host.logger.warn(
      `[Claude Orchestrator] research COW: draft clone failed request_id=${state.request_id}`,
    );
    return;
  }
  const { clearedKeys } = invalidateResearchScopesInPlace(
    draftRd,
    scopes,
    `research_scope_plan:${scopePlan.source}`,
  );
  const m0 = { ...(state.metadata as Record<string, unknown>) };
  m0.research_scopes_to_recompute = scopes;
  m0.research_scope_plan_v1 = scopePlan;
  m0.research_scope_invalidation = {
    scopes,
    cleared_keys: clearedKeys,
    at: scopePlan.at,
    source: scopePlan.source,
  };
  if (scopePlan.forbid_full_research) {
    m0.forbid_scoped_partial_degrade_to_full = true;
  }
  m0.pending_research_prior_for_kernel = draftRd;
  m0.research_atomic_rollback_snapshot = researchAtomicRollbackSnapshot;
  state.metadata = m0 as OrchestratorState['metadata'];
  state.decision_log.push({
    request_id: state.request_id,
    step: 'RESEARCH',
    actor: 'Orchestrator',
    inputs_summary: 'Harness：研究资产作用域局部无效化（COW 副本，主干未提交）',
    outputs_summary: `INVALIDATE_SCOPES source=${scopePlan.source} scopes=${scopes.join(',')} cleared_key_count=${clearedKeys.length}`,
    evidence_refs: [],
    timestamp: new Date().toISOString(),
    metadata: {
      system_action: 'RESEARCH_SCOPE_INVALIDATION',
      scopes,
      research_scope_plan_v1: scopePlan,
      cleared_keys_sample: clearedKeys.slice(0, 32),
    },
  });
}
