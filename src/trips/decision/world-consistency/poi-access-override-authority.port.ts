/**
 * Authority port: PoiAccessStatusOverride → Decision-tick POI resolve.
 * Field hints never used as authoritative status.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import type { PoiAccessStatusOverride } from '../../../poi-access-capacity/interfaces/poi-access-capacity.interface';
import type { AuthorityPoiResolveOutcome } from './poi-authority-bridge.types';

export type PoiAuthorityPort = {
  resolveAuthority(input: {
    tripId: string;
    poiId: string;
    correlationId?: string;
  }): Promise<AuthorityPoiResolveOutcome>;
};

export type PoiAccessOverrideLookup = {
  findActiveOverride(
    poiId: string,
  ): Promise<PoiAccessStatusOverride | null>;
};

const PORT_VERSION = 'poi-access-override@v1';

function mapConfidence(
  c: PoiAccessStatusOverride['confidence'],
): 'OFFICIAL' | 'PARTNER' | 'MODEL' {
  if (c === 'OFFICIAL') return 'OFFICIAL';
  if (c === 'PARTNER') return 'PARTNER';
  return 'MODEL';
}

function mapOverrideToStatus(
  override: PoiAccessStatusOverride,
): 'CLOSED' | 'OPEN' | 'LIMITED' | 'UNKNOWN' {
  if (override.status !== 'ACTIVE') return 'UNKNOWN';
  if (
    override.ruleType === 'CLOSED' ||
    override.ruleType === 'SEASONAL_CLOSURE'
  ) {
    return 'CLOSED';
  }
  // ACTIVE non-closure rules are access constraints, not operational CLOSED
  return 'OPEN';
}

@Injectable()
export class PoiAccessOverrideAuthorityPort implements PoiAuthorityPort {
  private readonly logger = new Logger(PoiAccessOverrideAuthorityPort.name);

  constructor(
    @Optional() private readonly lookup?: PoiAccessOverrideLookup,
  ) {}

  async resolveAuthority(input: {
    tripId: string;
    poiId: string;
    correlationId?: string;
  }): Promise<AuthorityPoiResolveOutcome> {
    const poiId = input.poiId.trim().toLowerCase();
    const attemptedAt = new Date().toISOString();
    const unavailable = (reason: string): AuthorityPoiResolveOutcome => ({
      kind: 'UNAVAILABLE',
      attemptedAt,
      reason,
      evidenceId: `ev_poi_${poiId}_unavail_${attemptedAt.slice(0, 13)}`,
      version: `${PORT_VERSION}:unavailable`,
    });

    if (!this.lookup) {
      this.logger.warn(
        `authority UNAVAILABLE: PoiAccessOverrideLookup missing poi=${poiId}`,
      );
      return unavailable('poi_access_override_lookup_unavailable');
    }

    try {
      const override = await this.lookup.findActiveOverride(poiId);
      if (!override) {
        return unavailable('poi_access_override_empty');
      }

      const status = mapOverrideToStatus(override);
      return {
        kind: 'RESOLVED',
        status,
        observedAt: override.lastVerifiedAt || attemptedAt,
        sourceProvider: override.sourceAuthority || 'poi_access_override',
        authority: mapConfidence(override.confidence),
        evidenceId: override.id || `ev_poi_${poiId}`,
        version: `${PORT_VERSION}:${override.id}`,
        ruleType: override.ruleType,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`authority UNAVAILABLE poi=${poiId}: ${msg}`);
      return unavailable(`poi_access_resolve_error:${msg.slice(0, 120)}`);
    }
  }
}

/** Pure helper for harness / sync adapters */
export function authorityFromPoiAccessOverride(
  override: PoiAccessStatusOverride | null | undefined,
  attemptedAt = new Date().toISOString(),
): AuthorityPoiResolveOutcome {
  if (!override || override.status !== 'ACTIVE') {
    return {
      kind: 'UNAVAILABLE',
      attemptedAt,
      reason: 'poi_access_override_empty',
      evidenceId: `ev_poi_unavail_${attemptedAt.slice(0, 13)}`,
      version: `${PORT_VERSION}:unavailable`,
    };
  }
  const status = mapOverrideToStatus(override);
  return {
    kind: 'RESOLVED',
    status,
    observedAt: override.lastVerifiedAt || attemptedAt,
    sourceProvider: override.sourceAuthority || 'poi_access_override',
    authority: mapConfidence(override.confidence),
    evidenceId: override.id || `ev_poi_${override.poiId}`,
    version: `${PORT_VERSION}:${override.id}`,
    ruleType: override.ruleType,
  };
}
