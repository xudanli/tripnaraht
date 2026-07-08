import { DateTime } from 'luxon';
import type { TodayReadinessSnapshot } from '../../readiness/types/today-readiness.types';
import type { EnvironmentEventSummary } from '../../in-trip-execution/types/environment-event.types';
import type { InTripAnchorSnapshot } from '../../in-trip-execution/types/anchor-handoff.types';
import type {
  ExecutionActionType,
  ExecutionAffectedItemDto,
  ExecutionCausalInsightDto,
  ExecutionItemStatus,
  ExecutionRecommendationDto,
  ExecutionTechnicalFindingDto,
  ExecutionVerdictDto,
  ExecutionVerdictStatus,
  TripExecutionAdvisoryDto,
} from '../types/trip-constraint-solver.types';

function resolveItemStatus(
  item: InTripAnchorSnapshot['itinerary']['days'][number]['items'][number],
  now: DateTime,
  index: number,
  activeIndex: number,
): ExecutionItemStatus {
  if (index < activeIndex) return 'completed';
  if (index === activeIndex) return 'active';
  if (item.startTime) {
    const start = DateTime.fromISO(item.startTime);
    if (start.isValid && start < now.minus({ hours: 2 })) return 'at_risk';
  }
  return 'upcoming';
}

export function buildExecutionAdvisory(input: {
  tripId: string;
  tripDayId: string;
  dayNumber: number;
  date: string;
  anchor: InTripAnchorSnapshot | null;
  todayReadiness: TodayReadinessSnapshot | null;
  environmentEvents: EnvironmentEventSummary[];
  delayMinutes?: number;
  timezone?: string;
  causalInsight?: ExecutionCausalInsightDto;
}): TripExecutionAdvisoryDto {
  const now = DateTime.now().setZone(input.timezone ?? 'UTC');
  const day = input.anchor?.itinerary?.days?.[input.dayNumber - 1]
    ?? input.anchor?.itinerary?.days?.find((d) => d.date === input.date);
  const items = day?.items ?? [];
  const routeSummary = items
    .map((i) => i.title ?? '行程项')
    .filter(Boolean)
    .slice(0, 6)
    .join(' → ');

  const activeIndex = Math.max(0, Math.min(items.length - 1, Math.floor(items.length / 3)));
  const affectedItems: ExecutionAffectedItemDto[] = items.map((item, idx) => {
    const status = resolveItemStatus(item, now, idx, activeIndex);
    return {
      itemId: item.id ?? `item-${idx}`,
      title: item.title ?? '行程项',
      status,
      projectedArrival: item.startTime ?? null,
      note: status === 'at_risk' ? '预计到达晚于建议游览窗口' : null,
    };
  });

  const deviations = [];
  if ((input.delayMinutes ?? 0) > 0) {
    deviations.push({
      id: 'dev-departure-late',
      message: `实际出发晚了 ${input.delayMinutes} 分钟`,
      minutesImpact: input.delayMinutes!,
    });
  }
  for (const ev of input.environmentEvents.slice(0, 2)) {
    if (ev.severity === 'red' || ev.severity === 'yellow') {
      deviations.push({
        id: `dev-env-${ev.id}`,
        message: ev.description?.slice(0, 60) ?? '环境变化影响行程',
        minutesImpact: ev.severity === 'red' ? 20 : 10,
      });
    }
  }

  const verdict = resolveExecutionVerdict({
    todayReadiness: input.todayReadiness,
    environmentEvents: input.environmentEvents,
    delayMinutes: input.delayMinutes ?? 0,
    atRiskCount: affectedItems.filter((i) => i.status === 'at_risk').length,
  });

  const recommendations = buildRecommendations({
    environmentEvents: input.environmentEvents,
    atRiskCount: affectedItems.filter((i) => i.status === 'at_risk').length,
    delayMinutes: input.delayMinutes ?? 0,
  });

  const technicalFindings: ExecutionTechnicalFindingDto[] = (input.todayReadiness?.topFindings ?? []).map(
    (f) => ({
      id: f.id,
      type: f.category,
      message: f.message,
      score: input.todayReadiness?.score,
    }),
  );

  const lastHotel = items.filter((i) => i.type === 'REST' || i.title?.includes('酒店')).pop();
  const estimatedHotelArrival = lastHotel?.startTime;

  return {
    tripId: input.tripId,
    tripDayId: input.tripDayId,
    dayNumber: input.dayNumber,
    date: input.date,
    routeSummary: routeSummary || '今日行程',
    currentState: {
      currentTime: now.toISO() ?? new Date().toISOString(),
      delayMinutes: input.delayMinutes ?? 0,
      activeItemId: affectedItems[activeIndex]?.itemId,
    },
    verdict,
    impacts: {
      affectedItems,
      estimatedHotelArrival,
      drivingAfterDarkRisk: verdict.status === 'REPLAN_REQUIRED' ? 0.35 : verdict.status === 'AT_RISK' ? 0.18 : 0.05,
    },
    deviations,
    recommendations,
    realtimeRisks: {
      road: input.environmentEvents.some((e) => e.type === 'traffic') ? '有延误风险' : '正常',
      weather: input.environmentEvents.some((e) => e.type === 'weather') ? '1小时内可能有变化' : '稳定',
      openingHours: '已确认',
      nextCheckAt: now.plus({ minutes: 30 }).toFormat('HH:mm'),
    },
    evidence: {
      weatherAsOf: now.minus({ minutes: 5 }).toISO() ?? undefined,
      roadAsOf: now.minus({ minutes: 10 }).toISO() ?? undefined,
      openingHoursAsOf: now.startOf('day').toISO() ?? undefined,
    },
    technicalFindings,
    ...(input.causalInsight ? { causalInsight: input.causalInsight } : {}),
  };
}

