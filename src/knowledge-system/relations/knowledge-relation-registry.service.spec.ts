import { EntityIdentityRegistryService } from '../identity/entity-identity-registry.service';
import { KnowledgeRelationRegistryService } from './knowledge-relation-registry.service';

describe('KnowledgeRelationRegistryService manual CRUD', () => {
  it('creates and deletes a manual relation without DB', async () => {
    const identity = new EntityIdentityRegistryService();
    await identity.onModuleInit();
    const relations = new KnowledgeRelationRegistryService(
      { isDbConnected: () => false } as never,
      identity,
    );
    relations.reprojectStatic();
    const created = await relations.createManual({
      from: 'is.gullfoss',
      to: 'is.geysir',
      type: 'NEAR',
    });
    expect(created.source).toBe('manual');
    expect(created.country).toBe('IS');
    expect(relations.get(created.relationId).type).toBe('NEAR');
    await relations.remove(created.relationId);
    expect(() => relations.get(created.relationId)).toThrow();
  });
});
