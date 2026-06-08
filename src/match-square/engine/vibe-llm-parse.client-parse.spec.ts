import { normalizeClientVibeParseInput, attachVibeParseSnapshot } from './vibe-llm-parse.engine';

describe('normalizeClientVibeParseInput', () => {
  it('preserves client suggestedFields overlay', () => {
    const view = normalizeClientVibeParseInput(
      {
        payload: {
          vibe_chips: [{ id: 'extreme_adventure', label: '🪂 极限 Adrenaline' }],
          teamwork_contract_model: 'Full-Service',
          hard_gates: {},
          slot_definitions: [],
          behavioral_contracts: [],
          contract_hint: null,
          parse_source: 'rules',
          parse_version: 'vibe_llm_v2',
        },
        suggestedPlanningStyle: 'full_managed',
        suggestedFields: {
          destinationRegionId: 'domestic_northwest',
          destinationSubScopeId: 'xinjiang',
          destination: '新疆',
        },
      },
      { sourceText: '打算去新疆直升机滑雪' },
    );

    expect(view?.payload.source_text).toBe('打算去新疆直升机滑雪');
    expect(view?.suggestedPlanningStyle).toBe('full_managed');
    expect(view?.suggestedFields.destinationRegionId).toBe('domestic_northwest');
    expect(view?.suggestedFields.destinationSubScopeId).toBe('xinjiang');
  });

  it('stores parse view via attachVibeParseSnapshot', () => {
    const view = normalizeClientVibeParseInput({
      payload: {
        vibe_chips: [],
        teamwork_contract_model: 'Co-Creation',
        hard_gates: {},
        slot_definitions: [],
        behavioral_contracts: [],
        contract_hint: null,
        parse_source: 'rules',
        parse_version: 'vibe_llm_v2',
        source_text: 'test vision',
      },
    });
    expect(view).not.toBeNull();
    const snapshot = attachVibeParseSnapshot({ mbtiType: 'INTJ' }, view!.payload, view!);
    expect(snapshot._vibeParse?.payload.source_text).toBe('test vision');
    expect(snapshot._vibeLlm?.source_text).toBe('test vision');
  });
});
