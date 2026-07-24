/**
 * M4 — Monitoring / world-event detector wiring catalog.
 * @see DECISION_RUNTIME_ROADMAP.md §8.2 M4
 */

import type { DecisionTriggerKind } from '../contracts/decision-run-request';

export type DetectorWiringMode = 'dispatch' | 'lineage_only' | 'policy_gated' | 'not_wired';

export interface MonitoringDetectorWiring {
  id: string;
  label: string;
  eventType: string;
  triggerKind: DecisionTriggerKind;
  mode: DetectorWiringMode;
  moduleHint: string;
  pollKind?: string;
}

export const MONITORING_DETECTOR_WIRING_CATALOG: MonitoringDetectorWiring[] = [
  {
    id: 'detector.weather-hazard-poll',
    label: 'Weather hazard monitoring poll',
    eventType: 'WEATHER_HAZARD_CHANGED',
    triggerKind: 'CANONICAL_MONITORING_POLL',
    mode: 'dispatch',
    pollKind: 'WEATHER_HAZARD',
    moduleHint: 'decision-engine-gateway.service.ts',
  },
  {
    id: 'detector.daily-load-scan',
    label: 'Excessive daily load scan',
    eventType: 'DAILY_LOAD_OVERLOAD',
    triggerKind: 'CANONICAL_MONITORING_POLL',
    mode: 'dispatch',
    pollKind: 'DAILY_LOAD',
    moduleHint: 'decision-engine-gateway.service.ts',
  },
  {
    id: 'detector.road-segment-unavailable',
    label: 'Road segment unavailable (Abu)',
    eventType: 'ROAD_SEGMENT_UNAVAILABLE',
    triggerKind: 'CANONICAL_PROBLEM_EVALUATE',
    mode: 'dispatch',
    moduleHint: 'weather-activity-prohibited-pipeline / road pipeline',
  },
  {
    id: 'detector.weather-activity-prohibited',
    label: 'Weather activity prohibited',
    eventType: 'WEATHER_ACTIVITY_PROHIBITED',
    triggerKind: 'CANONICAL_PROBLEM_EVALUATE',
    mode: 'dispatch',
    moduleHint: 'weather-activity-prohibited-pipeline.service.ts',
  },
  {
    id: 'detector.excessive-daily-load',
    label: 'Excessive daily load evaluate',
    eventType: 'EXCESSIVE_DAILY_LOAD',
    triggerKind: 'CANONICAL_PROBLEM_EVALUATE',
    mode: 'dispatch',
    moduleHint: 'excessive-daily-load-pipeline.service.ts',
  },
  {
    id: 'detector.kernel-replan-coordinator',
    label: 'Kernel environment delta replan',
    eventType: 'WORLD_STATE_DELTA',
    triggerKind: 'WORLD_EVENT',
    mode: 'policy_gated',
    moduleHint: 'replan-coordinator.service.ts',
  },
  {
    id: 'detector.in-trip-recovery',
    label: 'In-trip deviation recovery loop',
    eventType: 'IN_TRIP_DEVIATION',
    triggerKind: 'IN_TRIP_DEVIATION',
    mode: 'policy_gated',
    moduleHint: 'loop-trigger.service.ts',
  },
  {
    id: 'detector.ledger-stale-reconcile',
    label: 'Decision ledger stale reconcile',
    eventType: 'DECISION_RECORD_STALE',
    triggerKind: 'CANONICAL_MONITORING_POLL',
    mode: 'lineage_only',
    moduleHint: 'monitoring-replanning-context.service.ts',
  },
  {
    id: 'detector.kernel-should-replan',
    label: 'Kernel shouldReplan() hook',
    eventType: 'KERNEL_SHOULD_REPLAN',
    triggerKind: 'WORLD_EVENT',
    mode: 'policy_gated',
    moduleHint: 'decision-kernel pushEnvironmentDelta',
  },
];

export function summarizeMonitoringDetectorWiring(
  catalog: MonitoringDetectorWiring[] = MONITORING_DETECTOR_WIRING_CATALOG,
) {
  const dispatch = catalog.filter((d) => d.mode === 'dispatch').length;
  const policyGated = catalog.filter((d) => d.mode === 'policy_gated').length;
  const lineageOnly = catalog.filter((d) => d.mode === 'lineage_only').length;
  const notWired = catalog.filter((d) => d.mode === 'not_wired').length;
  const wired = catalog.length - notWired;

  return {
    schemaId: 'tripnara.monitoring_detector_wiring_summary@v1',
    total: catalog.length,
    dispatchWired: dispatch,
    policyGated,
    lineageOnly,
    notWired,
    wiredCoveragePct: catalog.length ? Math.round((wired / catalog.length) * 100) : 0,
    entries: catalog,
  };
}
