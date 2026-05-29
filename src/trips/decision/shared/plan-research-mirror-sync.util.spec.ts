import type { TripWorldState } from '../world-model';
import { syncPlanResearchDataMirrorFromKernelResearch } from './plan-research-mirror-sync.util';
import { RESEARCH_TRACE_SIGNALS_SCHEMA_V1 } from './research-trace-signals-log-metadata.util';

function emptyState(): TripWorldState {
  return {
    context: {
      destination: 'IS',
      startDate: '2026-01-01',
      durationDays: 1,
      preferences: { intents: {}, pace: 'moderate', riskTolerance: 'LOW' },
    },
    candidatesByDate: {},
    signals: {},
    policies: {},
  } as TripWorldState;
}

describe('syncPlanResearchDataMirrorFromKernelResearch', () => {
  it('no-ops when researchData missing or has no trace object', () => {
    const state = emptyState();
    syncPlanResearchDataMirrorFromKernelResearch(state, undefined);
    expect(state.signals.planResearchDataMirror).toBeUndefined();
    syncPlanResearchDataMirrorFromKernelResearch(state, {});
    expect(state.signals.planResearchDataMirror).toBeUndefined();
    syncPlanResearchDataMirrorFromKernelResearch(state, { __research_trace_signals: 'x' as unknown as object });
    expect(state.signals.planResearchDataMirror).toBeUndefined();
  });

  it('copies full researchData when __research_trace_signals is a non-array object', () => {
    const state = emptyState();
    const researchData: Record<string, unknown> = {
      __research_conflict_negotiation: { ok: true },
      __research_trace_signals: {
        schemaVersion: RESEARCH_TRACE_SIGNALS_SCHEMA_V1,
        stability_mode_active: true,
      },
    };
    syncPlanResearchDataMirrorFromKernelResearch(state, researchData);
    expect(state.signals.planResearchDataMirror).toEqual(researchData);
    expect(state.signals.planResearchDataMirror).not.toBe(researchData);
  });
});
