import {
  buildInstantiationGenerationProgress,
  hasHikingSkeletonReady,
  isExecutableScheduleReady,
  isRouteEstablishedForTrip,
  isTripGeneratingItems,
  resolveEffectiveGenerationProgress,
  resolveTripContentMode,
} from './match-square-trip-content.util';

describe('match-square-trip-content.util', () => {
  it('trekking_spawn → hiking_primary content mode', () => {
    const meta = {
      matchSquareInstantiation: { strategy: 'trekking_spawn', routeDirectionName: 'IS_LAUGAVEGUR' },
      hikingSegments: [
        { segmentId: 's1', startDate: '2026-07-01', endDate: '2026-07-04', routeDirectionId: 1 },
      ],
    };
    expect(resolveTripContentMode(meta, 0)).toBe('hiking_primary');
    expect(hasHikingSkeletonReady(meta)).toBe(true);
    expect(isRouteEstablishedForTrip(meta, 0)).toBe(true);
    expect(isExecutableScheduleReady(meta, 0, 0, 8)).toBe(true);
    expect(isTripGeneratingItems(meta, 0)).toBe(false);
  });

  it('minimal_trip → skeleton_only', () => {
    const progress = buildInstantiationGenerationProgress('minimal_trip', 0);
    expect(progress.stage).toBe('skeleton_only');
    expect(progress.contentMode).toBe('skeleton_only');
    expect(resolveTripContentMode({ matchSquareInstantiation: { strategy: 'minimal_trip' } }, 0)).toBe(
      'skeleton_only',
    );
  });

  it('resolveEffectiveGenerationProgress backfills legacy match-square trips', () => {
    const gp = resolveEffectiveGenerationProgress(
      { matchSquareInstantiation: { strategy: 'minimal_trip' } },
      0,
    );
    expect(gp?.status).toBe('completed');
    expect(gp?.stage).toBe('skeleton_only');
  });

  it('NL generating state stays generating_poi', () => {
    const meta = {
      generationProgress: {
        status: 'generating',
        stage: 'retrieving_candidates',
        message: '正在检索候选地点...',
      },
    };
    expect(resolveTripContentMode(meta, 0)).toBe('generating_poi');
    expect(isTripGeneratingItems(meta, 0)).toBe(true);
  });

  it('route_template with items → poi_itinerary', () => {
    const meta = { matchSquareInstantiation: { strategy: 'route_template' } };
    expect(resolveTripContentMode(meta, 5)).toBe('poi_itinerary');
    expect(isExecutableScheduleReady(meta, 5, 3, 3)).toBe(true);
  });
});
