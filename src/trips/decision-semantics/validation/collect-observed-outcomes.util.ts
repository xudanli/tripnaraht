/**
 * Collect observed outcomes from feasibility + POI feedback + light execution signals.
 */

import type { PrismaService } from '../../../prisma/prisma.service';
import type { TripFeasibilityReportDto } from '../../trip-constraint-solver/types/trip-constraint-solver.types';
import type {
  DecisionRecord,
  ObservedOutcome,
  ObservedOutcomeSource,
} from '../types/decision-semantics.types';
import type { LightExecutionSignal } from './load-light-execution-observations.util';

export interface ObservedCollectionContext {
  report: TripFeasibilityReportDto;
  problemStillOpen: boolean;
  poiFeedbackRows: Array<{
    arrivalTime: string | null;
    visitDurationMin: number | null;
    couldNotPark: boolean;
    abandonedDueToCrowd: boolean;
    createdAt: Date;
  }>;
  lightExecutionSignals?: LightExecutionSignal[];
}

export async function loadPoiFeedbackSinceDecision(
  prisma: PrismaService,
  tripId: string,
  decidedAt: string,
): Promise<ObservedCollectionContext['poiFeedbackRows']> {
  const since = new Date(decidedAt);
  return prisma.poiExecutionFeedback.findMany({
    where: {
      tripId,
      createdAt: { gte: since },
    },
    select: {
      arrivalTime: true,
      visitDurationMin: true,
      couldNotPark: true,
      abandonedDueToCrowd: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}

function sourcePriority(source: ObservedOutcomeSource): number {
  switch (source) {
    case 'USER_ARRIVAL_CLICK':
    case 'ITINERARY_ITEM_STATUS':
    case 'BOOKING_CHECKIN':
    case 'NAVIGATION_EVENT':
      return 3;
    case 'POI_FEEDBACK':
    case 'USER_CONFIRMATION':
      return 2;
    case 'GPS':
      return 4;
    default:
      return 1;
  }
}

export function mergeObservedByMetric(observed: ObservedOutcome[]): ObservedOutcome[] {
  const byMetric = new Map<string, ObservedOutcome>();
  for (const o of observed) {
    const prev = byMetric.get(o.metric);
    if (!prev) {
      byMetric.set(o.metric, o);
      continue;
    }
    const prevScore = prev.confidence + sourcePriority(prev.source) * 0.05;
    const nextScore = o.confidence + sourcePriority(o.source) * 0.05;
    if (nextScore >= prevScore) {
      byMetric.set(o.metric, o);
    }
  }
  return [...byMetric.values()];
}

function mapLightSignalToObserved(signal: LightExecutionSignal): ObservedOutcome | null {
  switch (signal.kind) {
    case 'user_arrival_click':
      return {
        metric: 'ARRIVAL_TIME',
        actualValue: signal.value,
        observedAt: signal.observedAt,
        source: 'USER_ARRIVAL_CLICK',
        confidence: 0.85,
      };
    case 'split_reunion_arrived':
      return {
        metric: 'ACTIVITY_COMPLETION',
        actualValue: signal.value === 'completed',
        observedAt: signal.observedAt,
        source: 'USER_ARRIVAL_CLICK',
        confidence: 0.8,
      };
    case 'itinerary_item_timing':
      return {
        metric: 'ACTIVITY_COMPLETION',
        actualValue: signal.value === 'completed',
        observedAt: signal.observedAt,
        source: 'ITINERARY_ITEM_STATUS',
        confidence: signal.value === 'completed' ? 0.82 : 0.65,
      };
    case 'booking_checkin':
      return {
        metric: 'ACTIVITY_COMPLETION',
        actualValue: true,
        observedAt: signal.observedAt,
        source: 'BOOKING_CHECKIN',
        confidence: 0.78,
      };
    case 'navigation_motion':
      return {
        metric: 'ARRIVAL_TIME',
        actualValue: typeof signal.value === 'number' ? `motion:${signal.value}` : String(signal.value),
        observedAt: signal.observedAt,
        source: 'NAVIGATION_EVENT',
        confidence: 0.6,
      };
    default:
      return null;
  }
}

export function collectObservedOutcomes(ctx: ObservedCollectionContext): ObservedOutcome[] {
  const observed: ObservedOutcome[] = [];
  const now = new Date().toISOString();
  const verifiedAt = ctx.report.verifiedAt ?? now;

  observed.push({
    metric: 'CONSTRAINT_VIOLATION',
    actualValue: ctx.problemStillOpen,
    observedAt: verifiedAt,
    source: 'SYSTEM_INFERENCE',
    confidence: ctx.report.isStale ? 0.5 : 0.88,
  });

  const driveIssue = ctx.report.issues.find((i) => i.issueKind === 'daily_drive');
  if (driveIssue?.anchors?.travelMinutes != null) {
    observed.push({
      metric: 'DRIVING_DURATION',
      actualValue: driveIssue.anchors.travelMinutes,
      observedAt: verifiedAt,
      source: 'SYSTEM_INFERENCE',
      confidence: ctx.report.isStale ? 0.55 : 0.9,
    });
  }

  const totalFeedback = ctx.poiFeedbackRows.length;
  if (totalFeedback > 0) {
    const completedActivities = ctx.poiFeedbackRows.filter(
      (r) => !r.abandonedDueToCrowd && !r.couldNotPark,
    ).length;
    observed.push({
      metric: 'ACTIVITY_COMPLETION',
      actualValue: completedActivities === totalFeedback,
      observedAt: ctx.poiFeedbackRows[0].createdAt.toISOString(),
      source: 'POI_FEEDBACK',
      confidence: 0.75,
    });

    const withArrival = ctx.poiFeedbackRows.find((r) => r.arrivalTime);
    if (withArrival?.arrivalTime) {
      observed.push({
        metric: 'ARRIVAL_TIME',
        actualValue: withArrival.arrivalTime,
        observedAt: withArrival.createdAt.toISOString(),
        source: 'USER_ARRIVAL_CLICK',
        confidence: 0.88,
      });
    }
  }

  for (const signal of ctx.lightExecutionSignals ?? []) {
    const mapped = mapLightSignalToObserved(signal);
    if (mapped) observed.push(mapped);
  }

  return mergeObservedByMetric(observed);
}

export function buildValidationBaselineFromReport(
  report: TripFeasibilityReportDto,
  problemOpen: boolean,
): DecisionRecord['validationBaseline'] {
  return {
    capturedAt: new Date().toISOString(),
    feasibilityMustHandle: report.summary?.mustHandle ?? 0,
    feasibilityVerdict: report.verdict?.status ?? 'UNKNOWN',
    problemOpen,
    overallScore: report.overallScore,
    canStartExecute: report.canStartExecute,
  };
}
