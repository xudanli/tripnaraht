/**
 * DailyDrivePlan leg → road profile summary (SDR-003 gravelRatio / roadClass)
 */

import {
  loadRoadSegmentProfilesForCountry,
  resolveRoadSegmentProfile,
} from '../../../decision-runtime/packs/road/road-segment-profile.loader';
import type { RoadClass, SurfaceType } from '../../../decision-runtime/packs/road/road-segment-profile.types';
import type { DailyDrivePlan, DriveLeg } from '../contracts/tep-self-drive.types';

export interface LegRoadProfileSummary {
  legId: string;
  roadRefs: string[];
  roadClass?: RoadClass;
  surfaceType?: SurfaceType;
  profileResolved: boolean;
  isGravel: boolean;
  isFRoad: boolean;
  minutes: number;
}

const GRAVEL_SURFACES = new Set<SurfaceType>(['GRAVEL', 'UNPAVED', 'MIXED']);

function resolveRoadIdFromRef(
  roadRef: string,
  profiles: ReturnType<typeof loadRoadSegmentProfilesForCountry>,
): string | null {
  if (!profiles) return null;
  const direct = profiles.profiles.find(
    (p) => roadRef.includes(p.roadId) || roadRef.includes(p.segmentId),
  );
  return direct?.roadId ?? null;
}

function summarizeLeg(leg: DriveLeg, countryCode: string): LegRoadProfileSummary {
  const bundle = loadRoadSegmentProfilesForCountry(countryCode);
  const minutes = leg.adjustedMinutes ?? leg.baseNavigationMinutes;

  let roadClass: RoadClass | undefined;
  let surfaceType: SurfaceType | undefined;
  let profileResolved = false;

  for (const roadRef of leg.roadRefs) {
    const roadId = resolveRoadIdFromRef(roadRef, bundle);
    if (!roadId || !bundle) continue;
    const profile = resolveRoadSegmentProfile(roadId, bundle);
    if (!profile) continue;
    profileResolved = true;
    roadClass = profile.roadClass;
    surfaceType = profile.surfaceType;
    break;
  }

  const isFRoad = roadClass === 'HIGHLAND_F_ROAD';
  const isGravel =
    isFRoad ||
    (surfaceType != null && GRAVEL_SURFACES.has(surfaceType));

  return {
    legId: leg.legId,
    roadRefs: leg.roadRefs,
    roadClass,
    surfaceType,
    profileResolved,
    isGravel,
    isFRoad,
    minutes,
  };
}

export function summarizeDayLegRoadProfiles(
  day: DailyDrivePlan,
  countryCode: string,
): LegRoadProfileSummary[] {
  return day.legs.map((leg) => summarizeLeg(leg, countryCode));
}

export function computeGravelRatio(summaries: LegRoadProfileSummary[]): number {
  const total = summaries.reduce((sum, s) => sum + s.minutes, 0);
  if (total <= 0) return 0;
  const gravel = summaries
    .filter((s) => s.isGravel)
    .reduce((sum, s) => sum + s.minutes, 0);
  return gravel / total;
}

export function hasUnresolvedGravelLeg(summaries: LegRoadProfileSummary[]): boolean {
  return summaries.some((s) => !s.profileResolved && s.roadRefs.length > 0);
}
