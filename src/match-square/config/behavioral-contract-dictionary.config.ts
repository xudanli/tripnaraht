/** PRD 4.3 — 免责与共事契约字典库（由 Chip 动态抽取） */

export interface BehavioralContractTemplate {
  key: string;
  title: string;
  clauses: string[];
  hint: string;
}

export const BEHAVIORAL_CONTRACT_DICTIONARY: Record<string, BehavioralContractTemplate> = {
  cooking_partner: {
    key: 'cooking_partner',
    title: '炊事合伙人行为契约',
    clauses: [
      '行前确认买菜分工与公共调料采购清单',
      '行中餐饮费用按约定周期均摊，禁止临时拒付已确认公共开支',
      '轮流承担备餐/洗碗，缺席需提前 24h 告知',
    ],
    hint: '💡 AI 已为你自动生成『炊事合伙人行为契约』：加入的队员将默认签署买菜分工与费用均摊分账条款。',
  },
  wild_camping: {
    key: 'wild_camping',
    title: '荒野露营共担契约',
    clauses: [
      '队员需自备或按约定分摊露营基础装备',
      '遵守 LNT 无痕露营原则，营地安全由队长最终裁定',
    ],
    hint: '💡 AI 已追加『荒野露营共担契约』：队员默认接受装备分摊与营地安全裁决。',
  },
  vibe_coding: {
    key: 'vibe_coding',
    title: 'Vibe Coding 静默契约',
    clauses: [
      '晚间 coding 时段保持低噪，尊重他人休息',
      '公共电源/网络设备使用需提前预约时段',
    ],
    hint: '💡 AI 已识别 Vibe Coding 场景：队员默认签署低噪时段与电源共享条款。',
  },
  music_vibe: {
    key: 'music_vibe',
    title: '音乐狂欢边界契约',
    clauses: [
      '公共区域音乐时段需群内投票通过',
      '22:00 后切换静音或耳机模式',
    ],
    hint: '💡 AI 已识别音乐场景：队员默认接受时段投票与夜间静音规则。',
  },
  hardcore_offroad: {
    key: 'hardcore_offroad',
    title: '硬核越野救援契约',
    clauses: [
      '队员需具备换胎/陷车救援基本能力，不得以「不会动手」为由推脱',
      '无人区/无信号路段服从队长或轮值安全官的应急裁决',
      '公共救援工具与备胎损耗按约定分摊',
    ],
    hint: '💡 AI 已识别硬核越野场景：队员默认签署换胎陷车共担与应急裁决条款。',
  },
  hardcore_survival: {
    key: 'hardcore_survival',
    title: '硬核野外生存契约',
    clauses: [
      '接受断网/无信号条件下的艰苦住宿，不临时要求升级精致酒店',
      '自备或分摊应急口粮、保暖与通讯备份设备',
      '拒绝「温室花朵」式抱怨 — 行前需确认体能与心理承受力',
    ],
    hint: '💡 AI 已识别硬核生存场景：队员默认接受断网艰苦条件，拒绝精致露营式升级。',
  },
  extreme_adventure: {
    key: 'extreme_adventure',
    title: '极限冒险风险契约',
    clauses: [
      '行前确认高空/滑雪类项目的体能与医疗禁忌，不得隐瞒病史',
      '极限项目须服从教练/队长安全指令，不得擅自脱离编队',
      '行中因个人原因放弃项目，已预订费用按约定自担，不得向队友转嫁',
    ],
    hint: '💡 AI 已识别极限冒险场景：队员默认签署安全服从与费用自担条款。',
  },
  luxury_tier: {
    key: 'luxury_tier',
    title: '高净值消费契约',
    clauses: [
      '接受队长预设的高标准住宿/项目预算，行中不因「太贵」临时降级或撕逼',
      '公共高端消费按约定周期结算，禁止临时拒付已确认开支',
      '对品质分歧以队长裁决为准，避免现场挑刺破坏团队节奏',
    ],
    hint: '💡 AI 已识别高净值顶配场景：队员默认接受预算共识与品质裁决。',
  },
  captain_full_service: {
    key: 'captain_full_service',
    title: '全托管服从契约',
    clauses: [
      '队长全权负责行程、订房与后勤，队员不对路线/酒店指手画脚',
      '行中服从队长调度，不因琐碎开支或临时变更发起负面冲突',
      '需要个性化调整须行前提出，行中默认跟随既定安排',
    ],
    hint: '💡 AI 已识别队长全包指挥场景：队员默认签署行中服从与零挑刺条款。',
  },
  executive_circle: {
    key: 'executive_circle',
    title: '高管圈层对等契约',
    clauses: [
      '队员背景与队长圈层预期大致对等，避免「蹭高端局」式社交',
      '商务/职场信息交换遵循自愿，不得强行打探隐私',
      '拼车拼房费用观一致，拒绝现场砍价或道德绑架',
    ],
    hint: '💡 AI 已识别高管圈层场景：队员默认签署圈层对等与费用观一致条款。',
  },
  credential_tier: {
    key: 'credential_tier',
    title: '职层互信契约',
    clauses: [
      '队员需完成平台要求的学历/职业背书，信息真实可核验',
      '行中承诺靠谱不掉链子，临时放鸽子需承担约定违约责任',
    ],
    hint: '💡 AI 已识别职层高授信场景：队员默认签署背书真实与履约条款。',
  },
};

export const TEAMWORK_CONTRACT_HINTS: Record<string, string> = {
  'Full-Service':
    '💡 AI 判定为「全托管」组织模式：队长主导后勤，队员以体验跟随为主。',
  'Co-Creation':
    '💡 AI 判定为「一起策划」组织模式：行前共担筹备，行中 democratic 分工。',
  Improvisational:
    '💡 AI 判定为「一起随便玩」组织模式：无硬性日程，支持即兴脱队。',
};
