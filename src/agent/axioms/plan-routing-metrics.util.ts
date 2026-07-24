import type { Itinerary, ItineraryItem, TripPlanRequest } from '../interfaces/trip-plan.interface';
import type {
  PlanGenerationRoutingOutput,
  PlanRoutingDaySegment,
  PlanRoutingMetrics,
} from './plan-routing-metrics.types';

export const SINGLE_DAY_DRIVING_LIMIT_MINUTES = 8 * 60;
/** 全程纯驾驶超 10h 时，澄清链路可升格 marathon_deferred 为 CLARIFICATION 源。 */
export const TOTAL_DRIVING_CLARIFICATION_THRESHOLD_MINUTES = 10 * 60;

function drivingMinutesForItem(item: ItineraryItem): number {
  const mins = Number(item.metadata?.duration_minutes);
  if (!Number.isFinite(mins) || mins <= 0) return 0;
  if (item.type === 'DRIVE' || item.type === 'TRANSIT') return mins;
  if (item.type === 'WALK') return mins * 0.3;
  return 0;
}

/** 从 Orchestrator / Kernel 的 Itinerary 草案汇总驾驶分钟（与 TDFPM 口径一致，但不封顶 12h）。 */
export function computePlanRoutingMetricsFromItinerary(
  itinerary: Pick<Itinerary, 'days'> | null | undefined,
): PlanRoutingMetrics | undefined {
  const days = itinerary?.days;
  if (!Array.isArray(days) || days.length === 0) return undefined;

  const day_segments: PlanRoutingDaySegment[] = days.map((day, idx) => {
    let driving = 0;
    for (const item of day.items ?? []) {
      driving += drivingMinutesForItem(item);
    }
    return {
      day_index: idx + 1,
      driving_minutes: Math.round(driving),
    };
  });

  const pure_driving_minutes = day_segments.reduce((s, d) => s + d.driving_minutes, 0);
  const max_single_day_driving_minutes = day_segments.reduce(
    (m, d) => Math.max(m, d.driving_minutes),
    0,
  );

  if (pure_driving_minutes <= 0 && max_single_day_driving_minutes <= 0) return undefined;

  return {
    pure_driving_minutes,
    max_single_day_driving_minutes,
    day_segments,
    source: 'itinerary_compute',
  };
}

function readPlanOutput(trip: TripPlanRequest): PlanGenerationRoutingOutput | undefined {
  const t = trip as TripPlanRequest & {
    plan_output?: PlanGenerationRoutingOutput;
    routing_metadata?: PlanGenerationRoutingOutput;
  };
  return t.plan_output ?? t.routing_metadata;
}

function metricsFromPlanOutput(output: PlanGenerationRoutingOutput): PlanRoutingMetrics | undefined {
  const summary = output.route_summary;
  const pure = Number(summary?.pure_driving_minutes);
  const segments = Array.isArray(output.day_segments) ? output.day_segments : [];
  const maxFromSegments = segments.reduce((m, s) => Math.max(m, Number(s.driving_minutes) || 0), 0);
  const maxSingle = Number(summary?.max_single_day_driving_minutes);
  const max_single_day_driving_minutes =
    Number.isFinite(maxSingle) && maxSingle > 0 ? maxSingle : maxFromSegments;
  if (!Number.isFinite(pure) || pure <= 0) {
    if (max_single_day_driving_minutes <= 0) return undefined;
  }
  return {
    pure_driving_minutes: Number.isFinite(pure) && pure > 0 ? pure : segments.reduce((s, d) => s + (d.driving_minutes || 0), 0),
    max_single_day_driving_minutes,
    day_segments: segments,
    source: 'plan_output',
  };
}

function metricsFromRoutingMetricsField(trip: TripPlanRequest): PlanRoutingMetrics | undefined {
  const rm = (trip as TripPlanRequest & { routing_metrics?: Partial<PlanRoutingMetrics> }).routing_metrics;
  if (!rm) return undefined;
  const pure = Number(rm.pure_driving_minutes ?? rm.total_driving_minutes);
  const maxSingle = Number(rm.max_single_day_driving_minutes);
  const segments = Array.isArray(rm.day_segments) ? rm.day_segments : [];
  if ((!Number.isFinite(pure) || pure <= 0) && (!Number.isFinite(maxSingle) || maxSingle <= 0)) {
    return undefined;
  }
  return {
    pure_driving_minutes: Number.isFinite(pure) && pure > 0 ? pure : 0,
    max_single_day_driving_minutes:
      Number.isFinite(maxSingle) && maxSingle > 0
        ? maxSingle
        : segments.reduce((m, s) => Math.max(m, Number(s.driving_minutes) || 0), 0),
    day_segments: segments,
    source: 'trip.routing_metrics',
  };
}

/** 读取 PLAN_GEN 写回实数；trip 无则回退 itinerary 现场计算。 */
export function extractPlanRoutingMetrics(
  trip?: TripPlanRequest | null,
  itinerary?: Pick<Itinerary, 'days'> | null,
): PlanRoutingMetrics | undefined {
  if (trip) {
    const fromRm = metricsFromRoutingMetricsField(trip);
    if (fromRm) return fromRm;
    const output = readPlanOutput(trip);
    if (output) {
      const fromPo = metricsFromPlanOutput(output);
      if (fromPo) return fromPo;
    }
  }
  return computePlanRoutingMetricsFromItinerary(itinerary);
}

/** PLAN_GEN / REPAIR 后写回 trip_plan_request（plan_output + routing_metrics 双写）。 */
export function syncPlanRoutingMetricsToTripPlan(
  trip: TripPlanRequest,
  itinerary: Pick<Itinerary, 'days'> | null | undefined,
): TripPlanRequest {
  const computed = computePlanRoutingMetricsFromItinerary(itinerary);
  if (!computed) return trip;

  const plan_output: PlanGenerationRoutingOutput = {
    route_summary: {
      pure_driving_minutes: computed.pure_driving_minutes,
      max_single_day_driving_minutes: computed.max_single_day_driving_minutes,
      total_duration_minutes: computed.pure_driving_minutes,
    },
    day_segments: computed.day_segments,
    computed_at: new Date().toISOString(),
    source: 'itinerary_items',
  };

  return {
    ...trip,
    plan_output,
    routing_metadata: plan_output,
    routing_metrics: {
      pure_driving_minutes: computed.pure_driving_minutes,
      total_driving_minutes: computed.pure_driving_minutes,
      max_single_day_driving_minutes: computed.max_single_day_driving_minutes,
      day_segments: computed.day_segments,
    },
  } as TripPlanRequest;
}

export function isPlanRoutingFatigueOverloaded(metrics: PlanRoutingMetrics | undefined): boolean {
  if (!metrics) return false;
  return (
    metrics.max_single_day_driving_minutes > SINGLE_DAY_DRIVING_LIMIT_MINUTES ||
    metrics.pure_driving_minutes > TOTAL_DRIVING_CLARIFICATION_THRESHOLD_MINUTES
  );
}

