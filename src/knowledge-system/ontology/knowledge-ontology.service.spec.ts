import { EntityIdentityRegistryService } from '../identity/entity-identity-registry.service';
import { KnowledgeOntologyService } from './knowledge-ontology.service';
import { ONTOLOGY_TYPES, ontologyCatalogStats } from './ontology-catalog';

describe('KnowledgeOntologyService', () => {
  let svc: KnowledgeOntologyService;

  beforeAll(async () => {
    const identity = new EntityIdentityRegistryService();
    await identity.onModuleInit();
    svc = new KnowledgeOntologyService(identity);
    await svc.onModuleInit();
  });

  it('overview returns domain cards + stats', () => {
    const ov = svc.overview();
    expect(ov.domains.length).toBe(8);
    expect(ov.domains.some((d) => d.domain === 'MOBILITY' && d.typeCount > 0)).toBe(true);
    expect(ov.stats.typeCount).toBe(ontologyCatalogStats().typeCount);
    expect(ov.stats.registeredEntityCount).toBeGreaterThan(0);
    expect(ov.recentUpdates.length).toBeGreaterThan(0);
    expect(ov.dataSource).toBe('projection');
  });

  it('lists types and attributes from catalog (not empty stubs)', () => {
    const types = svc.listTypes({ domain: 'MOBILITY' });
    expect(types.total).toBeGreaterThan(0);
    expect(types.dataSource).toBe('projection');
    expect(types.items.every((t) => t.domain === 'MOBILITY')).toBe(true);
    expect(types.items.some((t) => t.source === 'travel-ontology-contract')).toBe(true);

    const detail = svc.getType('RouteSegment');
    expect(detail.displayName).toBe('路线区段');
    expect(detail.source).toBe('travel-ontology-contract');
    expect(detail.kindDisplayName).toBe('实体');
    expect(detail.domainDisplayName).toBe('移动');
    expect(detail.attributeCount).toBeGreaterThan(5);
    expect(
      detail.attributes.some(
        (a) => a.fieldKey === 'currentRoadStatus' || a.nameEn === 'currentRoadStatus',
      ),
    ).toBe(true);
    expect(detail.attributes.some((a) => a.fieldKey === 'requiredVehicleCapability')).toBe(true);
    const roadStatus = detail.attributes.find((a) => a.fieldKey === 'currentRoadStatus');
    expect(roadStatus?.displayName).toBe('当前道路状态');
    expect(roadStatus?.name).toBe('当前道路状态');
    expect(roadStatus?.valueKindDisplayName).toBe('枚举');
    expect(roadStatus?.enumValues?.some((v) => v.value === 'CLOSED')).toBe(true);
    expect(roadStatus?.enumValues?.find((v) => v.value === 'CLOSED')?.displayName).toBe('封闭');

    const listed = svc.listTypes({ domain: 'PLACE' });
    const place = listed.items.find((t) => t.typeId === 'Place');
    expect(place?.name).toBe('地点');
    expect(place?.displayName).toBe('地点');
    expect(place?.nameEn).toBe('Place');
    expect(place?.attributes?.length).toBeGreaterThanOrEqual(8);
    expect(place?.attributes?.some((a) => a.fieldKey === 'aliases')).toBe(true);

    const attrs = svc.listAttributes({ ownerTypeId: 'TravelWorldFact' });
    expect(attrs.total).toBeGreaterThan(0);
    expect(attrs.dataSource).toBe('projection');
    const freshness = svc.getAttribute('TravelWorldFact.freshness');
    expect(freshness.enumValues?.some((v) => v.value === 'STALE')).toBe(true);
    expect(freshness.enumValues?.find((v) => v.value === 'STALE')?.displayName).toBe('过期');
    expect(freshness.ownerTypeDisplayName).toBe('旅行世界事实');
  });

  it('loads attributes from DB when prisma connected', async () => {
    const identity = new EntityIdentityRegistryService();
    await identity.onModuleInit();

    const attrStore = new Map<string, any>();
    const typeStore = new Map<string, any>();
    const predStore = new Map<string, any>();

    const prisma = {
      isDbConnected: () => true,
      knowledgeOntologyType: {
        findUnique: async ({ where }: any) => typeStore.get(where.typeId) ?? null,
        findMany: async () => [...typeStore.values()],
        upsert: async ({ where, create, update }: any) => {
          const prev = typeStore.get(where.typeId);
          const next = prev ? { ...prev, ...update } : { ...create, updatedAt: new Date() };
          next.updatedAt = new Date();
          typeStore.set(where.typeId, next);
          return next;
        },
      },
      knowledgeOntologyAttribute: {
        findUnique: async ({ where }: any) => attrStore.get(where.attributeId) ?? null,
        findMany: async () => [...attrStore.values()],
        upsert: async ({ where, create, update }: any) => {
          const prev = attrStore.get(where.attributeId);
          const next = prev ? { ...prev, ...update } : { ...create, updatedAt: new Date() };
          next.updatedAt = new Date();
          attrStore.set(where.attributeId, next);
          return next;
        },
      },
      knowledgeOntologyPredicate: {
        findUnique: async ({ where }: any) => predStore.get(where.predicateId) ?? null,
        findMany: async () => [...predStore.values()],
        upsert: async ({ where, create, update }: any) => {
          const prev = predStore.get(where.predicateId);
          const next = prev ? { ...prev, ...update } : { ...create, updatedAt: new Date() };
          next.updatedAt = new Date();
          predStore.set(where.predicateId, next);
          return next;
        },
      },
    } as any;

    const dbSvc = new KnowledgeOntologyService(identity, prisma);
    const result = await dbSvc.refreshFromDbOrProjection('test');
    expect(result.dataSource).toBe('db');
    expect(result.attributeCount).toBe(ontologyCatalogStats().attributeCount);
    expect(attrStore.size).toBe(ontologyCatalogStats().attributeCount);
    expect(dbSvc.listAttributes({ pageSize: 5 }).dataSource).toBe('db');
    expect(dbSvc.listAttributes({ ownerTypeId: 'RouteSegment' }).total).toBeGreaterThan(5);
  });

  it('export + history + validate', () => {
    const exp = svc.exportCatalog({ scope: 'full', note: 'test' });
    expect(exp.exportId).toMatch(/^ont_exp_/);
    expect(exp.payloadSummary.typeCount).toBe(ONTOLOGY_TYPES.length);
    expect((exp.payload as { types: unknown[] }).types.length).toBeGreaterThan(0);

    const hist = svc.exportHistory();
    expect(hist.total).toBeGreaterThanOrEqual(1);
    expect(hist.items[0].exportId).toBe(exp.exportId);

    const fetched = svc.getExport(exp.exportId);
    expect(fetched.payload).toBeTruthy();

    const v = svc.validate();
    expect(['PASS', 'PASS_WITH_WARNINGS', 'FAIL']).toContain(v.status);
    expect(v.summary.errorCount).toBe(0);
  });
});
