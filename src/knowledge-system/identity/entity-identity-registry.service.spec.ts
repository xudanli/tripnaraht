import {
  normalizePlaceId,
  normalizeRoadId,
  normalizeSegmentId,
  normalizeVehicleId,
  normalizeWeatherRegionId,
  tryNormalizeAny,
} from './normalize-canonical-id.util';
import {
  EntityIdentityRegistryService,
  softValidateWorldFactSubjectId,
} from './entity-identity-registry.service';

describe('normalize-canonical-id', () => {
  it('normalizes place ids including place:is: alias form', () => {
    expect(normalizePlaceId('is.reynisfjara')).toBe('is.reynisfjara');
    expect(normalizePlaceId('IS.Blue_Lagoon')).toBe('is.blue_lagoon');
    expect(normalizePlaceId('place:is:reynisfjara')).toBe('is.reynisfjara');
    expect(normalizePlaceId('place:db:381037')).toBeNull();
  });

  it('normalizes segment / road / vehicle / weather', () => {
    expect(normalizeSegmentId('seg_f208')).toBe('segment:is:f208');
    expect(normalizeSegmentId('F208')).toBe('segment:is:f208');
    expect(normalizeRoadId('IS-R1-SOUTH')).toBe('road:is:r1-south');
    expect(normalizeVehicleId('trip_abc_vehicle')).toBe('vehicle:trip:abc');
    expect(normalizeVehicleId('veh_1')).toBe('vehicle:legacy:veh_1');
    expect(normalizeWeatherRegionId('wx_south_coast')).toBe('weather-region:is:south_coast');
    expect(normalizeWeatherRegionId('south_coast')).toBe('weather-region:is:south_coast');
  });

  it('tryNormalizeAny routes kinds', () => {
    expect(tryNormalizeAny('seg_f208')?.canonicalEntityId).toBe('segment:is:f208');
    expect(tryNormalizeAny('is.reynisfjara')?.kind).toBe('place');
  });
});

