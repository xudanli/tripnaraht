import { parseVibeFreeTextWithRules, resolveVibeTeamworkContractModelLabel } from './vibe-llm-parse.engine';
import { isScript3NonMainstreamCollision, SCRIPT_3_EXPECTED_CHIP_LABELS } from '../config/vibe-recruitment-scripts.config';

const SCRIPT_3_TEXT =
  '人在杭州做 AI System 建模，由于长期面对虚拟的数据符号，感觉自己失去了对物理世界的真实感知（悬浮感）。6月打算去大理的游民社区住一阵子。希望能找一两个完全不是互联网圈、但在自己领域能量极高的野生搭子，比如独立手艺人、陶艺师、消费品主理人或者流浪歌手。白天各忙各的，下午带我剥离逻辑，去钻最具体的当地集市，或者去苍山下捡菌子、做饭。希望你是一个极度松弛、有野性生命力的人，最好会弹吉他或者做饭，带我找回具体的真实生活。';

describe('Script 3 — 非主流对撞 · 大理', () => {
  it('detects script 3 context', () => {
    expect(isScript3NonMainstreamCollision(SCRIPT_3_TEXT)).toBe(true);
  });

  it('parses script 3 vibe chips, gates, slots, and teamwork', () => {
    const payload = parseVibeFreeTextWithRules(SCRIPT_3_TEXT);

    expect(payload.vibe_chips.map((c) => c.label)).toEqual(
      expect.arrayContaining([...SCRIPT_3_EXPECTED_CHIP_LABELS]),
    );
    expect(payload.vibe_chips.map((c) => c.label)).not.toContain('🧘 深度松弛');
    expect(payload.vibe_chips.map((c) => c.label)).not.toContain('🏛️ 深度共学型');
    expect(payload.vibe_chips.map((c) => c.label)).not.toContain('🎵 音乐小酒馆');

    expect(payload.teamwork_contract_model).toBe('Improvisational');
    expect(resolveVibeTeamworkContractModelLabel(payload.teamwork_contract_model)).toBe('一起随便玩');

    expect(payload.hard_gates.education_baseline).toBe('None');
    expect(payload.hard_gates.industry_preference).toEqual(
      expect.arrayContaining(['艺术/设计/策展', '知名制造集团']),
    );
    expect(payload.hard_gates.industry_preference).not.toContain('泛科技/互联网');

    expect(payload.slot_definitions[0].expected_tag).toContain('ISFP');
    expect(payload.slot_definitions[1].expected_tag).toContain('ESTP');
    expect(payload.slot_definitions[0].reason).toMatch(/^AI: /);
  });
});
