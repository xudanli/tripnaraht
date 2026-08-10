import {
  buildGoldenSetInventory,
  listSolverAttractionPlaceIds,
  packsForWizardRegion,
  softAlternativeGroups,
} from '../packs/iceland-region-pack.registry';
import {
  GOLDEN_CIRCLE_PACK,
  SOUTH_COAST_EAST_PACK,
  SOUTH_COAST_WEST_PACK,
  SNAEFELLSNES_PACK,
  EAST_FJORDS_PACK,
  HIGHLANDS_PACK,
  WESTFJORDS_PACK,
  NORTH_ICELAND_PACK,
} from '../packs/iceland-region-planning-packs';
import { listRegionCatalog } from '../dictionaries/iceland-self-drive-catalog';

describe('Iceland region golden set (QA model)', () => {
  it('marks east_fjords as CORRIDOR_ONLY and not golden-set ready', () => {
    expect(EAST_FJORDS_PACK.coverageStatus).toBe('CORRIDOR_ONLY');
    expect(EAST_FJORDS_PACK.regionalGoldenSetReady).toBe(false);
    expect(listSolverAttractionPlaceIds(EAST_FJORDS_PACK)).toEqual([]);
    expect(listRegionCatalog().find((r) => r.id === 'east_fjords')).toMatchObject({
      supportLevel: 'corridor_only',
      regionalGoldenSetReady: false,
    });
  });

  it('does not hard-exclusive Reynisfjara / Dyrhólaey', () => {
    expect(softAlternativeGroups(SOUTH_COAST_WEST_PACK)).toContain('scw_coast');
    expect(
      SOUTH_COAST_WEST_PACK.relations.find((r) => r.groupId === 'scw_coast')
        ?.relationType,
    ).toBe('SOFT_ALTERNATIVE');
  });

  it('splits glacier hike and super jeep from placeIds', () => {
    const hike = SOUTH_COAST_EAST_PACK.entities.find(
      (e) => e.experienceProductId === 'exp_glacier_hike_skaftafell',
    );
    expect(hike?.entityType).toBe('EXPERIENCE_PRODUCT');
    expect(hike?.placeId).toBeUndefined();
    expect(hike?.regionAnchorPlaceId).toBe(381088);

    const jeep = HIGHLANDS_PACK.entities.find(
      (e) => e.experienceProductId === 'exp_landmannalaugar_superjeep',
    );
    expect(jeep?.placeId).toBeUndefined();
    expect(jeep?.regionAnchorPlaceId).toBe(381108);

    const thorsExp = HIGHLANDS_PACK.entities.find(
      (e) => e.experienceProductId === 'exp_thorsmork_superjeep',
    );
    expect(thorsExp?.entityType).toBe('EXPERIENCE_PRODUCT');
    expect(thorsExp?.regionAnchorPlaceId).toBe(381109);
    expect(thorsExp?.placeId).toBeUndefined();

    const thorsPlace = HIGHLANDS_PACK.entities.find((e) => e.placeId === 381109);
    expect(thorsPlace?.entityType).toBe('ROUTE_ANCHOR');
    expect(thorsPlace?.coverageRole).toBe('SUPPORT');
    expect(listSolverAttractionPlaceIds(HIGHLANDS_PACK)).not.toContain(381109);
  });

  it('canonicalizes Snæfellsjökull and Dynjandi aliases', () => {
    const aliasSnae = SNAEFELLSNES_PACK.entities.find((e) => e.placeId === 381087);
    expect(aliasSnae?.canonicalPlaceId).toBe(381099);
    expect(listSolverAttractionPlaceIds(SNAEFELLSNES_PACK)).toContain(381099);
    expect(listSolverAttractionPlaceIds(SNAEFELLSNES_PACK)).not.toContain(381087);

    const aliasDyn = WESTFJORDS_PACK.entities.find((e) => e.placeId === 381290);
    expect(aliasDyn?.canonicalPlaceId).toBe(381458);
  });

  it('models Skaftafell → Svartifoss as PARENT_CHILD', () => {
    const rel = SOUTH_COAST_EAST_PACK.relations.find(
      (r) => r.groupId === 'sce_skaftafell_svartifoss',
    );
    expect(rel?.relationType).toBe('PARENT_CHILD');
    expect(
      SOUTH_COAST_EAST_PACK.entities.find((e) => e.placeId === 381093)?.parentPlaceId,
    ).toBe(381088);
  });

  it('models lagoon as CO_VISIT_CLUSTER', () => {
    expect(
      SOUTH_COAST_EAST_PACK.relations.find((r) => r.groupId === 'sce_lagoon')
        ?.relationType,
    ).toBe('CO_VISIT_CLUSTER');
  });

  it('splits north / westfjords / highlands into subregions', () => {
    expect(NORTH_ICELAND_PACK.subregions?.map((s) => s.subregionId)).toEqual(
      expect.arrayContaining([
        'north_west',
        'north_east_myvatn',
        'diamond_circle',
      ]),
    );
    expect(NORTH_ICELAND_PACK.planningPolicy.requireSubregionDayScope).toBe(true);
    expect(WESTFJORDS_PACK.subregions?.length).toBe(2);
    expect(HIGHLANDS_PACK.subregions?.map((s) => s.subregionId)).toEqual(
      expect.arrayContaining([
        'highlands_south_landmannalaugar',
        'highlands_south_thorsmork',
        'highlands_north_askja',
        'highlands_crossing_sprengisandur',
      ]),
    );
  });

  it('labels Geysir as geothermal area and Reykjavík as ORIGIN_BASE town hub', () => {
    const geysir = GOLDEN_CIRCLE_PACK.entities.find((e) => e.placeId === 381083);
    expect(geysir?.displayName).toMatch(/Haukadalur|Geothermal/i);
    expect(geysir?.entityType).toBe('ATTRACTION_AREA');

    const rvk = GOLDEN_CIRCLE_PACK.entities.find((e) => e.placeId === 381042);
    expect(rvk?.entityType).toBe('TOWN_HUB');
    expect(rvk?.routeRoles).toContain('ORIGIN_BASE');
  });

  it('Golden Circle includes SECONDARY fill beyond classic trio', () => {
    const secondaries = GOLDEN_CIRCLE_PACK.entities.filter(
      (e) => e.coverageRole === 'SECONDARY',
    );
    expect(secondaries.map((e) => e.placeId)).toEqual(
      expect.arrayContaining([389399, 388608, 388566, 389622]),
    );
    expect(listSolverAttractionPlaceIds(GOLDEN_CIRCLE_PACK).length).toBeGreaterThanOrEqual(
      7,
    );
  });

  it('maps south_coast wizard id to west+east packs', () => {
    expect(packsForWizardRegion('south_coast').map((p) => p.packId)).toEqual([
      'south_coast_west',
      'south_coast_east',
    ]);
  });

  it('inventory exposes pack readiness for核对', () => {
    const inv = buildGoldenSetInventory();
    expect(inv.length).toBeGreaterThan(20);
    expect(inv.some((r) => r.experienceProductId?.startsWith('exp_'))).toBe(true);
  });
});
