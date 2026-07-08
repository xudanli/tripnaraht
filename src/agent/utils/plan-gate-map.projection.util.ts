import type { PlanState } from '../../skills/plan/shared/plan-state.types';
import type { RouteSegment } from '../../trips/decision/shared/world-model.types';
import {
  extractRoutePointsFromSegment,
  segmentDay,
  segmentLabel,
  toGeoJsonCoordinates,
} from './plan-gate-segment-geo.util';
import type { PlanGateMapSegmentChange } from './plan-gate-diff.projection.util';

export interface PlanGateMapGeoFeatureProperties {
  role: 'baseline_route' | 'draft_route' | 'removed_route' | 'accommodation' | 'junction';
  day?: number;
  segmentId?: string;
  label?: string;
  stroke: string;
  strokeWidth?: number;
  changeType?: 'new' | 'removed' | 'modified' | 'unchanged';
  opacity?: number;
}

export interface PlanGateMapGeoFeature {
  type: 'Feature';
  geometry:
    | { type: 'LineString'; coordinates: [number, number][] }
    | { type: 'Point'; coordinates: [number, number] };
  properties: PlanGateMapGeoFeatureProperties;
}

export interface PlanGateMapGeoJson {
  type: 'FeatureCollection';
  features: PlanGateMapGeoFeature[];
  legend: Array<{ role: string; color: string; label: string }>;
  bounds?: { west: number; south: number; east: number; north: number };
}

const COLORS = {
  baseline: '#9CA3AF',
  draft: '#7C3AED',
  removed: '#EF4444',
  accommodation: '#F59E0B',
  junction: '#06B6D4',
};

function segmentDayKey(segment: RouteSegment): string {
  const day = segmentDay(segment);
  return day != null ? `day_${day}` : segment.segmentId;
}

function lineFeature(
  points: ReturnType<typeof extractRoutePointsFromSegment>,
  properties: PlanGateMapGeoFeatureProperties,
): PlanGateMapGeoFeature | null {
  if (points.length < 2) return null;
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: toGeoJsonCoordinates(points) },
    properties,
  };
}

function pointFeature(
  point: { lat: number; lng: number },
  properties: PlanGateMapGeoFeatureProperties,
): PlanGateMapGeoFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [point.lng, point.lat] },
    properties,
  };
}

function computeBounds(features: PlanGateMapGeoFeature[]): PlanGateMapGeoJson['bounds'] {
  const coords: [number, number][] = [];
  for (const f of features) {
    if (f.geometry.type === 'Point') {
      coords.push(f.geometry.coordinates);
    } else {
      coords.push(...f.geometry.coordinates);
    }
  }
  if (!coords.length) return undefined;
  const lngs = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  return {
    west: Math.min(...lngs),
    east: Math.max(...lngs),
    south: Math.min(...lats),
    north: Math.max(...lats),
  };
}

function changeTypeForDay(
  day: number | undefined,
  mapChanges: PlanGateMapSegmentChange[],
): 'new' | 'removed' | 'modified' | 'unchanged' {
  if (day == null) return 'unchanged';
  const hit = mapChanges.find((c) => c.day === day);
  return hit?.changeType ?? 'unchanged';
}

export function projectPlanGateMapGeoJson(input: {
  baselinePlanState: PlanState;
  draftPlanState: PlanState;
  mapChanges?: PlanGateMapSegmentChange[];
}): PlanGateMapGeoJson | undefined {
  const baselineSegments = input.baselinePlanState.itinerary?.segments ?? [];
  const draftSegments = input.draftPlanState.itinerary?.segments ?? [];
  const mapChanges = input.mapChanges ?? [];

  const features: PlanGateMapGeoFeature[] = [];
  const draftByDay = new Map(draftSegments.map((s) => [segmentDayKey(s), s]));

  for (const segment of baselineSegments) {
    const day = segmentDay(segment);
    const points = extractRoutePointsFromSegment(segment);
    const changeType = changeTypeForDay(day, mapChanges);
    const draft = draftByDay.get(segmentDayKey(segment));

    if (changeType === 'removed' || !draft) {
      const removedLine = lineFeature(points, {
        role: 'removed_route',
        day,
        segmentId: segment.segmentId,
        label: segmentLabel(segment),
        stroke: COLORS.removed,
        strokeWidth: 3,
        changeType: 'removed',
        opacity: 0.55,
      });
      if (removedLine) features.push(removedLine);
      continue;
    }

    const baselineLine = lineFeature(points, {
      role: 'baseline_route',
      day,
      segmentId: segment.segmentId,
      label: segmentLabel(segment),
      stroke: COLORS.baseline,
      strokeWidth: changeType === 'modified' ? 2 : 3,
      changeType,
      opacity: changeType === 'unchanged' ? 0.45 : 0.35,
    });
    if (baselineLine) features.push(baselineLine);
  }

  for (const segment of draftSegments) {
    const day = segmentDay(segment);
    const points = extractRoutePointsFromSegment(segment);
    const changeType = changeTypeForDay(day, mapChanges);

    const draftLine = lineFeature(points, {
      role: 'draft_route',
      day,
      segmentId: segment.segmentId,
      label: segmentLabel(segment),
      stroke: COLORS.draft,
      strokeWidth: changeType === 'new' || changeType === 'modified' ? 4 : 3,
      changeType,
      opacity: changeType === 'unchanged' ? 0.5 : 0.9,
    });
    if (draftLine) features.push(draftLine);

    const acc = segment.metadata?.accommodation as { coordinates?: { lat: number; lng: number }; nameCN?: string } | undefined;
    if (acc?.coordinates) {
      features.push(
        pointFeature(acc.coordinates, {
          role: 'accommodation',
          day,
          segmentId: segment.segmentId,
          label: acc.nameCN ?? `Day ${day ?? segment.dayIndex + 1} 住宿`,
          stroke: COLORS.accommodation,
          changeType,
        }),
      );
    }

    if (points.length === 1) {
      features.push(
        pointFeature(points[0], {
          role: 'junction',
          day,
          segmentId: segment.segmentId,
          label: segmentLabel(segment),
          stroke: COLORS.junction,
          changeType,
        }),
      );
    }
  }

  if (features.length === 0) return undefined;

  return {
    type: 'FeatureCollection',
    features,
    legend: [
      { role: 'baseline_route', color: COLORS.baseline, label: '原路线' },
      { role: 'draft_route', color: COLORS.draft, label: '新路线' },
      { role: 'removed_route', color: COLORS.removed, label: '删除路段' },
      { role: 'accommodation', color: COLORS.accommodation, label: '住宿' },
    ],
    bounds: computeBounds(features),
  };
}