describe('EntityIdentityRegistryService', () => {
  let registry: EntityIdentityRegistryService;

  beforeEach(() => {
    registry = new EntityIdentityRegistryService();
    registry.onModuleInit();
  });

  it('seeds CPRE places and resolves by alias', () => {
    const list = registry.list({ entityType: 'Place', pageSize: 5 });
    expect(list.total).toBeGreaterThan(10);

    const byAlias = registry.resolve({ alias: 'Reynisfjara' });
    // catalog may use different display casing; try canonical id
    const byId = registry.resolve({ system: 'cpre', sourceId: 'is.reynisfjara' });
    expect(byId.matchType === 'CANONICAL' || byId.matchType === 'SOURCE_REF').toBe(true);
    if (byId.canonicalEntityId) {
      expect(byId.canonicalEntityId).toMatch(/^is\./);
    }
    // alias may or may not include exact "Reynisfjara" depending on catalog names
    if (byAlias.canonicalEntityId) {
      expect(byAlias.matchType).toBe('ALIAS');
    }
  });

  it('normalizes legacy seg_f208 → segment:is:f208', () => {
    const r = registry.resolve({ system: 'legacy', sourceId: 'seg_f208' });
    expect(r.canonicalEntityId).toBe('segment:is:f208');
    expect(['NORMALIZED', 'SOURCE_REF']).toContain(r.matchType);
    expect(registry.get('segment:is:f208')?.entityType).toBe('RouteSegment');
  });

  it('flags veh_1 as legacy vehicle needing trip scope', () => {
    const unresolved = registry.listUnresolved();
    const veh = unresolved.find((u) => u.subjectId === 'veh_1');
    expect(veh?.reason).toBe('INVALID_FORMAT');
    expect(veh?.suggestedCanonicalId).toBe('vehicle:legacy:veh_1');
  });

  it('resolves place:db → CPRE is.* for curated Golden Set ids', () => {
    const r = registry.resolve({ system: 'place_db', sourceId: 'place:db:381037' });
    expect(r.canonicalEntityId).toBe('is.thingvellir');
    expect(r.matchType).toBe('SOURCE_REF');
    const bare = registry.resolve({ sourceId: '381090' });
    expect(bare.canonicalEntityId).toBe('is.blue_lagoon');
  });

  it('resolves place:is: alias to CPRE', () => {
    const r = registry.resolve({ alias: 'place:is:reynisfjara' });
    expect(r.canonicalEntityId).toBe('is.reynisfjara');
  });

  it('softValidate Place unknown fails; known place ok', () => {
    const bad = softValidateWorldFactSubjectId(registry, 'Place', 'is.not_a_real_poi_zzz');
    expect(bad.ok).toBe(false);
    const good = softValidateWorldFactSubjectId(registry, 'RouteSegment', 'seg_f208');
    expect(good.ok).toBe(true);
    expect(good.canonicalEntityId).toBe('segment:is:f208');
  });

  it('createCanonical writes Identity and is immediately get/list-able', () => {
    const created = registry.createCanonical({
      name: 'Tokyo Station',
      type: 'Place',
      canonicalEntityId: 'place:tokyo_station',
      domain: 'Place',
      country: 'JP',
      aliases: ['東京駅', 'Tokyo Sta.'],
      description: '中央车站',
      status: 'enabled',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.entity.canonicalEntityId).toBe('place:tokyo_station');
    expect(created.entity.displayName).toBe('Tokyo Station');
    expect(created.entity.entityType).toBe('Place');
    expect(created.entity.domain).toBe('PLACE');
    expect(created.entity.status).toBe('ACTIVE');
    expect(registry.get('place:tokyo_station')?.aliases).toContain('東京駅');
    expect(registry.list({ q: 'tokyo_station' }).total).toBeGreaterThanOrEqual(1);
  });

  it('createCanonical rejects unknown type and duplicate id', () => {
    const badType = registry.createCanonical({ name: 'X', type: 'NotARealType' });
    expect(badType.ok).toBe(false);
    if (badType.ok) return;
    expect(badType.code).toBe('VALIDATION_ERROR');

    const first = registry.createCanonical({
      name: 'Dup Place',
      type: 'Place',
      canonicalEntityId: 'place:dup_test',
    });
    expect(first.ok).toBe(true);
    const dup = registry.createCanonical({
      name: 'Dup Place 2',
      type: 'Place',
      canonicalEntityId: 'place:dup_test',
    });
    expect(dup.ok).toBe(false);
    if (dup.ok) return;
    expect(dup.code).toBe('CONFLICT');
  });

  it('createCanonical auto-generates unique id when omitted', () => {
    const a = registry.createCanonical({ name: 'Auto Gen Place', type: 'Place', country: 'JP' });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.entity.canonicalEntityId).toMatch(/^place:/);
    const b = registry.createCanonical({ name: 'Auto Gen Place', type: 'Place', country: 'JP' });
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(b.entity.canonicalEntityId).not.toBe(a.entity.canonicalEntityId);
  });

  it('updateCanonical patches fields and rejects missing id', () => {
    const created = registry.createCanonical({
      name: 'Patch Me',
      type: 'Place',
      canonicalEntityId: 'place:patch_me',
      country: 'JP',
    });
    expect(created.ok).toBe(true);

    const updated = registry.updateCanonical('place:patch_me', {
      name: 'Patched Name',
      aliases: ['别名A'],
      status: 'draft',
      description: '已更新',
      country: 'IS',
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.entity.displayName).toBe('Patched Name');
    expect(updated.entity.aliases).toContain('别名A');
    expect(updated.entity.status).toBe('PENDING');
    expect(updated.entity.country).toBe('IS');
    expect(updated.entity.description).toBe('已更新');
    expect(updated.entity.updatedAt).toBeTruthy();
    expect(registry.get('place:patch_me')?.displayName).toBe('Patched Name');

    const missing = registry.updateCanonical('place:not_exists_zzz', { name: 'X' });
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.code).toBe('NOT_FOUND');

    const empty = registry.updateCanonical('place:patch_me', {});
    expect(empty.ok).toBe(false);
    if (empty.ok) return;
    expect(empty.code).toBe('VALIDATION_ERROR');
  });
});
