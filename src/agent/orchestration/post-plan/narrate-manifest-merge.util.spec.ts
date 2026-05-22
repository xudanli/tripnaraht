import { applyResearchManifestToNarration } from './narrate-manifest-merge.util';
import type { OrchestratorState } from '../../interfaces/trip-plan.interface';

jest.mock('../../utils/narrator-research-manifest-hints.util', () => ({
  mergeResearchManifestIntoNarration: jest.fn(
    (narration: unknown, _state: unknown, audit: { collapsed_suture_count: number }) => {
      audit.collapsed_suture_count = 2;
      return { ...narration, merged: true };
    },
  ),
}));

describe('applyResearchManifestToNarration', () => {
  it('returns undefined when narration or research_data is missing', () => {
    const state = { narration: { day_by_day_narrative: [] } } as OrchestratorState;
    expect(applyResearchManifestToNarration(state)).toBeUndefined();

    const state2 = { research_data: {} } as OrchestratorState;
    expect(applyResearchManifestToNarration(state2)).toBeUndefined();
  });

  it('merges manifest and returns audit when inputs are present', () => {
    const state = {
      narration: { day_by_day_narrative: [{ day: 1 }] },
      research_data: { manifest: { hints: [] } },
    } as OrchestratorState;

    const audit = applyResearchManifestToNarration(state);

    expect(audit).toEqual({ collapsed_suture_count: 2 });
    expect(state.narration).toMatchObject({ merged: true });
  });
});
