/**
 * CTX-1 — Corridor-local freshness / context field inventory (facts only).
 *
 * There is **no** unified main-chain `contextHash`. Do not wire TravelContext
 * as global runtime SSOT from this inventory alone.
 */

import { AGENT_NO_GLOBAL_CONTEXT_HASH } from './agent-conceptual-vs-actual.constants';
import {
  ARRANGE_APPLY_STALE_DUAL_SIGNAL,
  ARRANGE_APPLY_STALE_HTTP_ERROR_CODE,
  ARRANGE_APPLY_STALE_ORCHESTRATION_PHASE,
} from '../../trips/arrange-itinerary/contracts/arrange-apply-stale.dual-signal.constants';

export const CORRIDOR_LOCAL_FRESHNESS_INVENTORY_VERSION = '1.0.0' as const;

export const GLOBAL_TRAVEL_CONTEXT_SSOT_WIRE_FORBIDDEN =
  'Do not wire TravelContext as global runtime SSOT from CTX-1 inventory alone; CURRENT_RUNTIME_SSOT remains OS∥DSO' as const;

export type CorridorFreshnessRow = {
  id: string;
  productSurface: string;
  /** Primary client/server freshness field(s) */
  fields: readonly string[];
  staleOrConflictSignal?: string;
  anchorPath: string;
  notes: string;
};

export const CORRIDOR_LOCAL_FRESHNESS_INVENTORY: readonly CorridorFreshnessRow[] = [
  {
    id: 'route_and_run_main_chain',
    productSurface: 'Main Agent route_and_run',
    fields: [
      'snapshotId (memory)',
      'expected_negotiation_hash (confirm)',
      'effectivePlanVersionId (near-neighbor; not global contextHash)',
    ],
    staleOrConflictSignal: AGENT_NO_GLOBAL_CONTEXT_HASH,
    anchorPath: 'src/agent/contracts/agent-conceptual-vs-actual.constants.ts',
    notes: 'No unified contextHash on main chain',
  },
  {
    id: 'travel_context',
    productSurface: 'TravelContext RFC-003',
    fields: ['revision', 'snapshotId', 'basedOnRevision'],
    staleOrConflictSignal: 'REVISION_CONFLICT (409)',
    anchorPath: 'src/travel-context/domain/travel-context.types.ts',
    notes: 'Target SSOT module; not Claude SM main-chain SSOT',
  },
  {
    id: 'page_insight',
    productSurface: 'Copilot Page Insight',
    fields: ['contextHash (ctxh_* via PageInsightContextHashService)', 'contextHashFields'],
    staleOrConflictSignal: 'corridor-local hash mismatch (page contract)',
    anchorPath: 'src/trips/copilot/services/page-insight-context-hash.service.ts',
    notes: 'Distinct namespace from TravelContext views',
  },
  {
    id: 'arrange_itinerary',
    productSurface: 'Arrange Itinerary',
    fields: ['contextVersion'],
    staleOrConflictSignal: ARRANGE_APPLY_STALE_DUAL_SIGNAL,
    anchorPath:
      'src/trips/arrange-itinerary/contracts/arrange-apply-stale.dual-signal.constants.ts',
    notes: `phase=${ARRANGE_APPLY_STALE_ORCHESTRATION_PHASE}; http=${ARRANGE_APPLY_STALE_HTTP_ERROR_CODE}`,
  },
  {
    id: 'mobile_spatial_planning',
    productSurface: 'Mobile spatial / planning',
    fields: ['If-Match: contextVersion (ifMatch)'],
    staleOrConflictSignal: 'CONTEXT_VERSION_CONFLICT',
    anchorPath: 'src/mobile/services/mobile-spatial-route.service.ts',
    notes: 'Also mobile-planning.service.ts',
  },
  {
    id: 'tep_repair_apply',
    productSurface: 'TEP Local Repair Apply',
    fields: ['basePlanVersionId', 'currentEffectivePlanVersionId'],
    staleOrConflictSignal: 'STALE_REPAIR_OPTION',
    anchorPath: 'src/trips/tep/utils/tep-repair-stale-guard.util.ts',
    notes: 'Plan-version bound; not contextHash',
  },
  {
    id: 'unified_decision',
    productSurface: 'Unified Decision',
    fields: ['decision revision / Idempotency-Key on execute'],
    staleOrConflictSignal: 'corridor-specific (Canonical Runtime)',
    anchorPath:
      'src/decision-runtime/gateway/controllers/unified-decision.controller.ts',
    notes: 'Execute/rollback are decision-scoped, not TravelContext revision',
  },
  {
    id: 'decision_space_handoff',
    productSurface: 'Decision Space (handoff samples)',
    fields: ['contextHash (Swift samples in handoff)'],
    staleOrConflictSignal: 'documented in DECISION_SPACE_IOS_HANDOFF',
    anchorPath: 'src/decision-runtime/decision-cases/DECISION_SPACE_IOS_HANDOFF.md',
    notes: 'Handoff sample field; not proven shipping-client compliance',
  },
] as const;

export const CORRIDOR_LOCAL_FRESHNESS_ANCHOR_PATHS: readonly string[] =
  CORRIDOR_LOCAL_FRESHNESS_INVENTORY.map((r) => r.anchorPath);
