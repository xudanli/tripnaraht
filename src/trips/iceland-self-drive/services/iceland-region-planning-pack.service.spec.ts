import { IcelandRegionPlanningPackService } from './iceland-region-planning-pack.service';

describe('IcelandRegionPlanningPackService', () => {
  function build(prismaOverrides: Record<string, unknown> = {}) {
    const prisma = {
      tripAttractionExploreCandidate: { count: jest.fn().mockResolvedValue(0) },
      place: {
        findMany: jest.fn().mockImplementation(async ({ where }: { where: { id: { in: number[] } } }) =>
          (where.id.in ?? []).map((id: number) => ({ id })),
        ),
      },
      trip: {
        findUnique: jest.fn().mockResolvedValue({ id: 't1', metadata: {} }),
        update: jest.fn().mockResolvedValue({}),
      },
      itineraryItem: {
        findMany: jest.fn().mockResolvedValue([
          { placeId: 381080 },
          { placeId: 381038 },
          { placeId: 381037 },
        ]),
      },
      ...prismaOverrides,
    };
    const candidates = {
      seedCandidateRows: jest.fn().mockImplementation(async (_tripId: string, rows: unknown[]) => rows.length),
    };
    const svc = new IcelandRegionPlanningPackService(prisma as never, candidates as never);
    return { svc, prisma, candidates };
  }

  it('maps south_coast to west+east packs and soft-includes arrival', () => {
    const { svc } = build();
    const resolved = svc.resolvePacksForCreate({
      regionIds: ['south_coast'],
      dayCount: 9,
    });
    expect(resolved.packs.map((p) => p.packId)).toEqual(
      expect.arrayContaining([
        'reykjavik_arrival',
        'south_coast_west',
        'south_coast_east',
      ]),
    );
    expect(resolved.missingPackRegionIds).toEqual([]);
  });

  it('drops south_coast_east when days are insufficient', () => {
    const { svc } = build();
    const resolved = svc.resolvePacksForCreate({
      regionIds: ['south_coast', 'golden_circle'],
      dayCount: 2,
    });
    expect(resolved.packs.map((p) => p.packId)).toContain('south_coast_west');
    expect(resolved.packs.map((p) => p.packId)).not.toContain('south_coast_east');
    expect(resolved.warnings.some((w) => w.code === 'REGION_CAPACITY_INSUFFICIENT')).toBe(
      true,
    );
  });

  it('maps snaefellsnes to peninsula pack', () => {
    const { svc } = build();
    const resolved = svc.resolvePacksForCreate({
      regionIds: ['snaefellsnes'],
      dayCount: 4,
    });
    expect(resolved.packs.map((p) => p.packId)).toEqual(
      expect.arrayContaining(['reykjavik_arrival', 'snaefellsnes']),
    );
    expect(resolved.missingPackRegionIds).toEqual([]);
    const rows = svc.buildSeedRows(
      resolved.packs.filter((p) => p.packId === 'snaefellsnes'),
    );
    expect(rows.some((r) => r.placeId === 381040)).toBe(true); // Kirkjufell
    expect(rows.filter((r) => r.sourceRef.role === 'REGION_CORE').length).toBeGreaterThanOrEqual(
      3,
    );
  });

  it('warns REGION_PACK_MISSING for unsupported wizard regions', () => {
    const { svc } = build();
    // All wizard regions now have packs or are corridor; use a fake id via empty packsFor
    const resolved = svc.resolvePacksForCreate({
      regionIds: ['not_a_real_region'],
      dayCount: 5,
    });
    expect(resolved.missingPackRegionIds).toContain('not_a_real_region');
    expect(resolved.warnings.some((w) => w.code === 'REGION_PACK_MISSING')).toBe(true);
  });

  it('resolves north / westfjords / highlands / east_fjords packs', () => {
    const { svc } = build();
    const resolved = svc.resolvePacksForCreate({
      regionIds: ['north', 'westfjords', 'highlands', 'east_fjords'],
      dayCount: 14,
    });
    expect(resolved.packs.map((p) => p.packId)).toEqual(
      expect.arrayContaining([
        'north',
        'westfjords',
        'highlands',
        'east_fjords',
      ]),
    );
    expect(resolved.missingPackRegionIds).toEqual([]);
    expect(svc.getPack('highlands')?.planningPolicy.involvesFRoad).toBe(true);
  });

  it('buildSeedRows tags REGION_CORE before REGION_SECONDARY', () => {
    const { svc } = build();
    const packs = svc.packsForWizardRegion('golden_circle');
    const rows = svc.buildSeedRows(packs);
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.filter((r) => r.sourceRef.role === 'REGION_CORE').length).toBe(3);
    expect(rows.every((r) => r.priority === 'very_interested' || r.priority === 'alternative')).toBe(
      true,
    );
    // Coverage anchors are prefer-not-force: never must_go
    expect(rows.every((r) => r.priority !== 'must_go')).toBe(true);
  });

  it('seedFromPacks writes heterogeneous candidate rows', async () => {
    const { svc, candidates } = build();
    const result = await svc.seedFromPacks({
      tripId: 't1',
      regionIds: ['golden_circle', 'south_coast'],
      dayCount: 7,
      catalogPlaceIds: [999001, 381037],
    });
    expect(result.seeded).toBeGreaterThan(0);
    expect(candidates.seedCandidateRows).toHaveBeenCalled();
    const firstBatch = candidates.seedCandidateRows.mock.calls[0][1] as Array<{
      sourceRef: { role: string };
    }>;
    expect(firstBatch.some((r) => r.sourceRef.role === 'REGION_CORE')).toBe(true);
    expect(result.coverageDraft.activePackIds.length).toBeGreaterThan(0);
  });

  it('evaluateRegionCoverage marks covered vs uncovered regions', async () => {
    const { svc } = build();
    const { coverage, warnings } = await svc.evaluateRegionCoverage({
      tripId: 't1',
      requestedRegionIds: ['golden_circle', 'south_coast'],
      activePackIds: ['golden_circle', 'south_coast_west'],
    });
    expect(coverage.covered.map((c) => c.regionId).sort()).toEqual([
      'golden_circle',
      'south_coast',
    ]);
    expect(coverage.covered.find((c) => c.regionId === 'south_coast')?.scheduledPlaceIds).toEqual(
      expect.arrayContaining([381080, 381038]),
    );
    expect(warnings.some((w) => w.code === 'REGION_COVERAGE_PARTIAL')).toBe(false);
  });

  it('evaluateRegionCoverage emits REGION_COVERAGE_PARTIAL when no hits', async () => {
    const { svc, prisma } = build();
    prisma.itineraryItem.findMany.mockResolvedValue([]);
    const { warnings } = await svc.evaluateRegionCoverage({
      tripId: 't1',
      requestedRegionIds: ['golden_circle'],
      activePackIds: ['golden_circle'],
    });
    expect(warnings.some((w) => w.code === 'REGION_COVERAGE_PARTIAL')).toBe(true);
  });
});
