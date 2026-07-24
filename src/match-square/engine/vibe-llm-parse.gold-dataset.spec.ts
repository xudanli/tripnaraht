import { parseVibeFreeTextWithRules, resolveVibeTeamworkContractModelLabel } from './vibe-llm-parse.engine';
import {
  resolveRecruitmentScript,
  type VibeRecruitmentScriptId,
} from '../config/vibe-recruitment-scripts.config';

const GOLD_DATASET: Array<{
  id: VibeRecruitmentScriptId;
  text: string;
  expectedChipLabels: readonly string[];
  teamworkModel: string;
  teamworkLabel: string;
  slotTags: [string, string];
  educationBaseline: string;
  budgetRange?: string;
}> = [
  {
    id: 'island_geek_hackathon',
    text:
      '人在大厂刚刚拿完股票、清完 Deck 离职，打算去巴厘岛乌布或者清迈的数字游民社区数字游牧三个月。白天各自找咖啡馆写自己的 Agent 独立开源项目，晚上或者周末一起在海滩边开着路虎狂飙，聊聊大模型商业化的非对称性机会。搭子要极客、全栈开发或者 AI Product Director 背景的，边界感要极强，白天别互相打扰。希望你也是大厂出来靠谱的，学历硕士或海归，芝麻信用极佳。费用自理，但如果遇到好项目，不排除一起作为 Co-founder 原地组队写第一行代码。',
    expectedChipLabels: ['🌴 巴厘岛游牧', '⚡️ 独立项目Hacking', '🏎️ 沿海狂飙', '🤝 Co-founder盲盒'],
    teamworkModel: 'Improvisational',
    teamworkLabel: '一起随便玩',
    slotTags: ['INTP', 'ENFJ'],
    educationBaseline: 'Master',
    budgetRange: '费用自理',
  },
  {
    id: 'mountain_dyl_retreat',
    text:
      '最近被大厂的高压 OKR 彻底燃尽了，打算去安吉 DNA 数字游民公社或者阿那亚隐居两个礼拜，换个环境做远程顾问工作。白天各自工作，傍晚一起去山谷里徒步或者露营看日落。晚上想组个围炉煮茶局，用 Stanford 的 DYL（设计你的人生）框架和 MBTI 向量帮彼此做一次深度的下半年人生转型复盘。搭子最好是泛科技、金融圈的高管或者资深生活教练，学历要高。需要你有极高的同理心和倾听带宽，拒绝任何爹味说教，拒绝聊大厂撕逼，让我们在旷野里互相疗愈。',
    expectedChipLabels: ['⛰️ 安吉DNA游牧', '📐 DYL人生设计', '⛺️ 山谷围炉', '🧘 班味净洗'],
    teamworkModel: 'Co-Creation',
    teamworkLabel: '一起策划',
    slotTags: ['INFJ', 'ENFP'],
    educationBaseline: 'Master',
  },
  {
    id: 'polar_expedition',
    text:
      '2026年底想去南极或者斯瓦尔巴群岛（Svalbard）搞次深度冰川极昼徒步。不坐那种老头老太太的奢华邮轮，我们要深入内陆科考站和无人冰原。一路上要背着 DEM 高程数据设备采集极限地形，可能会有极寒、极夜或者暴风雪的失温风险。希望搭子是地理、气象、AI算法或者系统架构背景的高知白领，对极端环境有敬畏心，数据洁癖，遇到暴风雪能冷静执行 Plan B，背景最好是 QS50 硕士或大厂总监级别。',
    expectedChipLabels: ['❄️ 极圈科考', '🏔️ 极限徒步', '📡 DEM高程采集', '🥶 极端环境生存'],
    teamworkModel: 'Co-Creation',
    teamworkLabel: '一起策划',
    slotTags: ['INTJ', 'INFP/INFJ'],
    educationBaseline: 'Master',
  },
  {
    id: 'industrial_ruins',
    text:
      '想去东北老工业基地或者德国鲁尔区搞一次重工业废墟和智能工厂的溯源自驾。一路上想去看看那些老掉牙的钢铁厂、造船厂遗迹，顺便拜访几个做制造数字化、智能工厂（APS/MES）的垂直实业老炮。白天看冷酷的钢铁巨兽，晚上在重工业风格的硬核厂房里聊聊工业 digitization 和供应链的未来。搭子最好是Siemens、制造集团或者工业大厂的架构师或产品专家，学历本科以上，有硬核工业审美，别觉得看废墟无聊。',
    expectedChipLabels: ['🏭 工业废墟', '📊 APS/MES数字化', '⚙️ 钢铁巨兽', '🕵️ 遗迹溯源'],
    teamworkModel: 'Co-Creation',
    teamworkLabel: '一起策划',
    slotTags: ['INTP', 'ESTP'],
    educationBaseline: 'Bachelor',
  },
  {
    id: 'dopamine_escape',
    text:
      '拒绝任何动脑子的行程，拒绝 PPT 逻辑，拒绝卷！刚结束一个熬了半年的 fundraising seed 轮融资，整个人都要燃尽了。想去海南万宁或者清迈搞次纯粹的多巴胺发泄。开敞篷车沿海公路狂飙，白天冲浪、跳伞、玩盲盒，晚上在海滩电音节或者 livehouse 喝到断片、唱歌唱到沙哑。搭子不要大厂高管，不要聊工作。要高能 E 人、气氛组天花板、颜值在线的职场逃跑计划者。预算无上限，我甚至可以全包，只要带我疯，别掉链子就行。',
    expectedChipLabels: ['🌊 冲浪/跳伞', '🎵 海滩电音节', '⚡️ 盲盒跟从', '🔥 燃尽复活'],
    teamworkModel: 'Full-Service',
    teamworkLabel: '全托管',
    slotTags: ['ESFP', 'ENFP'],
    educationBaseline: 'None',
    budgetRange: '预算无上限',
  },
];

describe('Gold Dataset — PRD 剧本语义抓取', () => {
  it.each(GOLD_DATASET)('$id resolves script and parses expected payload', ({
    id,
    text,
    expectedChipLabels,
    teamworkModel,
    teamworkLabel,
    slotTags,
    educationBaseline,
    budgetRange,
  }) => {
    expect(resolveRecruitmentScript(text)?.id).toBe(id);

    const payload = parseVibeFreeTextWithRules(text);
    const labels = payload.vibe_chips.map((c) => c.label);

    for (const label of expectedChipLabels) {
      expect(labels).toContain(label);
    }
    expect(payload.teamwork_contract_model).toBe(teamworkModel);
    expect(resolveVibeTeamworkContractModelLabel(payload.teamwork_contract_model)).toBe(
      teamworkLabel,
    );
    expect(payload.hard_gates.education_baseline).toBe(educationBaseline);
    if (budgetRange) {
      expect(payload.hard_gates.budget_range).toBe(budgetRange);
    }
    expect(payload.slot_definitions[0].expected_tag).toContain(slotTags[0]);
    expect(payload.slot_definitions[1].expected_tag).toContain(slotTags[1]);
    expect(payload.slot_definitions[0].reason).toMatch(/^AI: /);
  });
});
