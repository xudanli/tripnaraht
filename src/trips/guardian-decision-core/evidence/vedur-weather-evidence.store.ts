/**
 * Trip metadata store for authoritative Vedur weather evidence envelopes.
 */

import { Injectable } from '@nestjs/common';
import type { EvidenceEnvelope } from '../../../travel-cognition';
import type { WeatherData } from '../../../data-contracts/interfaces/weather.interface';
import { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import { RFC001_VEDUR_WEATHER_EVIDENCE_METADATA_KEY } from '../../../decision-runtime/monitoring/config/iceland-vedur-monitoring.config';
import type { WeatherRiskTier } from './weather-observation-change.util';

export interface VedurWeatherEvidenceRecord {
  dayIndex: number;
  regionId: string;
  envelope: EvidenceEnvelope<WeatherData>;
  fingerprint: string;
  riskTier: WeatherRiskTier;
  windSpeedKmh: number;
  windGustKmh?: number;
  observedAt: string;
  validUntil: string;
  source: string;
  persistedAt: string;
}

export interface VedurWeatherPollAuditEntry {
  polledAt: string;
  dayIndex: number;
  regionId: string;
  outcome: 'INGESTED' | 'UNCHANGED' | 'UNAVAILABLE' | 'NO_LOCATION';
  fingerprint?: string;
  riskTier?: WeatherRiskTier;
  detail?: string;
  weatherSource?: string;
  sourceProvider?: 'iceland_met' | 'global_weather';
}

interface VedurWeatherEvidenceState {
  byDayRegion: Record<string, VedurWeatherEvidenceRecord>;
  polls: VedurWeatherPollAuditEntry[];
  recoveryStreakByDay?: Record<string, { streak: number; lastJobRunId?: string; lastFingerprint?: string }>;
}

const MAX_POLL_AUDIT = 48;

function dayRegionKey(dayIndex: number, regionId: string): string {
  return `${dayIndex}:${regionId}`;
}

@Injectable()
export class VedurWeatherEvidenceStoreService {
  constructor(private readonly prisma: PrismaService) {}

  async getLatest(
    tripId: string,
    dayIndex: number,
    regionId: string,
  ): Promise<VedurWeatherEvidenceRecord | undefined> {
    const state = await this.readState(tripId);
    return state.byDayRegion[dayRegionKey(dayIndex, regionId)];
  }

  async persistObservation(input: {
    tripId: string;
    dayIndex: number;
    regionId: string;
    envelope: EvidenceEnvelope<WeatherData>;
    fingerprint: string;
    riskTier: WeatherRiskTier;
    windSpeedKmh: number;
    windGustKmh?: number;
  }): Promise<{ stored: boolean; record: VedurWeatherEvidenceRecord }> {
    const state = await this.readState(input.tripId);
    const key = dayRegionKey(input.dayIndex, input.regionId);
    const prev = state.byDayRegion[key];
    const now = new Date().toISOString();

    if (prev?.fingerprint === input.fingerprint) {
      return { stored: false, record: prev };
    }

    const record: VedurWeatherEvidenceRecord = {
      dayIndex: input.dayIndex,
      regionId: input.regionId,
      envelope: input.envelope,
      fingerprint: input.fingerprint,
      riskTier: input.riskTier,
      windSpeedKmh: input.windSpeedKmh,
      windGustKmh: input.windGustKmh,
      observedAt: input.envelope.observedAt,
      validUntil: input.envelope.validUntil ?? now,
      source: input.envelope.source,
      persistedAt: now,
    };

    state.byDayRegion[key] = record;
    await this.writeState(input.tripId, state);
    return { stored: true, record };
  }

  async appendPollAudit(tripId: string, entry: VedurWeatherPollAuditEntry): Promise<void> {
    const state = await this.readState(tripId);
    state.polls = [...state.polls, entry].slice(-MAX_POLL_AUDIT);
    await this.writeState(tripId, state);
  }

  async trackCalmRecoveryStreak(
    tripId: string,
    dayIndex: number,
    riskTier: WeatherRiskTier,
    opts?: { jobRunId?: string; fingerprint?: string },
  ): Promise<number> {
    const state = await this.readState(tripId);
    const key = String(dayIndex);
    const streaks = { ...(state.recoveryStreakByDay ?? {}) };
    const prev = streaks[key] ?? { streak: 0 };

    if (opts?.jobRunId && prev.lastJobRunId === opts.jobRunId) {
      return prev.streak;
    }

    if (riskTier !== 'CALM') {
      streaks[key] = {
        streak: 0,
        lastJobRunId: opts?.jobRunId,
        lastFingerprint: opts?.fingerprint,
      };
      state.recoveryStreakByDay = streaks;
      await this.writeState(tripId, state);
      return 0;
    }

    const next = prev.streak + 1;
    streaks[key] = {
      streak: next,
      lastJobRunId: opts?.jobRunId,
      lastFingerprint: opts?.fingerprint,
    };
    state.recoveryStreakByDay = streaks;
    await this.writeState(tripId, state);
    return next;
  }

  async readCalmRecoveryStreak(tripId: string, dayIndex: number): Promise<number> {
    const state = await this.readState(tripId);
    return state.recoveryStreakByDay?.[String(dayIndex)]?.streak ?? 0;
  }

  private async readState(tripId: string): Promise<VedurWeatherEvidenceState> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = (trip?.metadata as Record<string, unknown>) ?? {};
    const raw = meta[RFC001_VEDUR_WEATHER_EVIDENCE_METADATA_KEY] as VedurWeatherEvidenceState | undefined;
    return {
      byDayRegion: raw?.byDayRegion ?? {},
      polls: raw?.polls ?? [],
      recoveryStreakByDay: raw?.recoveryStreakByDay ?? {},
    };
  }

  private async writeState(tripId: string, state: VedurWeatherEvidenceState): Promise<void> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = { ...((trip?.metadata as Record<string, unknown>) ?? {}) };
    meta[RFC001_VEDUR_WEATHER_EVIDENCE_METADATA_KEY] = state;
    await this.prisma.trip.update({
      where: { id: tripId },
      data: { metadata: toInputJsonValue(meta) },
    });
  }
}
