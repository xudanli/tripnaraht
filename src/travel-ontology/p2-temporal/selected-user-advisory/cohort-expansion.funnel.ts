/**
 * ONT-P2-04 — Full selected-user advisory funnel (expansion observation)
 * eligible → emitted → delivered → surfaced → opened → detailsViewed → planningEntry → feedback
 */

export const COHORT_FUNNEL_STAGES = [
  'eligible',
  'emitted',
  'delivered',
  'surfaced',
  'opened',
  'detailsViewed',
  'planningEntry',
  'feedback',
] as const;

export type CohortFunnelStage = (typeof COHORT_FUNNEL_STAGES)[number];

export type CohortFunnelActionType =
  | 'VIEW_EVIDENCE'
  | 'VIEW_PREDICTION_UPDATED_AT'
  | 'VIEW_AFFECTED_SEGMENT'
  | 'VIEW_RECOMMENDATION'
  | 'ENTER_EXISTING_PLANNING_FLOW'
  | 'FEEDBACK_USEFUL'
  | 'DISMISS_EXPERIMENT'
  | 'DEADLINE_UNDERSTOOD_SURVEY'
  | 'TOO_ALARMING';

export interface CohortFunnelEvent {
  stage: CohortFunnelStage;
  userId: string;
  tripId: string;
  predictionId: string;
  predictionVersion: string;
  advisoryId?: string;
  displayVariantId?: string;
  actionType?: CohortFunnelActionType;
  eventKind?: 'NATURAL' | 'CONTROLLED';
  at: string;
  meta?: Record<string, string | number | boolean>;
}

export interface CohortFunnelCounters {
  eligible: number;
  emitted: number;
  delivered: number;
  surfaced: number;
  opened: number;
  detailsViewed: number;
  planningEntry: number;
  feedback: number;
}

export interface CohortFunnelRates {
  emit_rate: number | null;
  deliver_rate: number | null;
  surface_rate: number | null;
  open_rate: number | null;
  details_view_rate: number | null;
  planning_entry_rate: number | null;
  feedback_rate: number | null;
}

export type FunnelLeakDiagnosis =
  | 'DELIVERY_REACH_PROBLEM'
  | 'SURFACE_ENTRY_OR_PAGE_EXPOSURE'
  | 'TITLE_OR_VALUE_EXPRESSION'
  | 'RECOMMENDATION_NOT_ACTIONABLE'
  | 'RECOMMENDATION_QUALITY'
  | 'INSUFFICIENT_SAMPLE'
  | 'HEALTHY_FUNNEL';

function rate(num: number, den: number): number | null {
  if (den <= 0) return null;
  return Number((num / den).toFixed(4));
}

export function createEmptyCohortFunnelCounters(): CohortFunnelCounters {
  return {
    eligible: 0,
    emitted: 0,
    delivered: 0,
    surfaced: 0,
    opened: 0,
    detailsViewed: 0,
    planningEntry: 0,
    feedback: 0,
  };
}

export class CohortAdvisoryFunnelStore {
  private readonly events: CohortFunnelEvent[] = [];

  record(event: CohortFunnelEvent): void {
    this.events.push(event);
  }

  all(): CohortFunnelEvent[] {
    return [...this.events];
  }

  counters(): CohortFunnelCounters {
    const c = createEmptyCohortFunnelCounters();
    for (const e of this.events) {
      c[e.stage] += 1;
    }
    return c;
  }

  rates(counters = this.counters()): CohortFunnelRates {
    return {
      emit_rate: rate(counters.emitted, counters.eligible),
      deliver_rate: rate(counters.delivered, counters.emitted),
      surface_rate: rate(counters.surfaced, counters.delivered),
      open_rate: rate(counters.opened, counters.surfaced),
      details_view_rate: rate(counters.detailsViewed, counters.opened),
      planning_entry_rate: rate(counters.planningEntry, counters.opened),
      feedback_rate: rate(counters.feedback, counters.opened),
    };
  }

