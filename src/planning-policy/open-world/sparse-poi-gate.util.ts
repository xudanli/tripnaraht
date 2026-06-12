import type { OpenWorldPoiStub, SparseRegionProfile } from '../types/open-world-poi.types';
import { resolvePoiSelectionMinRequired } from '../profiles/sparse-region.profile';
import { buildDefaultPolarRegionStubs } from './polar-region-stubs.util';
import { openWorldStubsToPoiEvidence } from './open-world-poi-stub.util';

export interface SparsePoiGateResult<T> {
  scored: T[];
  minPoiRequired: number;
  sparseProfile: SparseRegionProfile | null;
  openWorldStubs: OpenWorldPoiStub[];
}

/** POI_SELECTION / Orchestrator 共用：稀疏区注入 stub + 动态 minPoiRequired */
export function applySparseRegionPoiGate<T extends Record<string, unknown>>(params: {
  scored: T[];
  destinationCountry?: string;
  destinationHint?: string;
  dedupe: (pois: T[]) => T[];
}): SparsePoiGateResult<T> {
  const gate = resolvePoiSelectionMinRequired({
    countryCode: params.destinationCountry,
    destinationHint: params.destinationHint,
  });
  let scored = params.scored;
  let openWorldStubs: OpenWorldPoiStub[] = [];

  if (gate.sparseProfile && scored.length < Math.max(1, gate.minPoiRequired + 1)) {
    openWorldStubs = buildDefaultPolarRegionStubs(
      gate.sparseProfile.regionTag,
      params.destinationHint,
    );
    const stubPois = openWorldStubsToPoiEvidence(openWorldStubs) as T[];
    scored = params.dedupe([...scored, ...stubPois]);
  }

  return {
    scored,
    minPoiRequired: gate.minPoiRequired,
    sparseProfile: gate.sparseProfile,
    openWorldStubs,
  };
}

export function attachSparseRegionMetadata(
  metadata: Record<string, unknown>,
  gate: Pick<SparsePoiGateResult<unknown>, 'sparseProfile' | 'openWorldStubs'>,
): void {
  if (!gate.sparseProfile) return;
  metadata.sparse_region_profile = gate.sparseProfile.profileId;
  if (gate.openWorldStubs.length > 0) {
    metadata.open_world_stubs = gate.openWorldStubs;
  }
}
