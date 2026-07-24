/**
 * M7 — Frontend trigger center view (event → impact → recommendation → disposition).
 * @see DECISION_RUNTIME_ROADMAP.md §8.2 M7
 */

import type { DecisionTriggerLineageEntry } from './decision-trigger-lineage.store';
import type { DecisionTriggerKind } from '../contracts/decision-run-request';
import type {
  ReplanningAction,
  ReplanningTriggerResult,
} from './replanning-trigger.policy';
import type {
  ReplanningScope,
  ReplanningStrategy,
  ReplanningTriggerDecision,
  ReplanningUrgency,
} from './replanning-trigger-decision.util';
import { summarizeMonitoringDetectorWiring } from './monitoring-detector-wiring.catalog';

export const TRIGGER_CENTER_VIEW_SCHEMA_ID = 'tripnara.trigger_center_view@v1';

export type TriggerCenterPlanValidity = 'VALID' | 'STALE' | 'REPAIRING' | 'UNKNOWN';

export type TriggerCenterDisposition =
  | 'PENDING'
  | 'AUTO_REPAIR'
  | 'DELEGATED_FULL_REPLAN'
  | 'SKIPPED'
  | 'ADVISORY_ONLY'
  | 'AWAITING_CONFIRMATION';

export interface TriggerCenterItem {
  runId: string;
  recordedAt: string;
  headline: string;
  eventType: string;
  triggerKind: DecisionTriggerKind;
  source: string;
  affectedScope: ReplanningScope | 'UNKNOWN';
  affectedDayLabel?: string;
  planValidity: TriggerCenterPlanValidity;
  recommendation: {
    strategy: ReplanningStrategy;
    action: ReplanningAction;
    urgency: ReplanningUrgency;
    summary: string;
  };
  humanConfirmationRequired: boolean;
  disposition: TriggerCenterDisposition;
  skippedReason?: string;
  detectorId?: string;
  eventId?: string;
}

export interface TriggerCenterView {
  schemaId: typeof TRIGGER_CENTER_VIEW_SCHEMA_ID;
  tripId: string;
  generatedAt: string;
  itemCount: number;
  items: TriggerCenterItem[];
  detectorWiring: ReturnType<typeof summarizeMonitoringDetectorWiring>;
}

export function buildTriggerCenterView(
  tripId: string,
  entries: DecisionTriggerLineageEntry[],
): TriggerCenterView {
  const sorted = [...entries].sort(
    (a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt),
  );

  return {
    schemaId: TRIGGER_CENTER_VIEW_SCHEMA_ID,
    tripId,
    generatedAt: new Date().toISOString(),
    itemCount: sorted.length,
    items: sorted.map(mapLineageEntryToItem),
    detectorWiring: summarizeMonitoringDetectorWiring(),
  };
}

function mapLineageEntryToItem(entry: DecisionTriggerLineageEntry): TriggerCenterItem {
  const { request } = entry;
  const metadata = request.metadata ?? {};
  const decision = metadata.replanningDecision as ReplanningTriggerDecision | undefined;
  const replanning = metadata.replanningTrigger as ReplanningTriggerResult | undefined;
  const action = decision?.action ?? replanning?.action ?? 'USER_CONFIRMATION_REQUIRED';
  const skipped = metadata.skipped as string | undefined;
  const triggerType = metadata.triggerType as string | undefined;
  const eventType = inferEventType(request.triggerKind, metadata, triggerType);
  const detectorId = resolveDetectorId(eventType, request.triggerKind);

  return {
    runId: entry.runId,
    recordedAt: entry.recordedAt,
    headline: buildHeadline(eventType, triggerType, skipped),
    eventType,
    triggerKind: request.triggerKind,
    source: request.source,
    affectedScope: decision?.scope ?? 'UNKNOWN',
    affectedDayLabel: formatAffectedDay(metadata),
    planValidity: planValidityFor(action, skipped),
    recommendation: {
      strategy: decision?.strategy ?? 'ADVISORY',
      action,
      urgency: decision?.urgency ?? 'LOW',
      summary: decision?.rationale ?? replanning?.rationale ?? 'No replanning policy evaluation',
    },
    humanConfirmationRequired: decision?.humanConfirmationRequired ?? false,
    disposition: dispositionFor(action, skipped, decision),
    skippedReason: skipped,
    detectorId,
    eventId: request.eventId,
  };
}

function inferEventType(
  triggerKind: DecisionTriggerKind,
  metadata: Record<string, unknown>,
  triggerType?: string,
): string {
  if (typeof metadata.eventType === 'string') return metadata.eventType;
  if (triggerType) return triggerType;
  if (typeof metadata.pollKind === 'string') return metadata.pollKind;
  switch (triggerKind) {
    case 'IN_TRIP_DEVIATION':
      return 'IN_TRIP_DEVIATION';
    case 'WORLD_EVENT':
      return 'WORLD_STATE_DELTA';
    case 'CANONICAL_MONITORING_POLL':
      return 'MONITORING_POLL';
    case 'CANONICAL_PROBLEM_EVALUATE':
      return 'CONSTRAINT_EVALUATE';
    case 'MANUAL_REPAIR_REQUEST':
      return 'MANUAL_REPAIR';
    case 'USER_INTENT':
      return 'USER_INTENT';
    default:
      return triggerKind;
  }
}

function resolveDetectorId(
  eventType: string,
  triggerKind: DecisionTriggerKind,
): string | undefined {
  const catalog = summarizeMonitoringDetectorWiring().entries;
  return catalog.find(
    (d) =>
      d.eventType === eventType ||
      d.triggerKind === triggerKind ||
      (triggerKind === 'IN_TRIP_DEVIATION' && d.id === 'detector.in-trip-recovery'),
  )?.id;
}

function buildHeadline(
  eventType: string,
  triggerType?: string,
  skipped?: string,
): string {
  const label = humanizeEventLabel(triggerType ?? eventType);
  if (skipped) {
    return `${label} — skipped (${humanizeEventLabel(skipped)})`;
  }
  return label;
}

function humanizeEventLabel(raw: string): string {
  return raw
    .replace(/^replanning_policy_/, '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatAffectedDay(metadata: Record<string, unknown>): string | undefined {
  if (typeof metadata.dayIndex === 'number') {
    return `Day ${metadata.dayIndex + 1}`;
  }
  if (typeof metadata.affectedDayIndex === 'number') {
    return `Day ${metadata.affectedDayIndex + 1}`;
  }
  return undefined;
}

function planValidityFor(
  action: ReplanningAction,
  skipped?: string,
): TriggerCenterPlanValidity {
  if (skipped) return 'VALID';
  switch (action) {
    case 'NO_OP':
      return 'VALID';
    case 'LOCAL_REPAIR':
    case 'PARTIAL_REPLAN':
      return 'REPAIRING';
    case 'FULL_REPLAN':
      return 'STALE';
    default:
      return 'UNKNOWN';
  }
}

function dispositionFor(
  action: ReplanningAction,
  skipped: string | undefined,
  decision: ReplanningTriggerDecision | undefined,
): TriggerCenterDisposition {
  if (skipped) {
    if (skipped.includes('full_replan')) return 'DELEGATED_FULL_REPLAN';
    return 'SKIPPED';
  }
  if (action === 'NO_OP') return 'ADVISORY_ONLY';
  if (decision?.humanConfirmationRequired) return 'AWAITING_CONFIRMATION';
  if (action === 'FULL_REPLAN') return 'DELEGATED_FULL_REPLAN';
  if (action === 'LOCAL_REPAIR' || action === 'PARTIAL_REPLAN') return 'AUTO_REPAIR';
  return 'PENDING';
}
