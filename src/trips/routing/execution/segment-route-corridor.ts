/**
 * P4-B Corridor segmentation — split a travel polyline into hazard-local segments.
 *
 * Geo owns coordinates; execution owns segment boundaries for physics sampling.
 */

import type { RouteGeometryRef } from './route-execution-inputs.types';

export interface CorridorSegmentMeta {
  segmentId: string;
  /** 0..1 position along route for weather / grid sampling */
  alongMidRatio: number;
  startIndex: number;
  endIndex: number;
}

const DEFAULT_SEGMENTS = 4;

/**
 * Split corridor into segments along coordinate indices (equal buckets).
 * Without coordinates, yields a single logical segment (whole leg).
 */
export function segmentRouteCorridor(input: {
  legId: string;
  geometry: RouteGeometryRef;
  segmentCount?: number;
}): CorridorSegmentMeta[] {
  const coords = input.geometry.coordinates ?? [];
  if (coords.length < 2) {
    return [
      {
        segmentId: `${input.legId}:seg:0`,
        alongMidRatio: 0.5,
        startIndex: 0,
        endIndex: 0,
      },
    ];
  }

  const lastIdx = coords.length - 1;
  const n = Math.min(
    DEFAULT_SEGMENTS,
    Math.max(1, input.segmentCount ?? DEFAULT_SEGMENTS),
  );
  const span = lastIdx / n;
  const metas: CorridorSegmentMeta[] = [];

  for (let i = 0; i < n; i++) {
    const startIndex = Math.floor(i * span);
    const endIndex = i === n - 1 ? lastIdx : Math.floor((i + 1) * span);
    const mid = (startIndex + endIndex) / 2;
    const alongMidRatio = mid / Math.max(1, lastIdx);
    metas.push({
      segmentId: `${input.legId}:seg:${i}`,
      alongMidRatio,
      startIndex,
      endIndex,
    });
  }

  return metas;
}
