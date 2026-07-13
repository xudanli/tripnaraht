/**
 * Canonical handoff for signed Gagnaveita collector payloads → road evidence + resolver.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import type { RoadStatus } from '../../../skills/world/services/road-status-realtime.service';
import { EvidenceResolverService } from './evidence-resolver.service';
import {
  buildRoadStatusFingerprint,
  GAGNAVEITA_CANONICAL_PROVIDER,
} from './gagnaveita-faerd.mapper';
import {
  roadStatusFromCollectorPayload,
  shouldEmitGagnaveitaRoadStatusChange,
} from './gagnaveita-collector-parse.util';
import { GagnaveitaRoadEvidenceStoreService } from './gagnaveita-road-evidence.store';
import { WorldStateStoreService } from './world-state-store.service';
import {
  buildRoadStatusChangedEvent,
  mapRealtimeStatusToChangedStatus,
} from './road-status-changed.event';
import type { RoadStatusChangedStatus } from './road-status-changed.event';
import type { RoadStatusAssertionPayload } from '../adapters/road-status-to-assertion.adapter';

export type GagnaveitaCollectorCanonicalOutcome = 'SILENT' | 'ASSERTION_EMITTED';

export interface GagnaveitaCollectorCanonicalResult {
  outcome: GagnaveitaCollectorCanonicalOutcome;
  ingestStored: boolean;
  roadId: string;
  currentStatus: string;
  changedStatus: RoadStatusChangedStatus;
  fingerprint: string;
  detail: string;
}

@Injectable()
export class GagnaveitaCollectorCanonicalService {
  private readonly logger = new Logger(GagnaveitaCollectorCanonicalService.name);

  constructor(
    private readonly roadStore: GagnaveitaRoadEvidenceStoreService,
    @Optional() private readonly evidenceResolver?: EvidenceResolverService,
    @Optional() private readonly worldStateStore?: WorldStateStoreService,
  ) {}

  async processIngest(input: {
    tripId: string;
    roadId: string;
    payload: string;
    payloadSha256: string;
    ingestId: string;
  }): Promise<GagnaveitaCollectorCanonicalResult> {
    const roadId = input.roadId.toUpperCase();
    const { roadStatus } = roadStatusFromCollectorPayload({
      payload: input.payload,
      roadId,
    });

    if (!roadStatus) {
      await this.roadStore.appendPollAudit(input.tripId, {
        polledAt: new Date().toISOString(),
        roadId,
        outcome: 'UNMAPPED',
        detail: `no segments resolved for roadId=${roadId}`,
        roadSource: 'gagnaveita.vegagerdin.is',
        sourceProvider: GAGNAVEITA_CANONICAL_PROVIDER,
      });
      throw new Error(`gagnaveita_road_unmapped:${roadId}`);
    }

    const fingerprint = buildRoadStatusFingerprint({
      source: GAGNAVEITA_CANONICAL_PROVIDER,
      roadId: roadStatus.roadId,
      status: roadStatus.currentStatus,
      observedAt: roadStatus.lastVerifiedAt.toISOString(),
    });
    const changedStatus = mapRealtimeStatusToChangedStatus(roadStatus.currentStatus);

    const previous = await this.roadStore.getLatest(input.tripId, roadId);
    const shouldEmit = shouldEmitGagnaveitaRoadStatusChange({
      previousFingerprint: previous?.fingerprint,
      nextFingerprint: fingerprint,
    });

    const { stored } = await this.roadStore.persistRoadStatus({
      tripId: input.tripId,
      roadId,
      roadStatus,
      fingerprint,
      payloadSha256: input.payloadSha256,
      ingestId: input.ingestId,
    });

    await this.roadStore.appendPollAudit(input.tripId, {
      polledAt: new Date().toISOString(),
      roadId,
      outcome: stored ? 'INGESTED' : 'UNCHANGED',
      fingerprint,
      currentStatus: roadStatus.currentStatus,
      roadSource: 'gagnaveita.vegagerdin.is',
      sourceProvider: GAGNAVEITA_CANONICAL_PROVIDER,
      detail: `collector ingestId=${input.ingestId}`,
    });

    if (!shouldEmit) {
      this.logger.log(
        `collector canonical SILENT trip=${input.tripId} road=${roadId} status=${roadStatus.currentStatus}`,
      );
      return {
        outcome: 'SILENT',
        ingestStored: stored,
        roadId,
        currentStatus: roadStatus.currentStatus,
        changedStatus,
        fingerprint,
        detail: `anti-noise gate — status=${roadStatus.currentStatus} stored=${stored}`,
      };
    }

    if (!this.evidenceResolver) {
      throw new Error('EvidenceResolverService unavailable for collector canonical emit');
    }

    const previousAssertion = this.worldStateStore
      ? await this.worldStateStore.getActiveAssertionForRoad(input.tripId, roadId)
      : undefined;
    const previousStatus = previousAssertion
      ? (previousAssertion.payload as RoadStatusAssertionPayload).status
      : undefined;

    const event = buildRoadStatusChangedEvent({
      tripId: input.tripId,
      roadId,
      status: changedStatus,
      previousStatus,
      sourceProvider: GAGNAVEITA_CANONICAL_PROVIDER,
      occurredAt: roadStatus.lastVerifiedAt.toISOString(),
    });

    await this.evidenceResolver.resolveRoadStatusChanged(event);

    this.logger.log(
      `collector canonical ASSERTION_EMITTED trip=${input.tripId} road=${roadId} status=${changedStatus}`,
    );

    return {
      outcome: 'ASSERTION_EMITTED',
      ingestStored: stored,
      roadId,
      currentStatus: roadStatus.currentStatus,
      changedStatus,
      fingerprint,
      detail: `assertion emitted status=${changedStatus}`,
    };
  }
}
