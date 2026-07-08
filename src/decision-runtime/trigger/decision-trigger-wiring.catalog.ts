/**
 * Declarative catalog of formal entry points → Decision Trigger Gateway wiring.
 * @see DECISION_RUNTIME_ROADMAP.md §3.2 A1
 */

import type {
  DecisionRunRequestSource,
  DecisionTriggerKind,
} from '../contracts/decision-run-request';

export type TriggerWiringMode = 'dispatch' | 'lineage_only' | 'not_wired';

export interface TriggerEntryPointWiring {
  id: string;
  label: string;
  triggerKind: DecisionTriggerKind;
  mode: TriggerWiringMode;
  source: DecisionRunRequestSource;
  moduleHint: string;
  notes?: string;
}

/** Source-of-truth wiring table — update when new entry points dispatch via Gateway. */
export const DECISION_TRIGGER_WIRING_CATALOG: TriggerEntryPointWiring[] = [
  {
    id: 'decision-engine.full-plan-selection',
    label: 'POST canonical-plan-selection / full plan',
    triggerKind: 'FULL_PLAN_SELECTION',
    mode: 'dispatch',
    source: 'DECISION_ENGINE_API',
    moduleHint: 'decision-engine.controller.ts',
  },
  {
    id: 'unified-gateway.evaluate',
    label: 'Decision Center L2 evaluate',
    triggerKind: 'CANONICAL_PROBLEM_EVALUATE',
    mode: 'dispatch',
    source: 'UNIFIED_DECISION_API',
    moduleHint: 'decision-engine-gateway.service.ts',
  },
  {
    id: 'unified-gateway.weather-poll',
    label: 'Monitoring weather-hazard poll',
    triggerKind: 'CANONICAL_MONITORING_POLL',
    mode: 'dispatch',
    source: 'UNIFIED_DECISION_API',
    moduleHint: 'decision-engine-gateway.service.ts',
  },
  {
    id: 'unified-gateway.daily-load',
    label: 'Monitoring daily-load scan',
    triggerKind: 'CANONICAL_MONITORING_POLL',
    mode: 'dispatch',
    source: 'UNIFIED_DECISION_API',
    moduleHint: 'decision-engine-gateway.service.ts',
  },
  {
    id: 'guide.canonical-selection',
    label: 'Guide import canonical selection',
    triggerKind: 'GUIDE_IMPORT_REQUEST',
    mode: 'dispatch',
    source: 'GUIDE_TO_PLAN',
    moduleHint: 'guide-canonical-selection.service.ts',
  },
  {
    id: 'guide.canonical-accept',
    label: 'Guide accept → execute chain',
    triggerKind: 'GUIDE_IMPORT_REQUEST',
    mode: 'dispatch',
    source: 'GUIDE_TO_PLAN',
    moduleHint: 'guide-canonical-accept.service.ts',
  },
  {
    id: 'agent.route-and-run',
    label: 'Agent route_and_run (advisory + lineage)',
    triggerKind: 'LEGACY_AGENT_ROUTE',
    mode: 'dispatch',
    source: 'AGENT_ROUTE_AND_RUN',
    moduleHint: 'decision-runtime-kernel.prepare.util.ts',
    notes: 'P4: dispatchAgentRouteAndRunIfEnabled; advisory only — no formal Decision authority',
  },
  {
    id: 'loops.in-trip-recovery',
    label: 'In-trip recovery loop trigger',
    triggerKind: 'IN_TRIP_DEVIATION',
    mode: 'dispatch',
    source: 'INTERNAL',
    moduleHint: 'loop-trigger.service.ts',
    notes: 'P4: dispatchInTripDeviationIfEnabled; LoopOrchestrator remains execution authority',
  },
  {
    id: 'kernel.replan-coordinator',
    label: 'Kernel environment-delta replan',
    triggerKind: 'WORLD_EVENT',
    mode: 'dispatch',
    source: 'INTERNAL',
    moduleHint: 'replan-coordinator.service.ts',
    notes: 'P4: dispatchWorldEventIfEnabled; ReplanCoordinator remains execution authority',
  },
  {
    id: 'user.trip-intent',
    label: 'Unified NL trip intent (POST /intent)',
    triggerKind: 'USER_INTENT',
    mode: 'dispatch',
    source: 'HTTP',
    moduleHint: 'trip-intent.controller.ts',
    notes: 'S1 IntentRouter — classify + snapshot + Gateway dispatch',
  },
  {
    id: 'user.trip-edit',
    label: 'User direct itinerary edit (batch-update)',
    triggerKind: 'USER_INTENT',
    mode: 'dispatch',
    source: 'HTTP',
    moduleHint: 'trips.controller.ts batchUpdateItems',
    notes: 'P4 production transition: dispatchUserIntentFromModule when DECISION_TRIGGER_GATEWAY_ENABLED=1',
  },
  {
    id: 'user.feasibility-apply-repair',
    label: 'User feasibility report apply-repair',
    triggerKind: 'MANUAL_REPAIR_REQUEST',
    mode: 'dispatch',
    source: 'HTTP',
    moduleHint: 'feasibility-report.controller.ts applyRepair',
    notes: 'P4: dispatchManualRepairFromModule; FeasibilityReportService remains authority',
  },
  {
    id: 'user.readiness-apply-repair',
    label: 'User readiness apply-repair',
    triggerKind: 'MANUAL_REPAIR_REQUEST',
    mode: 'dispatch',
    source: 'HTTP',
    moduleHint: 'readiness.controller.ts applyRepair',
    notes: 'P4: dispatchManualRepairFromModule; ReadinessRepairService remains authority',
  },
];

export interface TriggerWiringSummary {
  schemaId: 'tripnara.decision_trigger_wiring_summary@v1';
  total: number;
  dispatchWired: number;
  lineageOnly: number;
  notWired: number;
  dispatchCoveragePct: number;
  entries: TriggerEntryPointWiring[];
}

export function summarizeTriggerWiring(
  catalog: TriggerEntryPointWiring[] = DECISION_TRIGGER_WIRING_CATALOG,
): TriggerWiringSummary {
  const dispatchWired = catalog.filter((e) => e.mode === 'dispatch').length;
  const lineageOnly = catalog.filter((e) => e.mode === 'lineage_only').length;
  const notWired = catalog.filter((e) => e.mode === 'not_wired').length;
  const formal = catalog.filter((e) => e.mode !== 'not_wired').length;

  return {
    schemaId: 'tripnara.decision_trigger_wiring_summary@v1',
    total: catalog.length,
    dispatchWired,
    lineageOnly,
    notWired,
    dispatchCoveragePct: catalog.length
      ? Math.round((formal / catalog.length) * 100)
      : 0,
    entries: catalog,
  };
}
