import type { DecisionState } from '../../decision/kernel/decision-state.types';
import {
  ensureHarnessResearchEvidenceSnapshot,
  persistSelectedPoisToResearchData,
} from './harness-research-evidence-snapshot.util';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';

describe('harness-research-evidence-snapshot.util', () => {
  it('binds harness snapshot from research_data', () => {
    const dso = { harnessRuntime: {} } as DecisionState;
    const out = ensureHarnessResearchEvidenceSnapshot(dso, 'req-1', {
      poi_evidence: [{ poi_id: '1' }],
    });
    expect(out?.harnessRuntime?.researchEvidenceSnapshotId).toMatch(/^research_/);
    expect(out?.harnessRuntime?.evidenceVersion).toBeTruthy();
  });

  it('persists scored pois when raw research was empty (itinerary adjust seeds)', () => {
    const state = { research_data: undefined } as OrchestratorState;
    persistSelectedPoisToResearchData(state, undefined, [{ poi_id: '42' }]);
    expect(state.research_data).toEqual({ poi_evidence: [{ poi_id: '42' }] });
  });
});
