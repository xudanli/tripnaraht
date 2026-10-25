/**
 * EvidenceResolver-backed authority port for Look road hints.
 * Look payload is never used as authoritative status.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { EvidenceResolverService } from '../../guardian-decision-core/evidence/evidence-resolver.service';
import { RoadStatusRealtimeService } from '../../../skills/world/services/road-status-realtime.service';
import { RFC001_EVIDENCE_RESOLVER_VERSION } from '../../guardian-decision-core/config/rfc001-iceland.config';
import { mapRealtimeStatusToChangedStatus } from '../../guardian-decision-core/evidence/road-status-changed.event';
import { mapRoadDataSourceToSourceProvider } from '../../guardian-decision-core/evidence/road-status-changed.event';
import type { LookRoadAuthorityPort } from './run-look-road-authority-decision-tick';
import type { AuthorityRoadResolveOutcome } from './look-road-authority-bridge.types';

@Injectable()
export class EvidenceResolverLookRoadAuthorityPort
  implements LookRoadAuthorityPort
{
  private readonly logger = new Logger(
    EvidenceResolverLookRoadAuthorityPort.name,
  );

  constructor(
    private readonly evidenceResolver: EvidenceResolverService,
    @Optional() private readonly roadStatusRealtime?: RoadStatusRealtimeService,
  ) {}

  async resolveAuthority(input: {
    tripId: string;
    roadId: string;
    segmentId?: string;
    correlationId?: string;
  }): Promise<AuthorityRoadResolveOutcome> {
    const roadId = input.roadId.toUpperCase();
    const attemptedAt = new Date().toISOString();
    const unavailable = (reason: string): AuthorityRoadResolveOutcome => ({
      kind: 'UNAVAILABLE',
      attemptedAt,
      reason,
      evidenceId: `ev_road_${roadId.toLowerCase()}_unavail_${attemptedAt.slice(0, 13)}`,
      version: `${RFC001_EVIDENCE_RESOLVER_VERSION}:unavailable`,
    });

    if (!this.roadStatusRealtime) {
      this.logger.warn(
        `authority UNAVAILABLE: RoadStatusRealtimeService missing road=${roadId}`,
      );
      return unavailable('road_status_realtime_unavailable');
    }

    try {
      const rs = await this.roadStatusRealtime.getRoadStatus(roadId);
      if (!rs) {
        return unavailable('road_status_fetch_empty');
      }

      const resolved = await this.evidenceResolver.resolveFromRoadStatusSnapshot(
        input.tripId,
        rs,
        { segmentId: input.segmentId, forceEvent: true },
      );

      const status = mapRealtimeStatusToChangedStatus(rs.currentStatus);
      const sourceProvider = mapRoadDataSourceToSourceProvider({
        dataSource: rs.dataSource,
        seasonalFallback: rs.seasonalFallback,
      });

      const authority =
        sourceProvider === 'admin_injection'
          ? 'INTERNAL'
          : sourceProvider === 'static_seasonal_data'
            ? 'MODEL'
            : 'OFFICIAL';

      return {
        kind: 'RESOLVED',
        status,
        observedAt: resolved.assertion.observedAt,
        sourceProvider,
        authority,
        evidenceId:
          resolved.assertion.source.evidenceRefs[0] ??
          resolved.assertion.assertionId,
        version: `${resolved.resolverVersion}:${resolved.assertion.assertionId}`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `authority UNAVAILABLE road=${roadId}: ${msg}`,
      );
      return unavailable(`road_status_resolve_error:${msg.slice(0, 120)}`);
    }
  }
}
