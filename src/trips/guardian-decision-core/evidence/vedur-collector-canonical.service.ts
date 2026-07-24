/**
 * Canonical handoff for signed Vedur collector payloads → evidence store + resolver.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import type { WeatherData } from '../../../data-contracts/interfaces/weather.interface';
import { wrapWeatherDataAsEnvelope } from '../../../data-contracts/mappers/evidence-envelope.mapper';
import { EvidenceResolverService } from './evidence-resolver.service';
import { buildWeatherHazardChangedEvent } from './weather-hazard-changed.event';
import type { VedurRawObservation } from './vedur-raw-xml.util';
import { windMsToKmh } from './vedur-raw-xml.util';
import { VedurWeatherEvidenceStoreService } from './vedur-weather-evidence.store';
import {
  buildWeatherObservationFingerprint,
  classifyWeatherRiskTier,
  shouldEmitWeatherObservationChange,
  type WeatherRiskTier,
} from './weather-observation-change.util';

export type VedurCollectorCanonicalOutcome = 'SILENT' | 'ASSERTION_EMITTED';

export interface VedurCollectorCanonicalResult {
  outcome: VedurCollectorCanonicalOutcome;
  ingestStored: boolean;
  riskTier: WeatherRiskTier;
  windSpeedKmh: number;
  windGustKmh?: number;
  fingerprint: string;
  detail: string;
  assertionId?: string;
  eventId?: string;
}

@Injectable()
export class VedurCollectorCanonicalService {
  private readonly logger = new Logger(VedurCollectorCanonicalService.name);

  constructor(
    private readonly vedurStore: VedurWeatherEvidenceStoreService,
    @Optional() private readonly evidenceResolver?: EvidenceResolverService,
  ) {}

  async processIngest(input: {
    tripId: string;
    dayIndex: number;
    observation: VedurRawObservation;
    ingestId: string;
  }): Promise<VedurCollectorCanonicalResult> {
    const regionId = `day_${input.dayIndex}`;
    const windSpeedKmh = windMsToKmh(input.observation.windSpeedMs);
    const windGustKmh =
      input.observation.windGustMs != null ? windMsToKmh(input.observation.windGustMs) : undefined;
    const riskTier = classifyWeatherRiskTier(windSpeedKmh, windGustKmh);
    const fingerprint = buildWeatherObservationFingerprint({
      source: 'iceland_met',
      stationId: input.observation.stationId,
      windSpeedKmh,
      windGustKmh,
      observedAt: input.observation.observedAt,
    });

    const weatherData: WeatherData = {
      temperature: input.observation.temperatureC ?? 0,
      condition: 'observed',
      windSpeed: input.observation.windSpeedMs,
      lastUpdated: new Date(input.observation.observedAt),
      source: 'vedur.is',
      metadata: {
        stationId: input.observation.stationId,
        collectorIngestId: input.ingestId,
        transport: 'remote_collector',
      },
    };

    const envelope = wrapWeatherDataAsEnvelope(weatherData, {
      kind: 'REGION',
      id: regionId,
      label: regionId,
    });

    const previous = await this.vedurStore.getLatest(input.tripId, input.dayIndex, regionId);
    const prevSnapshot = previous
      ? {
          windSpeedKmh: previous.windSpeedKmh,
          windGustKmh: previous.windGustKmh,
          riskTier: previous.riskTier,
          fingerprint: previous.fingerprint,
          observedAt: previous.observedAt,
          validUntil: previous.validUntil,
        }
      : undefined;

    const nextSnapshot = {
      windSpeedKmh,
      windGustKmh,
      riskTier,
      fingerprint,
      observedAt: input.observation.observedAt,
      validUntil: envelope.validUntil,
    };

    const shouldEmit = shouldEmitWeatherObservationChange({
      previous: prevSnapshot,
      next: nextSnapshot,
    });

    const { stored } = await this.vedurStore.persistObservation({
      tripId: input.tripId,
      dayIndex: input.dayIndex,
      regionId,
      envelope,
      fingerprint,
      riskTier,
      windSpeedKmh,
      windGustKmh,
    });

    await this.vedurStore.appendPollAudit(input.tripId, {
      polledAt: new Date().toISOString(),
      dayIndex: input.dayIndex,
      regionId,
      outcome: stored ? 'INGESTED' : 'UNCHANGED',
      fingerprint,
      riskTier,
      weatherSource: 'vedur.is',
      sourceProvider: 'iceland_met',
      detail: `collector ingestId=${input.ingestId}`,
    });

    if (!shouldEmit) {
      this.logger.log(
        `collector canonical SILENT trip=${input.tripId} day=${input.dayIndex} wind=${windSpeedKmh} tier=${riskTier}`,
      );
      return {
        outcome: 'SILENT',
        ingestStored: stored,
        riskTier,
        windSpeedKmh,
        windGustKmh,
        fingerprint,
        detail: `anti-noise gate — wind=${windSpeedKmh} gust=${windGustKmh ?? 'n/a'} tier=${riskTier} stored=${stored}`,
      };
    }

    if (!this.evidenceResolver) {
      throw new Error('EvidenceResolverService unavailable for collector canonical emit');
    }

    const event = buildWeatherHazardChangedEvent({
      tripId: input.tripId,
      dayIndex: input.dayIndex,
      regionId,
      windSpeedKmh,
      windGustKmh,
      sourceProvider: 'iceland_met',
      occurredAt: input.observation.observedAt,
    });

    const resolved = await this.evidenceResolver.resolveWeatherHazardChanged(event);

    this.logger.log(
      `collector canonical ASSERTION_EMITTED trip=${input.tripId} day=${input.dayIndex} wind=${windSpeedKmh} tier=${riskTier}`,
    );

    return {
      outcome: 'ASSERTION_EMITTED',
      ingestStored: stored,
      riskTier,
      windSpeedKmh,
      windGustKmh,
      fingerprint,
      detail: `assertion emitted wind=${windSpeedKmh} tier=${riskTier}`,
      assertionId: resolved.assertion.assertionId,
      eventId: resolved.event.eventId,
    };
  }
}
