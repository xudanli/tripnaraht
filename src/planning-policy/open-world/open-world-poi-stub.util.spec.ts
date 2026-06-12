import {
  buildOpenWorldPoiStub,
  isElasticCandidate,
  openWorldStubToCandidatePlace,
  resetOpenWorldStubIdCounterForTests,
} from '../open-world/open-world-poi-stub.util';

describe('open-world-poi-stub.util', () => {
  beforeEach(() => {
    resetOpenWorldStubIdCounterForTests();
  });

  it('maps stub to negative-id elastic CandidatePlace', () => {
    const stub = buildOpenWorldPoiStub({
      displayName: '测试弹性节点',
      regionHint: 'Test',
      lat: 78,
      lng: 15,
    });
    const candidate = openWorldStubToCandidatePlace(stub);
    expect(candidate.id).toBeLessThanOrEqual(-900_000);
    expect(isElasticCandidate(candidate)).toBe(true);
    expect(candidate.canonicalType).toBe('OPEN_WORLD_STUB');
  });
});
