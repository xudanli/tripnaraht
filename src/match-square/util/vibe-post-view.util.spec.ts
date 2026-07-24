import { attachVibePayloadToSnapshot } from '../engine/vibe-llm-parse.engine';
import { buildVibeLlmPostView } from './vibe-post-view.util';

describe('buildVibeLlmPostView', () => {
  it('exposes visionText from stored source_text', () => {
    const snapshot = attachVibePayloadToSnapshot(
      { mbtiType: 'INTJ' },
      {
        vibe_chips: [{ id: 'cooking_partner', label: '🍳 炊事合伙人' }],
        teamwork_contract_model: 'Co-Creation',
        hard_gates: {},
        slot_definitions: [],
        behavioral_contracts: [],
        contract_hint: null,
        parse_source: 'rules',
        parse_version: 'vibe_llm_v1',
      },
      '自驾环游中国，路上一起做饭穷游和露营。',
    );

    const view = buildVibeLlmPostView(snapshot);
    expect(view?.visionText).toBe('自驾环游中国，路上一起做饭穷游和露营。');
    expect(view?.chips[0].label).toContain('炊事');
    expect(view?.teamworkContractModel).toBe('Co-Creation');
    expect(view?.teamworkContractModelLabel).toBe('一起策划');
  });
});
