import type {
  CanonicalSameDayContext,
  ContextualRecommendationsContextDelta,
  DesiredIntensity,
  GeoPointDto,
  MergedSameDayProblem,
  TeamEnergyLevel,
  TripPhaseHint,
} from '../types/contextual-recommendations.types';

function normalizeGeo(
  raw: ContextualRecommendationsContextDelta['currentLocation'],
): GeoPointDto | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const label = raw.trim();
    if (!label) return null;
    // Known Iceland arrival anchors (MVP); full geocoding later.
    if (/keflavik|凯夫拉维克|kef\b/i.test(label)) {
      return { lat: 63.985, lng: -22.605, label };
    }
    if (/reykjavik|雷克雅未克|rek\b/i.test(label)) {
      return { lat: 64.1466, lng: -21.9426, label };
    }
    return { lat: 0, lng: 0, label };
  }
  if (
    typeof raw === 'object' &&
    typeof raw.lat === 'number' &&
    typeof raw.lng === 'number' &&
    Number.isFinite(raw.lat) &&
    Number.isFinite(raw.lng)
  ) {
    return {
      lat: raw.lat,
      lng: raw.lng,
      ...(raw.label ? { label: raw.label } : {}),
    };
  }
  return null;
}

function inferEnergy(
  delta: ContextualRecommendationsContextDelta | undefined,
  intensity: DesiredIntensity,
): TeamEnergyLevel {
  if (delta?.teamState?.energy) return delta.teamState.energy;
  if (intensity === 'LIGHT') return 'LOW';
  if (intensity === 'FULL') return 'HIGH';
  return 'MEDIUM';
}

function inferIntensity(
  delta: ContextualRecommendationsContextDelta | undefined,
  energy: TeamEnergyLevel,
): DesiredIntensity {
  if (delta?.desiredIntensity) return delta.desiredIntensity;
  if (energy === 'LOW') return 'LIGHT';
  if (energy === 'HIGH') return 'FULL';
  return 'MODERATE';
}

/**
 * Merge frontend contextDelta with backend canonical snapshot into a planning problem.
 * Delta never overwrites authoritative hotel / team structure / tomorrow plan facts.
 */
export function mergeSameDayProblem(input: {
  canonical: CanonicalSameDayContext;
  intent?: string | null;
  contextDelta?: ContextualRecommendationsContextDelta | null;
  nowIso?: string;
}): MergedSameDayProblem {
  const delta = input.contextDelta ?? undefined;
  const fromDelta = [...input.canonical.sources.fromDelta];
  const fromBackend = [...input.canonical.sources.fromBackend];

  let tripPhase: TripPhaseHint = input.canonical.tripPhase;
  if (delta?.tripPhase && delta.tripPhase !== 'UNKNOWN') {
    tripPhase = delta.tripPhase;
    fromDelta.push('tripPhase');
  }

  const provisionalIntensity = delta?.desiredIntensity ?? 'LIGHT';
  const energy = inferEnergy(delta, provisionalIntensity);
  const desiredIntensity = inferIntensity(delta, energy);
  if (delta?.teamState?.energy) fromDelta.push('teamState.energy');
  if (delta?.desiredIntensity) fromDelta.push('desiredIntensity');

  const currentLocation = normalizeGeo(delta?.currentLocation);
  if (delta?.currentLocation != null) fromDelta.push('currentLocation');

  const currentTimeIso =
    (typeof delta?.currentTime === 'string' && delta.currentTime.trim()) ||
    input.nowIso ||
    new Date().toISOString();
  if (delta?.currentTime) fromDelta.push('currentTime');

  if (delta?.availableUntil) fromDelta.push('availableUntil');
  if (delta?.desiredReturnTime) fromDelta.push('desiredReturnTime');
  if (delta?.teamState?.temporaryConstraints?.length) {
    fromDelta.push('teamState.temporaryConstraints');
  }
  if (delta?.preference?.length) fromDelta.push('preference');

  return {
    canonical: {
      ...input.canonical,
      tripPhase,
      sources: {
        fromDelta: [...new Set(fromDelta)],
        fromBackend: [...new Set(fromBackend)],
      },
    },
    intent: input.intent?.trim() || null,
    currentTimeIso,
    availableUntil: delta?.availableUntil?.trim() || null,
    desiredReturnTime: delta?.desiredReturnTime?.trim() || null,
    currentLocation,
    energy,
    desiredIntensity,
    temporaryConstraints: [...(delta?.teamState?.temporaryConstraints ?? [])],
    preferences: [...(delta?.preference ?? [])],
  };
}

export function parseClockToMinutes(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const isoMatch = trimmed.match(/T(\d{2}):(\d{2})/);
  if (isoMatch) {
    return Number(isoMatch[1]) * 60 + Number(isoMatch[2]);
  }
  const hm = trimmed.match(/^(\d{1,2}):(\d{2})/);
  if (!hm) return null;
  return Number(hm[1]) * 60 + Number(hm[2]);
}

export function formatMinutesAsClock(totalMinutes: number): string {
  const m = ((Math.round(totalMinutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
