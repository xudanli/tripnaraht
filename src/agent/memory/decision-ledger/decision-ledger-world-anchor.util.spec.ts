import { buildDecisionMemory } from '../decision-memory/decision-memory.types';
import {
  buildWorldAnchorV1FromSlices,
  buildWorldTopicSlicesFromTripContext,
  deriveMemoryLedgerPhaseFromTripTask,
  isWorldTopicSliceStale,
  listStaleWorldTopicTopics,
  serializeWorldAnchorComposite,
} from './decision-ledger-world-anchor.util';

describe('decision-ledger-world-anchor', () => {
  it('buildWorldAnchor separates coarse and fine digests', () => {
    const slices = buildWorldTopicSlicesFromTripContext({
      recentWorldDecisions: [],
      activeTripState: null,
      nowMs: 1_700_000_000_000,
    });
    const w = buildWorldAnchorV1FromSlices(slices);
    expect(w.coarseDigest.length).toBeGreaterThan(0);
    expect(w.fineDigest.length).toBeGreaterThan(0);
    expect(w.activeTopics['telemetry:total_cost_hint']).toBeTruthy();
    expect(serializeWorldAnchorComposite(w).length).toBeGreaterThan(0);
  });

  it('deriveMemoryLedgerPhaseFromTripTask maps trip phases', () => {
    expect(deriveMemoryLedgerPhaseFromTripTask(null)).toBe('PLANNING');
    expect(
      deriveMemoryLedgerPhaseFromTripTask({
        tripId: 't',
        currentPhase: 'confirm',
        decisionLogSummary: '',
        artifactsRefs: [],
        lastUpdated: '',
      }),
    ).toBe('EXECUTION');
    expect(
      deriveMemoryLedgerPhaseFromTripTask({
        tripId: 't',
        currentPhase: 'decision',
        decisionLogSummary: '',
        artifactsRefs: [],
        lastUpdated: '',
      }),
    ).toBe('GATE_EVAL');
  });

  it('listStaleWorldTopicTopics respects ttl', () => {
    const t0 = 1_000_000;
    const slices = buildWorldTopicSlicesFromTripContext({
      recentWorldDecisions: [
        buildDecisionMemory({
          decisionType: 'route',
          inputs: {},
          outputs: {},
          outcome: 'accepted',
          rationale: [],
          causedBy: [],
          timestamp: t0,
        }),
      ],
      activeTripState: null,
      nowMs: t0,
    });
    expect(isWorldTopicSliceStale(slices[0]!, t0 + 90_000)).toBe(false);
    expect(listStaleWorldTopicTopics(slices, t0 + 86_400_001)).toContain('world:wdma_archive');
  });
});
