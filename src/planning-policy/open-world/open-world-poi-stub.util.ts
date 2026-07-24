import type { CandidatePlace } from '../../trips/services/candidate-retrieval.engine';
import type {
  OpenWorldPoiStub,
  OpenWorldConstraintTag,
  ProvisionalPoiStatus,
} from '../types/open-world-poi.types';

export const OPEN_WORLD_ELASTIC_TAG = 'open_world:elastic';
export const OPEN_WORLD_STUB_ID_PREFIX = 'provisional_placeholder_';

/** 负整数 ID 空间，避免与 DB placeId 冲突 */
let stubIdCounter = -900_001;

export function nextOpenWorldStubNumericId(): number {
  return stubIdCounter--;
}

export function isOpenWorldStubNumericId(id: number): boolean {
  return Number.isFinite(id) && id <= -900_000;
}

export function isElasticCandidate(candidate: Pick<CandidatePlace, 'id' | 'tags' | 'canonicalType'>): boolean {
  if (isOpenWorldStubNumericId(candidate.id)) return true;
  const tags = candidate.tags ?? [];
  if (tags.includes(OPEN_WORLD_ELASTIC_TAG)) return true;
  return String(candidate.canonicalType ?? '').toUpperCase() === 'OPEN_WORLD_STUB';
}

export function buildOpenWorldPoiStub(input: {
  displayName: string;
  regionHint: string;
  lat: number;
  lng: number;
  radiusKm?: number;
  constraintTags?: OpenWorldConstraintTag[];
  elasticMinutes?: { min: number; max: number };
  source?: OpenWorldPoiStub['source'];
  status?: ProvisionalPoiStatus;
  stubId?: string;
}): OpenWorldPoiStub {
  const stubId = input.stubId ?? `${OPEN_WORLD_STUB_ID_PREFIX}${Math.abs(nextOpenWorldStubNumericId())}`;
  return {
    stubId,
    displayName: input.displayName,
    regionHint: input.regionHint,
    coarseLocation: {
      lat: input.lat,
      lng: input.lng,
      radiusKm: input.radiusKm ?? 40,
    },
    elasticSlot: input.elasticMinutes
      ? { minMinutes: input.elasticMinutes.min, maxMinutes: input.elasticMinutes.max }
      : { minMinutes: 120, maxMinutes: 240 },
    constraintTags: input.constraintTags ?? ['weather_window'],
    status: input.status ?? 'geocoded',
    source: input.source ?? 'registry_supplement',
    nodeKind: 'elastic',
  };
}

export function openWorldStubToCandidatePlace(stub: OpenWorldPoiStub): CandidatePlace {
  const loc = stub.coarseLocation ?? { lat: 0, lng: 0, radiusKm: 40 };
  const avgVisit =
    stub.elasticSlot != null
      ? Math.round((stub.elasticSlot.minMinutes + stub.elasticSlot.maxMinutes) / 2)
      : 180;

  return {
    id: nextOpenWorldStubNumericId(),
    nameCN: stub.displayName,
    nameEN: stub.displayName,
    type: 'OPEN_WORLD_STUB',
    category: 'ATTRACTION',
    lat: loc.lat,
    lng: loc.lng,
    openingHours: undefined,
    avgVisitDuration: avgVisit,
    tags: [OPEN_WORLD_ELASTIC_TAG, `stub:${stub.stubId}`, ...stub.constraintTags],
    popularity: 5,
    rating: 4,
    canonicalType: 'OPEN_WORLD_STUB',
    intensityFactor: 0.6,
    bestVisitTime: 'any',
    poiPlanningScoreReasons: ['OPEN_WORLD_ELASTIC_STUB'],
    poiPlanningAdmissionProtected: stub.nodeKind === 'verified',
  };
}

export function openWorldStubsToCandidatePlaces(stubs: OpenWorldPoiStub[]): CandidatePlace[] {
  return stubs.map(openWorldStubToCandidatePlace);
}

/** RESEARCH / POI_SELECTION 管道用的 poi_evidence 同形条目 */
export function openWorldStubToPoiEvidence(stub: OpenWorldPoiStub): Record<string, unknown> {
  const loc = stub.coarseLocation ?? { lat: 0, lng: 0, radiusKm: 40 };
  return {
    poi_id: stub.stubId,
    name: stub.displayName,
    nameCN: stub.displayName,
    coordinates: { lat: loc.lat, lng: loc.lng },
    category: 'ATTRACTION',
    source: 'open_world_stub',
    evidence_id: `open_world_${stub.stubId}`,
    metadata: {
      open_world_elastic: stub.nodeKind === 'elastic',
      node_kind: stub.nodeKind,
      constraint_tags: stub.constraintTags,
      elastic_slot: stub.elasticSlot,
      verification_status: stub.status,
    },
    opening_hours: null,
  };
}

export function openWorldStubsToPoiEvidence(stubs: OpenWorldPoiStub[]): Record<string, unknown>[] {
  return stubs.map(openWorldStubToPoiEvidence);
}

export function mergeOpenWorldStubsIntoPoiList<T extends Record<string, unknown>>(
  pois: T[],
  stubs: OpenWorldPoiStub[],
): T[] {
  const existing = new Set(
    pois.map((p) => String(p.poi_id ?? p.id ?? p.place_id ?? '').toLowerCase()),
  );
  const out = [...pois];
  for (const stub of stubs) {
    const key = stub.stubId.toLowerCase();
    if (existing.has(key)) continue;
    existing.add(key);
    out.push(openWorldStubToPoiEvidence(stub) as T);
  }
  return out;
}

/** 测试重置 stub ID 序列 */
export function resetOpenWorldStubIdCounterForTests(next = -900_001): void {
  stubIdCounter = next;
}