  advance(input: {
    stage: CohortFunnelStage;
    userId: string;
    tripId: string;
    predictionId: string;
    predictionVersion: string;
    advisoryId?: string;
    displayVariantId?: string;
    actionType?: CohortFunnelActionType;
    eventKind?: 'NATURAL' | 'CONTROLLED';
    nowMs?: number;
    meta?: Record<string, string | number | boolean>;
  }): CohortFunnelEvent {
    const event: CohortFunnelEvent = {
      stage: input.stage,
      userId: input.userId,
      tripId: input.tripId,
      predictionId: input.predictionId,
      predictionVersion: input.predictionVersion,
      advisoryId: input.advisoryId,
      displayVariantId: input.displayVariantId,
      actionType: input.actionType,
      eventKind: input.eventKind,
      at: new Date(input.nowMs ?? Date.now()).toISOString(),
      meta: input.meta,
    };
    this.record(event);
    return event;
  }

  distinctUsersAt(stage: CohortFunnelStage): number {
    const keys = new Set<string>();
    for (const e of this.events) {
      if (e.stage !== stage) continue;
      keys.add(e.userId);
    }
    return keys.size;
  }

  openedIdentities(): number {
    const keys = new Set<string>();
    for (const e of this.events) {
      if (e.stage !== 'opened') continue;
      keys.add(
        `${e.userId}::${e.tripId}::${e.predictionId}::${e.predictionVersion}`,
      );
    }
    return keys.size;
  }

  naturalOpenedCount(): number {
    return this.events.filter(
      (e) => e.stage === 'opened' && e.eventKind === 'NATURAL',
    ).length;
  }

  clear(): void {
    this.events.length = 0;
  }
}

export function diagnoseFunnelLeak(rates: CohortFunnelRates): FunnelLeakDiagnosis {
  const sample =
    (rates.deliver_rate ?? 0) +
    (rates.surface_rate ?? 0) +
    (rates.open_rate ?? 0);
  if (sample === 0) return 'INSUFFICIENT_SAMPLE';
  if (rates.deliver_rate !== null && rates.deliver_rate < 0.5) {
    return 'DELIVERY_REACH_PROBLEM';
  }
  if (rates.surface_rate !== null && rates.surface_rate < 0.5) {
    return 'SURFACE_ENTRY_OR_PAGE_EXPOSURE';
  }
  if (
    rates.surface_rate !== null &&
    rates.surface_rate >= 0.7 &&
    rates.open_rate !== null &&
    rates.open_rate < 0.5
  ) {
    return 'TITLE_OR_VALUE_EXPRESSION';
  }
  if (
    rates.open_rate !== null &&
    rates.open_rate >= 0.5 &&
    rates.planning_entry_rate !== null &&
    rates.planning_entry_rate < 0.3
  ) {
    return 'RECOMMENDATION_NOT_ACTIONABLE';
  }
  if (
    rates.planning_entry_rate !== null &&
    rates.planning_entry_rate >= 0.3 &&
    rates.feedback_rate !== null &&
    rates.feedback_rate < 0.3
  ) {
    return 'RECOMMENDATION_QUALITY';
  }
  return 'HEALTHY_FUNNEL';
}

export function summarizeCohortFunnel(store: CohortAdvisoryFunnelStore): {
  counters: CohortFunnelCounters;
  rates: CohortFunnelRates;
  openedIdentities: number;
  naturalOpened: number;
  distinctDeliveredUsers: number;
  distinctSurfacedUsers: number;
  distinctOpenedOrFeedbackUsers: number;
  leakDiagnosis: FunnelLeakDiagnosis;
  stages: typeof COHORT_FUNNEL_STAGES;
} {
  const counters = store.counters();
  const rates = store.rates(counters);
  const openedUsers = new Set(
    store.all().filter((e) => e.stage === 'opened').map((e) => e.userId),
  );
  const feedbackUsers = new Set(
    store.all().filter((e) => e.stage === 'feedback').map((e) => e.userId),
  );
  const openedOrFeedback = new Set([...openedUsers, ...feedbackUsers]);
  return {
    counters,
    rates,
    openedIdentities: store.openedIdentities(),
    naturalOpened: store.naturalOpenedCount(),
    distinctDeliveredUsers: store.distinctUsersAt('delivered'),
    distinctSurfacedUsers: store.distinctUsersAt('surfaced'),
    distinctOpenedOrFeedbackUsers: openedOrFeedback.size,
    leakDiagnosis: diagnoseFunnelLeak(rates),
    stages: COHORT_FUNNEL_STAGES,
  };
}
