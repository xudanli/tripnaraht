import { mergeDecisionContextIntoNarration } from './merge-decision-context-narration.util';

describe('mergeDecisionContextIntoNarration', () => {
  it('injects sparse slack and verification warnings from SSOT', () => {
    const narration = mergeDecisionContextIntoNarration(
      { user_friendly_summary: '', day_by_day_narrative: [], highlights: [], tips: [] },
      {
        feasible: true,
        violations: [],
        decisionContext: {
          sparseProfileId: 'sparse_polar_greenland',
          intentionalSlack: [
            {
              day: 2,
              reasonCode: 'WEATHER_WINDOW',
              minutesReserved: 240,
            },
          ],
          openWorldStubs: [
            {
              stubId: 'provisional_disco_kayak_gl',
              displayName: '迪斯科湾皮划艇看冰山（待核实）',
              regionHint: 'Disko Bay',
              constraintTags: ['guide_required', 'weather_window'],
              status: 'verification_pending',
              source: 'user_mention',
              nodeKind: 'elastic',
            },
          ],
        },
      },
    );

    expect(narration.tips?.some((t) => t.includes('Dr.Dre'))).toBe(true);
    expect(narration.tips?.some((t) => t.includes('天气窗'))).toBe(true);
    expect(narration.warnings?.some((w) => String(w).includes('Abu'))).toBe(true);
    expect(narration.decision_context_summary?.open_world_stub_count).toBe(1);
  });
});
