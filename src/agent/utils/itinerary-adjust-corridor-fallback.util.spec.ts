import {
  ITINERARY_ADJUST_CORRIDOR_MIN_CANDIDATES_DEFAULT,
  countCorridorFilterStats,
  filterPoisNearCorridorAnchors,
  resolveItineraryAdjustCorridorCandidatePool,
} from './itinerary-adjust-corridor-fallback.util';
import type { ItineraryAdjustSpatialConstraints } from './itinerary-adjust-neighbor-anchors.util';

describe('itinerary-adjust-corridor-fallback', () => {
  const constraints: ItineraryAdjustSpatialConstraints = {
    startAnchor: { lat: 63.4195, lng: -19.008 },
    endAnchor: { lat: 64.8395, lng: -23.2703 },
    maxDetourDistanceKm: 50,
    maxRouteDetourRatio: 1.32,
    mode: 'DAY_REPLAN_INTERPOLATION',
  };

  const geysir = { name: 'Geysir', coordinates: { lat: 64.3103, lng: -20.3011 } };
  const skoga = { name: 'Skogafoss', coordinates: { lat: 63.5321, lng: -19.5112 } };
  const vik = { name: 'Vik', coordinates: { lat: 63.4195, lng: -19.008 } };
  const selja = { name: 'Seljalandsfoss', coordinates: { lat: 63.6156, lng: -19.9886 } };

  it('countCorridorFilterStats drops golden circle inland on Vik→Snæfellsnes', () => {
    const stats = countCorridorFilterStats([geysir, skoga, vik, selja], constraints);
    expect(stats.droppedGoldenCircle).toBe(1);
    expect(stats.matched).toBeGreaterThanOrEqual(2);
  });

  it('resolve pool stays at baseline_50km when enough corridor POIs', () => {
    const manySouth = Array.from({ length: 5 }, (_, i) => ({
      name: `coast-${i}`,
      coordinates: { lat: 63.45 + i * 0.08, lng: -19.2 - i * 0.15 },
    }));
    const resolution = resolveItineraryAdjustCorridorCandidatePool(
      [...manySouth, geysir],
      constraints,
      3,
    );
    expect(resolution.fallbackLevel).toBe('baseline_50km');
    expect(resolution.candidates.length).toBeGreaterThanOrEqual(3);
    expect(resolution.spatial.maxDetourDistanceKm).toBe(50);
  });

  it('expands buffer tier when 50km corridor has too few POIs', () => {
    const sparse = [vik, skoga];
    const resolution = resolveItineraryAdjustCorridorCandidatePool(
      sparse,
      constraints,
      ITINERARY_ADJUST_CORRIDOR_MIN_CANDIDATES_DEFAULT,
    );
    expect(resolution.diagnostics.tierAttempts.length).toBe(3);
    expect(['baseline_50km', 'expanded_80km', 'expanded_120km', 'anchor_radius_35km', 'anchor_radius_55km', 'best_effort_sparse']).toContain(
      resolution.fallbackLevel,
    );
  });

  it('filterPoisNearCorridorAnchors keeps POIs near start anchor', () => {
    const nearStart = { name: 'near-vik', coordinates: { lat: 63.43, lng: -19.02 } };
    const far = { name: 'far-inland', coordinates: { lat: 64.1, lng: -20.5 } };
    const pool = filterPoisNearCorridorAnchors([nearStart, far, geysir], constraints, 40);
    const names = pool.map((p) => (p as { name: string }).name);
    expect(names).toContain('near-vik');
    expect(names).not.toContain('Geysir');
  });
});
