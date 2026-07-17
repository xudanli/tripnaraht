import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorldStateStoreService } from '../../guardian-decision-core/evidence/world-state-store.service';
import { resolveSameDayHotelAnchor } from '../utils/same-day-hotel-anchor.util';
import type {
  CanonicalSameDayContext,
  CanonicalTeamFact,
  CanonicalTomorrowFact,
  TripPhaseHint,
} from '../types/contextual-recommendations.types';

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

function parseHhMm(date: Date | null | undefined): string | null {
  if (!date) return null;
  const iso = date.toISOString();
  const m = iso.match(/T(\d{2}):(\d{2})/);
  if (m) return `${m[1]}:${m[2]}`;
  const hh = date.getUTCHours();
  const mm = date.getUTCMinutes();
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function formatDateStartTime(date: Date | null): string | null {
  if (!date) return null;
  return parseHhMm(date);
}

@Injectable()
export class SameDayContextBuilderService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly worldStateStore?: WorldStateStoreService,
  ) {}

  async buildCanonical(
    tripId: string,
    opts?: { focusDayIndex?: number; nowIso?: string },
  ): Promise<CanonicalSameDayContext> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        destination: true,
        startDate: true,
        endDate: true,
        metadata: true,
        pacingConfig: true,
        TripCollaborator: { select: { userId: true, role: true } },
        TripDay: {
          orderBy: { date: 'asc' },
          include: {
            ItineraryItem: {
              include: { Place: { include: { City: true } } },
              orderBy: [{ order: 'asc' }, { startTime: 'asc' }],
            },
          },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ${tripId} 不存在`);
    }

    const fromBackend: string[] = [
      'trip.destination',
      'trip.TripDay',
      'trip.ItineraryItem',
    ];
    const countryCode = String(trip.destination || 'IS').toUpperCase().slice(0, 2);
    const days = trip.TripDay;
    const tripPhase = this.inferTripPhase(trip.startDate, trip.endDate);
    fromBackend.push('trip.startDate→tripPhase');

    const focusDayIndex = this.resolveFocusDayIndex(
      days.map((d) => d.date),
      opts?.focusDayIndex,
      opts?.nowIso,
      tripPhase,
    );
    fromBackend.push('focusDayIndex');

    const hotelResolved = resolveSameDayHotelAnchor({
      focusDayIndex,
      days: days.map((d, i) => ({
        dayIndex: i + 1,
        items: d.ItineraryItem.map((item) => ({
          type: item.type,
          note: item.note,
          bookingStatus: item.bookingStatus,
          Place: item.Place,
        })),
      })),
    });
    if (hotelResolved.sourceNote) {
      fromBackend.push(hotelResolved.sourceNote);
    } else {
      fromBackend.push('hotel.anchor.missing');
    }
    const hotel = hotelResolved.hotel;
    const tomorrow = this.extractTomorrowFromFocus(days, focusDayIndex, fromBackend);
    const team = this.extractTeam(
      trip.metadata,
      trip.pacingConfig,
      trip.TripCollaborator.length,
      fromBackend,
    );
    const weatherHint = await this.resolveWeatherHint(tripId, focusDayIndex, fromBackend);

    return {
      tripId,
      destination: trip.destination,
      countryCode,
      focusDayIndex,
      tripPhase,
      hotel,
      tomorrow,
      team,
      weatherHint,
      sources: { fromDelta: [], fromBackend: [...new Set(fromBackend)] },
    };
  }

  private resolveFocusDayIndex(
    dayDates: Date[],
    explicit?: number,
    nowIso?: string,
    tripPhase?: TripPhaseHint,
  ): number {
    if (explicit != null && Number.isFinite(explicit)) {
      return Math.max(1, Math.min(dayDates.length || 1, Math.floor(explicit)));
    }
    if (dayDates.length === 0) return 1;
    const now = nowIso ? new Date(nowIso) : new Date();
    if (!Number.isNaN(now.getTime())) {
      const ymd = now.toISOString().slice(0, 10);
      const idx = dayDates.findIndex((d) => d.toISOString().slice(0, 10) === ymd);
      if (idx >= 0) return idx + 1;
    }
    if (tripPhase === 'ARRIVAL_DAY') return 1;
    if (tripPhase === 'DEPARTURE_DAY') return dayDates.length;
    return 1;
  }

  private async resolveWeatherHint(
    tripId: string,
    dayIndex: number,
    fromBackend: string[],
  ): Promise<string | null> {
    if (!this.worldStateStore) return null;
    try {
      const assertion = await this.worldStateStore.getActiveWeatherAssertionForDay(
        tripId,
        dayIndex,
      );
      if (!assertion) return null;
      fromBackend.push('worldState.weather.hazard');
      const payload = assertion.payload as {
        windSpeedKmh?: number;
        windGustKmh?: number;
        requiresGuide?: boolean;
      };
      const wind = Math.max(payload.windSpeedKmh ?? 0, payload.windGustKmh ?? 0);
      if (payload.requiresGuide) return `大风需向导（约 ${wind} km/h）`;
      if (wind >= 15) return `大风约 ${Math.round(wind)} km/h`;
      return 'weather.hazard';
    } catch {
      return null;
    }
  }

  private inferTripPhase(startDate: Date | null, endDate: Date | null): TripPhaseHint {
    if (!startDate) return 'UNKNOWN';
    const now = new Date();
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : null;
    const dayMs = 24 * 60 * 60 * 1000;
    const startDiff = (now.getTime() - start.getTime()) / dayMs;
    if (startDiff >= -1 && startDiff < 1) return 'ARRIVAL_DAY';
    if (end) {
      const endDiff = (now.getTime() - end.getTime()) / dayMs;
      if (endDiff >= -0.5 && endDiff < 1.5) return 'DEPARTURE_DAY';
    }
    if (startDiff >= 1 && (!end || now <= end)) return 'IN_TRIP';
    if (startDiff < -1) return 'ARRIVAL_DAY';
    return 'UNKNOWN';
  }

  private extractTomorrowFromFocus(
    days: Array<{
      ItineraryItem: Array<{
        startTime: Date | null;
        type: string;
        note: string | null;
        Place: { nameCN: string | null; nameEN: string | null; category: string } | null;
      }>;
    }>,
    focusDayIndex: number,
    fromBackend: string[],
  ): CanonicalTomorrowFact | null {
    const nextIdx = focusDayIndex; // 0-based next = focusDayIndex (1-based focus → next day at index focusDayIndex)
    if (nextIdx >= days.length) return null;
    const day = days[nextIdx];
    let firstActivityStart: string | null = null;
    for (const item of day.ItineraryItem) {
      if (item.Place?.category === 'HOTEL') continue;
      const t = formatDateStartTime(item.startTime);
      if (t) {
        firstActivityStart = t;
        break;
      }
    }
    const earlyDeparture =
      firstActivityStart != null &&
      (() => {
        const [hh, mm] = firstActivityStart.split(':').map(Number);
        return hh * 60 + mm <= 9 * 60;
      })();
    fromBackend.push(`day${focusDayIndex + 1}.firstActivity`);
    return {
      dayIndex: focusDayIndex + 1,
      firstActivityStart,
      theme: null,
      earlyDeparture,
    };
  }

  private extractTeam(
    metadata: unknown,
    pacingConfig: unknown,
    collaboratorCount: number,
    fromBackend: string[],
  ): CanonicalTeamFact {
    const meta = asRecord(metadata);
    const pacing = asRecord(pacingConfig);
    const party = asRecord(meta.party ?? meta.team ?? meta.travelers);
    const members = Array.isArray(meta.members) ? meta.members : [];

    let childrenPresent =
      party.childrenPresent === true ||
      Number(party.childrenCount ?? party.childCount ?? 0) > 0 ||
      members.some((m) => {
        const row = asRecord(m);
        return row.isChild === true || String(row.ageGroup ?? '').toLowerCase() === 'child';
      });

    let elderlyPresent =
      party.elderlyPresent === true ||
      Number(party.elderlyCount ?? 0) > 0 ||
      members.some((m) => {
        const row = asRecord(m);
        return row.isElderly === true || String(row.ageGroup ?? '').toLowerCase() === 'elderly';
      });

    const physicalConstraints: string[] = [];
    const fitness = meta.fitness ?? pacing.fitness ?? party.fitness;
    if (typeof fitness === 'string' && /low|弱|限制|limited/i.test(fitness)) {
      physicalConstraints.push(fitness);
    }
    for (const m of members) {
      const row = asRecord(m);
      if (typeof row.physicalLimitation === 'string') {
        physicalConstraints.push(row.physicalLimitation);
      }
      if (typeof row.constraint === 'string') {
        physicalConstraints.push(row.constraint);
      }
    }

    if (meta.hasChildren === true) childrenPresent = true;
    if (meta.hasElderly === true) elderlyPresent = true;

    const memberCount = Math.max(
      collaboratorCount,
      Number(party.adultCount ?? 0) + Number(party.childrenCount ?? 0),
      members.length,
      1,
    );

    fromBackend.push('trip.metadata.team');
    return {
      memberCount,
      childrenPresent,
      elderlyPresent,
      physicalConstraints: [...new Set(physicalConstraints)],
    };
  }
}