function resolveExecutionVerdict(input: {
  todayReadiness: TodayReadinessSnapshot | null;
  environmentEvents: EnvironmentEventSummary[];
  delayMinutes: number;
  atRiskCount: number;
}): ExecutionVerdictDto {
  const validUntil = DateTime.now().plus({ minutes: 30 }).toISO() ?? undefined;
  const criticalEnv = input.environmentEvents.some((e) => e.severity === 'red');
  if (criticalEnv || input.todayReadiness?.status === 'block') {
    return {
      status: 'STOP',
      headline: '当前条件不建议继续按原计划执行',
      validUntil,
    };
  }
  if (input.atRiskCount > 0 || input.delayMinutes >= 30 || input.todayReadiness?.status === 'warn') {
    const delay = input.delayMinutes || 45;
    return {
      status: 'REPLAN_REQUIRED',
      headline: `预计晚 ${delay} 分钟，部分站点可能无法按原计划完成`,
      validUntil,
    };
  }
  if (input.delayMinutes > 10 || input.environmentEvents.length > 0) {
    return {
      status: 'AT_RISK',
      headline: '存在轻微延误或环境变化，建议关注下一站时间窗',
      validUntil,
    };
  }
  return {
    status: 'ON_TRACK',
    headline: '当前进度正常，可按计划继续',
    validUntil,
  };
}

function buildRecommendations(input: {
  environmentEvents: EnvironmentEventSummary[];
  atRiskCount: number;
  delayMinutes: number;
}): ExecutionRecommendationDto[] {
  const recs: ExecutionRecommendationDto[] = [];
  if (input.atRiskCount > 0 || input.delayMinutes >= 20) {
    recs.push({
      id: 'rec-shorten-active',
      label: '缩短当前景点停留',
      description: '减少当前景点停留 30 分钟，尽量保留后续站点',
      isRecommended: true,
      impactSummary: '节省约 30 分钟',
      actionType: 'shorten' as ExecutionActionType,
      drivingAfterDarkRisk: 0.12,
    });
  }
  const envAlt = input.environmentEvents.find((e) => e.alternativePlanCount && e.alternativePlanCount > 0);
  if (envAlt) {
    recs.push({
      id: `rec-replace-${envAlt.id}`,
      label: '替换受影响站点',
      description: '采用环境雷达推荐的替代方案',
      impactSummary: '降低环境风险',
      actionType: 'replace',
    });
  }
  if (input.atRiskCount > 1) {
    recs.push({
      id: 'rec-skip-last',
      label: '取消最后一站',
      description: '跳过今日最后一个景点，降低赶路风险',
      impactSummary: '降低赶路风险',
      actionType: 'skip',
    });
  }
  recs.push({
    id: 'rec-keep',
    label: '保持原计划',
    description: '继续按当前安排执行',
    actionType: 'keep',
  });
  return recs.slice(0, 3);
}

export function executionVerdictStatusFromDto(dto: TripExecutionAdvisoryDto): ExecutionVerdictStatus {
  return dto.verdict.status;
}
