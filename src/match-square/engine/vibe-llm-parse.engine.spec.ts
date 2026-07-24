import { deriveRecruitmentFormSuggestions, enrichVibePayloadForRead, parseVibeFreeTextWithRules, resolveVibeTeamworkContractModelLabel } from './vibe-llm-parse.engine';

const PRD_EXAMPLE =
  '打算自驾环游中国，想搞个做饭穷游组，路上可以一起露营，晚上有空一起 vibe coding 或者唱歌。希望搭子是高学历或者大厂的，靠谱点，别掉链子。预算两到五千。';

describe('parseVibeFreeTextWithRules', () => {
  it('parses PRD 4.3 example into chips, gates, and puzzle slots', () => {
    const payload = parseVibeFreeTextWithRules(PRD_EXAMPLE);

    expect(payload.parse_source).toBe('rules');
    expect(payload.vibe_chips.map((c) => c.label)).toEqual(
      expect.arrayContaining([
        '🏎️ 自驾环游',
        '🍳 炊事合伙人',
        '⛺️ 荒野露营',
        '⚡️ Vibe Coding',
        '🎵 音乐狂欢',
        '🛡️ 职层高授信',
      ]),
    );
    expect(payload.teamwork_contract_model).toBe('Co-Creation');
    expect(resolveVibeTeamworkContractModelLabel(payload.teamwork_contract_model)).toBe('一起策划');
    expect(payload.hard_gates.education_baseline).toBe('Bachelor');
    expect(payload.hard_gates.security_level).toBe('High');
    expect(payload.slot_definitions.length).toBeGreaterThanOrEqual(3);
    expect(payload.behavioral_contracts.length).toBeGreaterThan(0);
    expect(payload.contract_hint).toContain('一起策划');
  });

  it('returns empty-ish payload for blank input', () => {
    const payload = parseVibeFreeTextWithRules('');
    expect(payload.vibe_chips).toEqual([]);
    expect(payload.slot_definitions.length).toBeGreaterThan(0);
  });

  it('parses hardcore offroad survival text without generic glamping chips', () => {
    const text =
      '想去西藏阿里或者冰岛无人区搞次真自驾越野。一路上可能断网没信号，条件比较艰苦，不搞精致露营，就是硬核野外生存。希望搭子是理工科背景、动手能力极强的硬核老司机。最好遇到爆胎、陷车能一起提着扳手下去干活的，不要温室里的花朵，芝麻分必须极佳。';
    const payload = parseVibeFreeTextWithRules(text);
    const labels = payload.vibe_chips.map((c) => c.label);

    expect(labels).toEqual(
      expect.arrayContaining([
        '🛞 硬核越野自驾',
        '🏔️ 硬核野外生存',
        '🔧 硬核老司机/换胎副手',
        '🛡️ 极高芝麻授信',
      ]),
    );
    expect(labels).not.toContain('🏎️ 自驾环游');
    expect(labels).not.toContain('⛺️ 荒野露营');
    expect(payload.hard_gates.security_level).toBe('High');
    expect(payload.hard_gates.education_baseline).toBe('Bachelor');
    expect(payload.slot_definitions[0].expected_tag).toContain('换胎');
  });

  it('splits recruitment vision into itinerary summary and captain message', () => {
    const payload = parseVibeFreeTextWithRules(PRD_EXAMPLE);
    expect(payload.derived_fields?.itinerary_summary).toMatch(/自驾|露营|vibe coding|做饭/);
    expect(payload.derived_fields?.captain_message).toMatch(/搭子|靠谱|大厂|高学历/);
    expect(payload.hard_gates.budget_range).toBe('¥2000-5000 / 人');
    expect(payload.parse_version).toBe('vibe_llm_v2');
  });

  it('parses healing relax example from few-shot', () => {
    const text =
      '刚刚做完Feature Freeze，班味太重了。想去大理或者塞里木湖边纯躺尸疗愈，不赶任何景点，白天在咖啡馆发呆看云，晚上找个酒馆喝点听民谣。希望搭子是艺术或自由职业的，能量要高、要好玩。';
    const payload = parseVibeFreeTextWithRules(text);
    expect(payload.teamwork_contract_model).toBe('Improvisational');
    expect(payload.vibe_chips.map((c) => c.label)).toEqual(
      expect.arrayContaining(['🧘 深度松弛', '🎨 跨界高能', '🎵 音乐小酒馆', '☁️ 无脑放空']),
    );
    expect(payload.hard_gates.budget_range).toBe('经济弹性');
    expect(payload.hard_gates.security_level).toBe('Medium');
    expect(payload.slot_definitions[0].expected_tag).toContain('ENFP');
    expect(payload.slot_definitions[0].reason).toMatch(/^AI: /);
  });

  it('parses luxury extreme adventure text with multiple vibe chips', () => {
    const text =
      '打算去新疆搞一次高强度的直升机滑雪或者新西兰高空跳伞。整个行程的酒店、直升机预约、高空保险我都已经托关系全部订好了，顶级品质，预算人均 3w 往上。不需要你动脑子做攻略。要求服从指挥，行中别因为琐碎的钱跟我撕逼，也别对路线指手画脚。希望找个同样是高管或金融圈的靠谱白领拼车拼房。';
    const payload = parseVibeFreeTextWithRules(text);
    expect(payload.vibe_chips.length).toBeGreaterThanOrEqual(4);
    expect(payload.vibe_chips.map((c) => c.label)).toEqual(
      expect.arrayContaining([
        '🪂 极限 Adrenaline',
        '💎 高净值顶配',
        '🎯 队长全包指挥',
        '🛡️ 职层高授信',
      ]),
    );
    expect(payload.teamwork_contract_model).toBe('Full-Service');
    expect(resolveVibeTeamworkContractModelLabel(payload.teamwork_contract_model)).toBe('全托管');
    expect(payload.hard_gates.budget_range).toBe('¥30000+ / 人 · 队长全包');
    expect(payload.slot_definitions[0].expected_tag).toMatch(/高管|金融/);
    expect(payload.behavioral_contracts.length).toBeGreaterThanOrEqual(3);
    expect(payload.behavioral_contracts.map((c) => c.title)).toEqual(
      expect.arrayContaining(['极限冒险风险契约', '高净值消费契约', '全托管服从契约']),
    );
  });

  it('derives recruitment form suggestions from vision text', () => {
    const text =
      '打算去新疆搞一次高强度的直升机滑雪，预算人均 3w 往上。希望找个同样是高管或金融圈的靠谱白领。';
    const payload = parseVibeFreeTextWithRules(text);
    const suggestions = deriveRecruitmentFormSuggestions(text, payload.vibe_chips, payload.hard_gates);
    expect(suggestions.destination).toBe('新疆');
    expect(suggestions.destinationRegionId).toBe('domestic_northwest');
    expect(suggestions.destinationRegionLabel).toBe('国内 · 西北');
    expect(suggestions.destinationSubScopeId).toBe('xinjiang');
    expect(suggestions.destinationSubScopeLabel).toBe('新疆');
    expect(suggestions.budgetMinCents).toBe(3_000_000);
    expect(suggestions.travelMode).toBe('self_drive');
    expect(suggestions.tripMoodTag).toBe('adventure');
    expect(suggestions.preferenceNotes).toContain('金融/咨询');
  });

  it('parses NZ luxury text with 5w+ and captain full-pay budget hard gate', () => {
    const text =
      '去新西兰南岛搞一次顶级的多巴胺越界：高空跳伞、直升机滑雪，再加上高能的荒野漂流。住宿已经全部定好了南阿尔卑斯山脉的野奢 Lodge，人均预算 5w+。别跟我聊职场、聊 KPI，但可以聊聊最新的种子轮投资或者商业模式的非对称性博弈。搭子要风险投资人（VC）、知名制造集团二代或者财务极其自由的创业者。我的组队风格就是全托管，路线和预约我全包，你听指挥、敢玩、别因为钱在行中撕逼就行。';
    const payload = parseVibeFreeTextWithRules(text);
    const suggestions = deriveRecruitmentFormSuggestions(text, payload.vibe_chips, payload.hard_gates);
    expect(payload.hard_gates.budget_range).toBe('¥50000+ / 人 · 队长全包');
    expect(suggestions.budgetMinCents).toBe(5_000_000);
    expect(suggestions.destination).toBe('新西兰');
    expect(payload.teamwork_contract_model).toBe('Full-Service');
  });

  it('derives destination region and sub-scope for 青甘大环', () => {
    const payload = parseVibeFreeTextWithRules('想走青甘大环，路上露营做饭穷游');
    const suggestions = deriveRecruitmentFormSuggestions(
      '想走青甘大环，路上露营做饭穷游',
      payload.vibe_chips,
      payload.hard_gates,
    );
    expect(suggestions.destinationRegionId).toBe('domestic_northwest');
    expect(suggestions.destinationSubScopeId).toBe('qinggan_great_loop');
    expect(suggestions.destinationSubScopeLabel).toBe('青甘大环');
    expect(suggestions.destination).toBe('西北·青甘大环');
  });

  it('enriches stored snapshot with behavioral contracts on read', () => {
    const payload = parseVibeFreeTextWithRules(
      '打算去新疆直升机滑雪，预算人均 3w 往上，服从指挥，希望找个金融圈靠谱白领。',
    );
    const stored = { ...payload, behavioral_contracts: [] };
    const enriched = enrichVibePayloadForRead(stored);
    expect(enriched.behavioral_contracts.length).toBeGreaterThan(0);
    expect(enriched.behavioral_contracts[0].title).toMatch(/极限|高净值|全托管/);
  });
});
