import {
  extractOpenWorldMentionsFromText,
  mergeDiscoveryStubsIntoPoiEvidence,
  runOpenWorldDiscoveryBuffer,
} from '../open-world/discovery-buffer.util';
import { resetOpenWorldStubIdCounterForTests } from '../open-world/open-world-poi-stub.util';
import {
  buildDecisionContextSliceFromOrchestrator,
  mergeDecisionContextIntoConstraints,
} from '../open-world/decision-context-sync.util';

describe('discovery-buffer.util', () => {
  beforeEach(() => {
    resetOpenWorldStubIdCounterForTests();
  });

  it('extracts Disko kayak mention from user text', () => {
    const mentions = extractOpenWorldMentionsFromText('想在迪斯科湾皮划艇看冰山，7天');
    expect(mentions.some((m) => m.activityKind === 'kayak_iceberg')).toBe(true);
  });

  it('creates verification_pending stub when mention not grounded', () => {
    const result = runOpenWorldDiscoveryBuffer({
      userMessage: '迪斯科湾皮划艇看冰山',
      countryCode: 'GL',
      existingPoiEvidence: [{ name: 'Nuuk Museum', nameCN: '努克博物馆' }],
    });
    expect(result.stubs.length).toBeGreaterThan(0);
    expect(result.stubs[0].status).toBe('verification_pending');
    expect(result.stubs[0].source).toBe('user_mention');
  });

  it('skips stub when POI evidence already covers mention', () => {
    const result = runOpenWorldDiscoveryBuffer({
      userMessage: '迪斯科湾皮划艇看冰山',
      countryCode: 'GL',
      existingPoiEvidence: [
        { name: 'Disko Bay Kayak Iceberg Tour', nameCN: '迪斯科湾皮划艇看冰山' },
      ],
    });
    expect(result.stubs.length).toBe(0);
    expect(result.skippedGroundedCount).toBeGreaterThan(0);
  });

  it('mergeDiscoveryStubsIntoPoiEvidence dedupes by stub id', () => {
    const result = runOpenWorldDiscoveryBuffer({
      userMessage: '朗伊尔城等极光',
      countryCode: 'SJ',
      existingPoiEvidence: [],
    });
    const merged = mergeDiscoveryStubsIntoPoiEvidence([], result.stubs);
    const again = mergeDiscoveryStubsIntoPoiEvidence(merged, result.stubs);
    expect(again.length).toBe(merged.length);
  });
});

describe('decision-context-sync.util', () => {
  it('builds decisionContext from orchestrator metadata', () => {
    const state = {
      metadata: {
        sparse_region_profile: 'sparse_polar_svalbard',
        open_world_stubs: [
          {
            stubId: 'provisional_aurora_window_sj',
            displayName: '极光窗',
            regionHint: 'Svalbard',
            constraintTags: ['weather_window'],
            status: 'verification_pending',
            source: 'user_mention',
            nodeKind: 'elastic',
          },
        ],
      },
      itinerary: { days: [{ day: 1, date: '2026-03-01', slots: {} }] },
    } as any;

    const slice = buildDecisionContextSliceFromOrchestrator(state);
    expect(slice.sparseProfileId).toBe('sparse_polar_svalbard');
    expect(slice.openWorldStubs?.length).toBe(1);
    expect(slice.intentionalSlack?.length).toBeGreaterThan(0);

    const merged = mergeDecisionContextIntoConstraints(
      { feasible: true, violations: [] },
      slice,
    );
    expect(merged.decisionContext?.sparseProfileId).toBe('sparse_polar_svalbard');
  });
});
