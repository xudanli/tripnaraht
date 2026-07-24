import {
  loadRoadSegmentProfilesForCountry,
  resolveRoadSegmentProfile,
} from './road-segment-profile.loader';

describe('road-segment-profile.loader (PACK-ROAD-PROFILE)', () => {
  it('PACK-ROAD-PROFILE-001: IS pack loads F208 frozen reference profile', () => {
    const bundle = loadRoadSegmentProfilesForCountry('IS');
    expect(bundle).not.toBeNull();
    expect(bundle!.schemaId).toBe('tripnara.road_segment_profiles@v1');
    expect(bundle!.profiles.map((p) => p.roadId)).toEqual(
      expect.arrayContaining(['F208', 'RING_ROAD', 'F26']),
    );

    const f208 = resolveRoadSegmentProfile('F208', bundle!);
    expect(f208).toMatchObject({
      roadId: 'F208',
      segmentId: 'seg-is-f208',
      roadClass: 'HIGHLAND_F_ROAD',
      surfaceType: 'GRAVEL',
      terrainType: 'HIGHLAND',
      requires4wd: true,
      hasUnbridgedRiver: true,
      riverCrossingCount: 1,
      typicalSpeedKph: 40,
      winterServiceLevel: 'SEASONAL',
    });
    expect(bundle!.roadRegions.F208).toContain('IS_CENTRAL_HIGHLANDS');
  });

  it('PACK-ROAD-PROFILE-002: RING_ROAD is paved primary corridor', () => {
    const bundle = loadRoadSegmentProfilesForCountry('IS');
    const ring = resolveRoadSegmentProfile('RING_ROAD', bundle!);
    expect(ring).toMatchObject({
      roadClass: 'PRIMARY',
      surfaceType: 'PAVED',
      requires4wd: false,
      hasUnbridgedRiver: false,
      winterServiceLevel: 'YEAR_ROUND',
    });
  });

  it('PACK-ROAD-PROFILE-003: unknown country returns null', () => {
    expect(loadRoadSegmentProfilesForCountry('JP')).toBeNull();
  });
});
