import { IcelandInitialPlanSeedService } from './iceland-initial-plan-seed.service';
import { IcelandInitialPlanArrangeProjector } from './iceland-initial-plan-arrange-projector.service';
import { IcelandInitialPlanPipelineService } from './iceland-initial-plan-pipeline.service';
import { buildInitialPlanSeedInputFromCreate } from './iceland-initial-plan-create-bridge.util';
import type { CreateIcelandSelfDriveTripDto } from '../dto/create-iceland-self-drive-trip.dto';
import { PRODUCT_LINE_ICELAND_SELF_DRIVE } from '../dto/iceland-self-drive-enums';
import type {
  CatalogResolutionIssue,
  InitialPlanSeedInput,
} from '../types/iceland-initial-plan-seed.types';
import type {
  IcelandGoldenSetCatalogResolver,
  ResolvedCatalogPlace,
} from './iceland-golden-set-catalog-resolver.service';

function baseInput(over: Partial<InitialPlanSeedInput> = {}): InitialPlanSeedInput {
  return {
    tripId: 'trip-test',
    travelDates: { startDate: '2027-07-10', endDate: '2027-07-18' },
    regionIds: ['golden_circle'],
    seasonOverride: 'summer',
    ...over,
  };
}

describe('IcelandInitialPlanSeed → Arrange pipeline', () => {
  const seedService = new IcelandInitialPlanSeedService(); // no catalog resolver
  const projector = new IcelandInitialPlanArrangeProjector();
  const pipeline = new IcelandInitialPlanPipelineService(seedService, projector);

  it('1. golden circle seeds three core candidates without forcing all into plan', async () => {
    const seed = await seedService.seed(baseInput());
    const ids = seed.candidateEntities
      .filter((c) => c.countsTowardAttractionCoverage)
      .map((c) => c.canonicalPlaceId);
    expect(ids).toEqual(expect.arrayContaining([381037, 381083, 381084]));
    // Seed produces candidates only — not PlanVersion activity instances
    expect(seed.candidateEntities.every((c) => c.candidateId.startsWith('gs:'))).toBe(
      true,
    );
  });

  it('2. user exclude Geysir is respected (PRIMARY does not force restore)', async () => {
    const seed = await seedService.seed(
      baseInput({
        preferences: { excludePlaceIds: [381083] },
      }),
    );
    expect(
      seed.candidateEntities.some((c) => c.canonicalPlaceId === 381083),
    ).toBe(false);
    expect(seed.exclusions.some((e) => e.placeId === 381083 && e.reason === 'USER_EXCLUDED')).toBe(
      true,
    );
  });

  it('3. Reynisfjara and Dyrhólaey can both exist (SOFT_ALTERNATIVE)', async () => {
    const seed = await seedService.seed(
      baseInput({ regionIds: ['south_coast'], seasonOverride: 'summer' }),
    );
    const ids = seed.candidateEntities.map((c) => c.canonicalPlaceId);
    expect(ids).toContain(381039);
    expect(ids).toContain(381082);
    expect(
      seed.relations.some(
        (r) => r.groupId === 'scw_coast' && r.relationType === 'SOFT_ALTERNATIVE',
      ),
    ).toBe(true);
  });

  it('4. time pressure keeps one soft-alternative with evidence', async () => {
    const { arrange } = await pipeline.buildArrangeInput(
      baseInput({ regionIds: ['south_coast'] }),
      { softAltMaxAttractions: 3 },
    );
    const coast = [381039, 381082];
    const present = arrange.attractionCandidates.filter((c) =>
      coast.includes(c.canonicalPlaceId),
    );
    expect(present.length).toBeLessThanOrEqual(2);
    // If both trimmed to one under pressure when max is tiny
    const { arrange: tight } = await pipeline.buildArrangeInput(
      baseInput({ regionIds: ['south_coast'] }),
      { softAltMaxAttractions: 1 },
    );
    const coastTight = tight.attractionCandidates.filter((c) =>
      coast.includes(c.canonicalPlaceId),
    );
    expect(coastTight.length).toBeLessThanOrEqual(1);
    expect(
      tight.evidence.some(
        (e) => e.type === 'SOFT_ALTERNATIVE_TRIM' || e.type === 'CAPACITY_TRIM',
      ),
    ).toBe(true);
  });

  it('5. Skaftafell child Svartifoss does not double-count coverage', async () => {
    const seed = await seedService.seed(
      baseInput({ regionIds: ['south_coast'] }),
    );
    const skaftafell = seed.candidateEntities.find((c) => c.canonicalPlaceId === 381088);
    const svarti = seed.candidateEntities.find((c) => c.canonicalPlaceId === 381093);
    expect(skaftafell?.countsTowardAttractionCoverage).toBe(true);
    if (svarti) {
      expect(svarti.countsTowardAttractionCoverage).toBe(false);
      expect(svarti.parentCanonicalPlaceId).toBe(381088);
    }
  });

  it('6. lagoon + diamond beach co-visit cluster projected', async () => {
    const { arrange } = await pipeline.buildArrangeInput(
      baseInput({ regionIds: ['south_coast'] }),
    );
    expect(
      arrange.coVisitClusters.some(
        (c) =>
          c.groupId === 'sce_lagoon' &&
          c.placeIds.includes(381041) &&
          c.placeIds.includes(381089),
      ),
    ).toBe(true);
  });

  it('7. aliases never enter final candidate list', async () => {
    const seed = await seedService.seed(
      baseInput({ regionIds: ['snaefellsnes'] }),
    );
    expect(seed.candidateEntities.some((c) => c.canonicalPlaceId === 381087)).toBe(
      false,
    );
    expect(seed.exclusions.some((e) => e.placeId === 381087 && e.reason === 'ALIAS')).toBe(
      true,
    );
    expect(seed.candidateEntities.some((c) => c.canonicalPlaceId === 381099)).toBe(true);
  });

  it('8. experience products are not ordinary POI candidates', async () => {
    const seed = await seedService.seed(
      baseInput({
        regionIds: ['south_coast'],
        seasonOverride: 'shoulder', // pack: winter|shoulder only
      }),
    );
    expect(
      seed.experienceCandidates.some(
        (e) => e.experienceProductId === 'exp_glacier_hike_skaftafell',
      ),
    ).toBe(true);
    expect(
      seed.candidateEntities.some((c) =>
        String(c.canonicalPlaceId).includes('exp_'),
      ),
    ).toBe(false);
    expect(
      seed.experienceCandidates.every(
        (e) => e.status === 'NEEDS_BOOKING_VERIFICATION',
      ),
    ).toBe(true);
  });

  it('9. North does not force Akureyri+Mývatn+Dettifoss same day scope', async () => {
    const seed = await seedService.seed(
      baseInput({ regionIds: ['north'], seasonOverride: 'summer' }),
    );
    expect(seed.dayScopeRules.requireSubregionDayScopeByPack['north']).toBe(true);
    const subIds = seed.dayScopeRules.subregions.map((s) => s.subregionId);
    expect(subIds).toEqual(
      expect.arrayContaining(['north_west', 'north_east_myvatn', 'diamond_circle']),
    );
  });

  it('10. Westfjords exposes subregion day-scope for transfer', async () => {
    const seed = await seedService.seed(
      baseInput({ regionIds: ['westfjords'], seasonOverride: 'summer' }),
    );
    expect(seed.dayScopeRules.requireSubregionDayScopeByPack['westfjords']).toBe(
      true,
    );
    expect(
      seed.dayScopeRules.subregions.map((s) => s.subregionId),
    ).toEqual(
      expect.arrayContaining([
        'westfjords_southwest',
        'westfjords_central_north',
      ]),
    );
    expect(seed.dayScopeRules.policy.crossSubregionRequiresExplicitTransferDay).toBe(
      true,
    );
  });

  it('11. Highlands blocked when user explicitly rejects 4WD / F-road', async () => {
    const seed = await seedService.seed(
      baseInput({
        regionIds: ['highlands'],
        seasonOverride: 'summer',
        vehicleProfile: { is4wd: false, allowsFRoad: false },
      }),
    );
    expect(
      seed.candidateEntities.filter(
        (c) => c.packId === 'highlands' && c.countsTowardAttractionCoverage,
      ).length,
    ).toBe(0);
    expect(
      seed.exclusions.some(
        (e) => e.reason === 'HIGHLANDS_GATE' || e.reason === 'VEHICLE_INCOMPATIBLE',
      ),
    ).toBe(true);
  });

  it('11b. Highlands still seeds when vehicle context is empty at create', async () => {
    const seedEmpty = await seedService.seed(
      baseInput({
        regionIds: ['highlands'],
        seasonOverride: 'summer',
        vehicleProfile: {},
      }),
    );
    expect(
      seedEmpty.candidateEntities.filter(
        (c) => c.packId === 'highlands' && c.countsTowardAttractionCoverage,
      ).length,
    ).toBeGreaterThan(0);

    const seedMissing = await seedService.seed(
      baseInput({
        regionIds: ['highlands'],
        seasonOverride: 'summer',
        vehicleProfile: undefined,
      }),
    );
    expect(
      seedMissing.candidateEntities.filter(
        (c) => c.packId === 'highlands' && c.countsTowardAttractionCoverage,
      ).length,
    ).toBeGreaterThan(0);
  });

  it('12. Þórsmörk is experience / anchor — not self-drive attraction coverage', async () => {
    const seed = await seedService.seed(
      baseInput({
        regionIds: ['highlands'],
        seasonOverride: 'summer',
        vehicleProfile: {
          is4wd: true,
          allowsFRoad: true,
          allowsRiverCrossing: false,
        },
      }),
    );
    expect(
      seed.candidateEntities.some(
        (c) =>
          c.canonicalPlaceId === 381109 && c.countsTowardAttractionCoverage,
      ),
    ).toBe(false);
    expect(
      seed.experienceCandidates.some(
        (e) => e.experienceProductId === 'exp_thorsmork_superjeep',
      ),
    ).toBe(true);
  });

  it('13. East Fjords corridor-only: catalog gap, no attraction coverage', async () => {
    const seed = await seedService.seed(
      baseInput({ regionIds: ['east_fjords'] }),
    );
    expect(
      seed.catalogGaps.some(
        (g) =>
          g.regionId === 'east_fjords' &&
          g.missingCapabilities.includes('SIGNATURE_ATTRACTIONS'),
      ),
    ).toBe(true);
    expect(
      seed.candidateEntities.filter(
        (c) =>
          c.packId === 'east_fjords' && c.countsTowardAttractionCoverage,
      ).length,
    ).toBe(0);
    expect(
      seed.selectedRegions.find((r) => r.regionId === 'east_fjords')
        ?.regionalGoldenSetReady,
    ).toBe(false);
  });

  it('14. unresolved catalog placeIds enter unresolvedEntities and are excluded', async () => {
    const mockResolver = {
      resolvePlaceIds: async (
        placeIds: number[],
      ): Promise<Map<number, ResolvedCatalogPlace>> => {
        const map = new Map<number, ResolvedCatalogPlace>();
        for (const id of placeIds) {
          if (id === 381083) {
            const issues: CatalogResolutionIssue[] = [
              {
                placeId: id,
                code: 'MISSING_COORDINATES',
                message: 'missing coords',
                severity: 'ERROR',
              },
            ];
            map.set(id, {
              placeId: id,
              nameCN: '',
              nameEN: null,
              category: null,
              lat: null,
              lng: null,
              ok: false,
              issues,
            });
          } else {
            map.set(id, {
              placeId: id,
              nameCN: '',
              nameEN: null,
              category: null,
              lat: 64,
              lng: -19,
              ok: true,
              issues: [],
            });
          }
        }
        return map;
      },
    } as IcelandGoldenSetCatalogResolver;

    const seeded = new IcelandInitialPlanSeedService(mockResolver);
    const seed = await seeded.seed(baseInput({ regionIds: ['golden_circle'] }));
    expect(
      seed.unresolvedEntities.some(
        (u) => u.placeId === 381083 && u.code === 'MISSING_COORDINATES',
      ),
    ).toBe(true);
    expect(seed.candidateEntities.some((c) => c.canonicalPlaceId === 381083)).toBe(
      false,
    );
    expect(
      seed.exclusions.some(
        (e) => e.placeId === 381083 && e.reason === 'CATALOG_UNRESOLVED',
      ),
    ).toBe(true);
  });

  it('15. town hubs are not confirmed lodging and do not count attraction coverage', async () => {
    const seed = await seedService.seed(
      baseInput({ regionIds: ['golden_circle'] }),
    );
    const rvk = seed.candidateEntities.find((c) => c.canonicalPlaceId === 381042);
    expect(rvk).toBeDefined();
    expect(rvk!.kind).toBe('TOWN_HUB');
    expect(rvk!.countsTowardAttractionCoverage).toBe(false);
  });

  it('16. catalog gap does not invent east fjords attractions', async () => {
    const seed = await seedService.seed(
      baseInput({ regionIds: ['east_fjords'] }),
    );
    expect(seed.catalogGaps.length).toBeGreaterThan(0);
    expect(
      seed.candidateEntities.filter(
        (c) => c.packId === 'east_fjords' && c.countsTowardAttractionCoverage,
      ),
    ).toEqual([]);
    expect(
      seed.evidence.some((e) => e.type === 'REGIONAL_CATALOG_GAP'),
    ).toBe(true);
  });

  it('17-20. arrange input never writes PlanVersion; experiences not BOOKED; preview required', async () => {
    const { arrange } = await pipeline.buildArrangeInput(baseInput());
    expect(arrange.writesPlanVersion).toBe(false);
    expect(arrange.requiresPreviewConfirmApply).toBe(true);
    expect(
      arrange.experienceCandidates.every(
        (e) => e.status === 'NEEDS_BOOKING_VERIFICATION',
      ),
    ).toBe(true);
    expect(
      arrange.attractionCandidates.every((a) => a.evidence.gateOutcome),
    ).toBe(true);
  });

  it('create bridge maps DTO → seed → arrange without PlanVersion write', async () => {
    const dto = {
      destinationCode: 'IS',
      productLine: PRODUCT_LINE_ICELAND_SELF_DRIVE,
      dateRange: { startDate: '2027-07-10', endDate: '2027-07-16' },
      travelerCount: 2,
      startLocationCode: 'keflavik',
      endLocationCode: 'keflavik',
      endSameAsStart: true,
      vehicleAcquisition: 'rent',
      regionIds: ['golden_circle'],
      bookings: [
        {
          clientId: 'b1',
          kind: 'lodging',
          name: 'City Hotel',
          placeId: 999001,
          startDate: '2027-07-10',
        },
      ],
    } as CreateIcelandSelfDriveTripDto;

    const mapped = buildInitialPlanSeedInputFromCreate({
      tripId: 'trip-create',
      dto,
      vehicleProfile: { is4wd: false },
      preferences: { excludePlaceIds: [381083] },
    });
    expect(mapped.confirmedLodgings?.[0]?.placeId).toBe(999001);
    expect(mapped.originGateway?.placeId).toBe(381221);
    expect(mapped.exitGateway?.placeId).toBe(381221);
    expect(mapped.originGateway?.label).toContain('Keflavík');

    const { arrange } = await pipeline.buildArrangeInputFromCreate({
      tripId: 'trip-create',
      dto,
      vehicleProfile: { is4wd: false },
      preferences: { excludePlaceIds: [381083] },
    });
    expect(arrange.writesPlanVersion).toBe(false);
    expect(
      arrange.attractionCandidates.some((c) => c.canonicalPlaceId === 381083),
    ).toBe(false);
  });
});
