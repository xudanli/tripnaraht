import { PrismaService } from '../../../prisma/prisma.service';
import { DecisionLogStorageService } from '../../../trips/decision/services/decision-log-storage.service';
import type { DecisionLogEntry } from '../../../trips/decision/shared/decision-result.types';
import type { TripStatusUnderstanding } from '../shared/detail-state.types';

export interface DetailTripData {
  startDate: string;
  endDate: string;
  status?: string | null;
  destination: string;
  days: Array<{
    date: string;
    items: Array<{
      id: string;
      type: string;
      startTime?: string;
      endTime?: string;
      name?: string;
      completed: boolean;
      travelMode?: string | null;
    }>;
  }>;
}

export async function loadDetailTripData(
  prisma: PrismaService,
  tripId: string,
): Promise<DetailTripData | null> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      TripDay: {
        orderBy: { date: 'asc' },
        include: {
          ItineraryItem: {
            orderBy: { order: 'asc' },
            include: { Place: true },
          },
        },
      },
    },
  });

  if (!trip) {
    return null;
  }

  const now = Date.now();

  return {
    startDate: trip.startDate.toISOString(),
    endDate: trip.endDate.toISOString(),
    status: trip.status,
    destination: trip.destination,
    days: trip.TripDay.map((day) => ({
      date: day.date.toISOString(),
      items: day.ItineraryItem.map((item) => ({
        id: item.id,
        type: item.type,
        startTime: item.startTime?.toISOString(),
        endTime: item.endTime?.toISOString(),
        name: item.Place?.nameCN ?? item.Place?.nameEN ?? item.note ?? undefined,
        completed:
          item.bookingStatus?.toLowerCase() === 'completed' ||
          (item.endTime ? item.endTime.getTime() < now : false),
        travelMode: item.travelMode,
      })),
    })),
  };
}

export async function loadDecisionLogsForTrip(
  storage: DecisionLogStorageService,
  tripId: string,
  decisionId?: string,
): Promise<DecisionLogEntry[]> {
  const logs = await storage.queryLogs({ tripId, limit: 200 });
  if (!decisionId) {
    return logs;
  }
  return logs.filter(
    (log) =>
      (log.metadata as Record<string, unknown> | undefined)?.planDecisionId === decisionId ||
      (log.metadata as Record<string, unknown> | undefined)?.decisionId === decisionId,
  );
}

export function extractRisksFromDecisionLogs(
  logs: DecisionLogEntry[],
): TripStatusUnderstanding['risks'] {
  const risks: TripStatusUnderstanding['risks'] = [];

  for (const log of logs) {
    if (log.action !== 'REJECT' && log.action !== 'ADJUST') {
      continue;
    }
    const severity =
      log.action === 'REJECT'
        ? 'high'
        : log.reasonCodes.some((c) => /critical|overrun|infeasible/i.test(c))
          ? 'high'
          : 'medium';

    risks.push({
      type: log.decisionStage || log.persona,
      severity,
      description: log.explanation,
      mitigation: log.reasonCodes.length > 0 ? `关注: ${log.reasonCodes.join(', ')}` : undefined,
    });
  }

  return risks.slice(0, 10);
}

export function extractOpportunitiesFromTripData(
  tripData: DetailTripData,
): TripStatusUnderstanding['opportunities'] {
  const opportunities: TripStatusUnderstanding['opportunities'] = [];
  const openDays = tripData.days.filter((d) => d.items.length < 3);

  if (openDays.length > 0) {
    opportunities.push({
      type: 'schedule_flexibility',
      description: `${openDays.length} 天行程较空，可补充体验或休息`,
      benefit: '提升行程弹性，降低疲劳',
    });
  }

  const transitItems = tripData.days.flatMap((d) => d.items).filter((i) => i.type === 'TRANSIT');
  if (transitItems.length === 0 && tripData.days.length > 1) {
    opportunities.push({
      type: 'transport_planning',
      description: '尚未安排显式交通段，可优化转场时间窗',
      benefit: '减少不可达与赶场风险',
    });
  }

  return opportunities;
}
