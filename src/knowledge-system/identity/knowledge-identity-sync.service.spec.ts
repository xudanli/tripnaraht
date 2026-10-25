import { KnowledgeIdentitySyncService } from './knowledge-identity-sync.service';
import { EntityIdentityRegistryService } from './entity-identity-registry.service';

describe('KnowledgeIdentitySyncService', () => {
  it('syncs CPRE into registry and records stats when DB soft-fails', async () => {
    const registry = new EntityIdentityRegistryService();
    await registry.onModuleInit();

    const prisma = {
      isDbConnected: () => false,
      knowledgeEntityIdentity: {},
      knowledgeIdentitySyncRun: {},
      knowledgeOntologyCatalogSnapshot: {},
      countryProfile: { findMany: jest.fn() },
    } as any;

    const sync = new KnowledgeIdentitySyncService(prisma, registry);
    const result = await sync.sync(['cpre', 'ontology_snapshot']);

    expect(result.status).toBe('SUCCESS');
    expect(result.sources).toEqual(['cpre', 'ontology_snapshot']);
    expect((result.stats as any).cpre.catalogSize).toBeGreaterThan(10);
    expect((result.stats as any).cpre.failed).toBeGreaterThan(0); // DB soft-fail
    expect((result.stats as any).ontologySnapshot.saved).toBe(false);
    expect(registry.get('is.reynisfjara')?.origin).toBe('CPRE_SYNC');
  });

  it('syncs Country Pack profiles into Country identities when DB connected', async () => {
    const registry = new EntityIdentityRegistryService();
    await registry.onModuleInit();

    const created: string[] = [];
    const prisma = {
      isDbConnected: () => true,
      countryProfile: {
        findMany: async () => [
          {
            isoCode: 'IS',
            nameCN: '冰岛',
            nameEN: 'Iceland',
            schemaVersion: '1.0',
          },
        ],
      },
      knowledgeEntityIdentity: {
        findUnique: async () => null,
        create: async ({ data }: { data: { canonicalEntityId: string } }) => {
          created.push(data.canonicalEntityId);
          return data;
        },
        update: async () => ({}),
      },
      knowledgeIdentitySyncRun: {
        create: async () => ({}),
      },
      knowledgeOntologyCatalogSnapshot: {
        create: async () => ({}),
      },
    } as any;

    const sync = new KnowledgeIdentitySyncService(prisma, registry);
    const result = await sync.sync(['country_pack']);

    expect(result.status).toBe('SUCCESS');
    expect((result.stats as any).countryPack.created).toBe(1);
    expect(created).toContain('country:is');
    const country = registry.get('country:is');
    expect(country?.entityType).toBe('Country');
    expect(country?.origin).toBe('COUNTRY_PACK');
    expect(country?.displayName).toBe('冰岛');
  });

  it('skips ADMIN rows during sync upsert', async () => {
    const registry = new EntityIdentityRegistryService();
    await registry.onModuleInit();
    registry.register(
      {
        canonicalEntityId: 'is.reynisfjara',
        entityType: 'Place',
        domain: 'PLACE',
        displayName: '运营改名',
        origin: 'ADMIN',
        status: 'ACTIVE',
      },
      { persist: false },
    );

    const prisma = {
      isDbConnected: () => true,
      knowledgeEntityIdentity: {
        findUnique: async () => ({ origin: 'ADMIN' }),
        create: jest.fn(),
        update: jest.fn(),
      },
      knowledgeIdentitySyncRun: { create: async () => ({}) },
      knowledgeOntologyCatalogSnapshot: { create: async () => ({}) },
      countryProfile: { findMany: async () => [] },
    } as any;

    const sync = new KnowledgeIdentitySyncService(prisma, registry);
    const result = await sync.sync(['cpre']);
    expect((result.stats as any).cpre.skippedAdmin).toBeGreaterThanOrEqual(1);
    expect(prisma.knowledgeEntityIdentity.update).not.toHaveBeenCalled();
    expect(prisma.knowledgeEntityIdentity.create).not.toHaveBeenCalled();
    expect(registry.get('is.reynisfjara')?.displayName).toBe('运营改名');
  });
});
