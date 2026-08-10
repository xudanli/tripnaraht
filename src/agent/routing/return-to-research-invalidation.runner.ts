/**
 * Harness RETURN_TO_RESEARCH → 定向 research scope 失效（从 ClaudeOrchestrator 迁出）。
 */

import type { ReturnToResearchInvalidationHost } from './return-to-research-invalidation.host';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import {
  dedupeResearchScopes,
  invalidateResearchScopesInPlace,
  cloneResearchRecord,
} from '../utils/research-asset-scope.util';
import { buildReturnToResearchContextV1 } from '../orchestration/return-to-research-context.util';

export async function applyReturnToResearchInvalidation(
  host: ReturnToResearchInvalidationHost,
  state: OrchestratorState,
  decisionState: DecisionState | undefined,
  request: RouteAndRunRequestDto,
): Promise<DecisionState | undefined> {
  let ds = decisionState;
  const harnessEvents = ds?.harnessRuntime?.last_harness_failure_events;
  const r2rContext = buildReturnToResearchContextV1({ events: harnessEvents });
  const scopes = dedupeResearchScopes(r2rContext.scopes);

  if (host.decisionKernel && ds) {
    ds = host.decisionKernel.updateState(ds, {
      harnessRuntime: {
        ...(ds.harnessRuntime ?? {}),
        researchEvidenceSnapshotId: undefined,
        evidenceVersion: undefined,
      },
    });
  }

  // 定向 COW：保留未失效域作为 prior，强制后续 RESEARCH 走 scoped_partial
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

  const m0 = { ...(state.metadata as Record<string, unknown>) };
  m0.return_to_research_context_v1 = r2rContext;
  m0.research_scopes_to_recompute = scopes;

  let clearedKeys: string[] = [];
  if (rdBase && Object.keys(rdBase).length > 0) {
    const rollback = cloneResearchRecord(rdBase);
    const draftRd = cloneResearchRecord(rdBase);
    if (draftRd) {
      const inv = invalidateResearchScopesInPlace(draftRd, scopes, 'RETURN_TO_RESEARCH');
      clearedKeys = inv.clearedKeys;
      m0.pending_research_prior_for_kernel = draftRd;
      m0.research_atomic_rollback_snapshot = rollback;
      // 主干 research_data 暂不清空：Kernel scoped_partial 以 pending prior 为准
    }
  } else {
    // 无 prior 时允许后续显式 forced full，但必须可观测
    m0.r2r_allow_forced_full_empty_prior = true;
    host.logger.warn(
      `[Claude Orchestrator] RETURN_TO_RESEARCH 无 prior research，允许显式 forced full request_id=${state.request_id} codes=${r2rContext.failure_codes.join(',')}`,
    );
  }

  m0.research_scope_invalidation = {
    scopes,
    cleared_keys: clearedKeys,
    at: r2rContext.at,
    reason: 'RETURN_TO_RESEARCH',
    failure_codes: r2rContext.failure_codes,
    missing_evidence: r2rContext.missing_evidence,
    forbid_full_research: r2rContext.forbid_full_research,
  };
  state.metadata = m0 as OrchestratorState['metadata'];
  state.decision_log.push({
    request_id: state.request_id,
    step: 'VERIFY',
    actor: 'Orchestrator',
    inputs_summary: 'Harness RETURN_TO_RESEARCH → targeted research scope invalidation',
    outputs_summary: `RESEARCH_SCOPE_INVALIDATION scopes=${scopes.join(',')} codes=${r2rContext.failure_codes.join(',') || '∅'}`,
    evidence_refs: [],
    timestamp: r2rContext.at,
    metadata: {
      system_action: 'RETURN_TO_RESEARCH',
      scopes,
      return_to_research_context_v1: r2rContext,
      failure_codes: r2rContext.failure_codes,
      missing_evidence: r2rContext.missing_evidence,
    },
  });
  return ds;
}
