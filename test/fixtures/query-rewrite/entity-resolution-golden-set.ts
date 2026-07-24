/**
 * Entity Resolution 模糊 Query Golden Set — Week 3.2 基线评测集。
 *
 * expectedLabels：getTopNCandidates 返回的标准名/POI 名，任一命中 topN 即计 success。
 * expectedEntityId：文档化 ID，供 Qdrant seeding / 运营对账使用。
 */

import type { QueryRewriteScene } from '../../../src/agent/utils/query-rewriting.types';

export type EntityResolutionGoldenTier = 'core' | 'adversarial' | 'stretch';

export interface EntityResolutionGoldenCase {
  id: string;
  query: string;
  expectedEntityId: string;
  expectedLabels: string[];
  scene?: QueryRewriteScene;
  tags: string[];
  topN?: number;
  tier: EntityResolutionGoldenTier;
}

export const ENTITY_RESOLUTION_GOLDEN_SET: EntityResolutionGoldenCase[] = [
  // —— 冰岛 / 西峡湾 ——
  {
    id: 'is-westfjords-fuzzy-01',
    query: '类似冰岛西峡湾那种冷门秘境',
    expectedEntityId: 'IS-ISF',
    expectedLabels: ['冰岛', '西峡湾', 'Westfjords', '雷克雅未克', '伊萨菲厄泽'],
    tags: ['iceland', 'westfjords', 'fuzzy'],
    tier: 'core',
  },
  {
    id: 'is-ring-road-01',
    query: '冰岛环岛自驾看瀑布和黑沙滩',
    expectedEntityId: 'IS',
    expectedLabels: ['冰岛', '维克', '雷克雅未克'],
    tags: ['iceland', 'self-drive'],
    tier: 'core',
  },
  {
    id: 'is-reykjavik-spa-01',
    query: '雷克雅未克周边泡温泉',
    expectedEntityId: 'IS-REK',
    expectedLabels: ['雷克雅未克', '冰岛'],
    scene: 'poi',
    tags: ['iceland', 'spa'],
    tier: 'core',
  },
  {
    id: 'is-westfjords-en-01',
    query: 'Westfjords scenic fjord viewpoints Iceland',
    expectedEntityId: 'IS-ISF',
    expectedLabels: ['Westfjords', '西峡湾', '冰岛'],
    tags: ['iceland', 'westfjords', 'english'],
    tier: 'core',
  },
  {
    id: 'is-highlands-fuzzy-01',
    query: '冰岛高地秘境徒步 F路',
    expectedEntityId: 'IS',
    expectedLabels: ['冰岛', '雷克雅未克', '维克'],
    tags: ['iceland', 'highlands'],
    tier: 'stretch',
  },

  // —— 斯瓦尔巴 ——
  {
    id: 'sj-aurora-01',
    query: '想去斯瓦尔巴看极光',
    expectedEntityId: 'SJ-LYR',
    expectedLabels: ['斯瓦尔巴', 'Svalbard', '朗伊尔城'],
    tags: ['svalbard', 'aurora'],
    tier: 'core',
  },
  {
    id: 'sj-polar-bear-01',
    query: '极夜看北极熊向导随行的地方',
    expectedEntityId: 'SJ-LYR',
    expectedLabels: ['斯瓦尔巴', 'Svalbard', '朗伊尔城'],
    tags: ['svalbard', 'polar', 'implicit'],
    tier: 'core',
  },
  {
    id: 'sj-longyear-en-01',
    query: 'Longyearbyen expedition polar night',
    expectedEntityId: 'SJ-LYR',
    expectedLabels: ['朗伊尔城', '斯瓦尔巴', 'Svalbard'],
    tags: ['svalbard', 'english'],
    tier: 'stretch',
  },

  // —— 西藏 / 林芝 ——
  {
    id: 'cn-xzlz-peach-01',
    query: '林芝看桃花稍微高端点的民宿',
    expectedEntityId: 'CN-XZLZ',
    expectedLabels: ['林芝', '西藏', 'Nyingchi'],
    scene: 'hotel',
    tags: ['tibet', 'nyingchi', 'peach'],
    tier: 'core',
  },
  {
    id: 'cn-xz-roadtrip-01',
    query: '西藏自驾林芝桃花节',
    expectedEntityId: 'CN-XZLZ',
    expectedLabels: ['林芝', '西藏', 'Nyingchi'],
    tags: ['tibet', 'roadtrip'],
    tier: 'core',
  },
  {
    id: 'cn-xz-linzhi-cn-01',
    query: '林芝鲁朗林海摄影点',
    expectedEntityId: 'CN-XZLZ',
    expectedLabels: ['林芝', '西藏'],
    scene: 'poi',
    tags: ['tibet', 'photography'],
    tier: 'core',
  },

  // —— 经典别名 / 对抗 ——
  {
    id: 'us-nyc-alias-01',
    query: '大苹果 海景酒店',
    expectedEntityId: 'US-NYC',
    expectedLabels: ['纽约'],
    scene: 'hotel',
    tags: ['alias', 'nyc'],
    tier: 'core',
  },
  {
    id: 'us-nyc-nyc-01',
    query: 'NYC central area hotel',
    expectedEntityId: 'US-NYC',
    expectedLabels: ['纽约'],
    scene: 'hotel',
    tags: ['alias', 'nyc', 'english'],
    tier: 'core',
  },
  {
    id: 'us-nyc-statue-adversarial-01',
    query: 'LA free statue',
    expectedEntityId: 'US-NYC',
    expectedLabels: ['纽约', '自由女神像', 'New York'],
    scene: 'poi',
    tags: ['adversarial', 'la-noise', 'statue'],
    tier: 'adversarial',
  },
  {
    id: 'us-la-disney-01',
    query: 'LA 迪士尼 高档酒店',
    expectedEntityId: 'US-LAX',
    expectedLabels: ['洛杉矶', '迪士尼乐园'],
    scene: 'hotel',
    tags: ['alias', 'la'],
    tier: 'core',
  },

  // —— 日韩东南亚 ——
  {
    id: 'jp-tokyo-01',
    query: '东京新宿拉面附近住宿',
    expectedEntityId: 'JP-TYO',
    expectedLabels: ['东京', '新宿'],
    scene: 'hotel',
    tags: ['japan'],
    tier: 'core',
  },
  {
    id: 'jp-hokkaido-01',
    query: '北海道滑雪度假村',
    expectedEntityId: 'JP-HKD',
    expectedLabels: ['北海道'],
    tags: ['japan', 'ski'],
    tier: 'core',
  },
  {
    id: 'kr-seoul-01',
    query: '首尔明洞购物酒店',
    expectedEntityId: 'KR-SEL',
    expectedLabels: ['首尔'],
    scene: 'hotel',
    tags: ['korea'],
    tier: 'core',
  },
  {
    id: 'th-chiangmai-01',
    query: '清迈古城慢节奏民宿',
    expectedEntityId: 'TH-CNX',
    expectedLabels: ['清迈'],
    scene: 'hotel',
    tags: ['thailand'],
    tier: 'core',
  },

  // —— 欧洲 ——
  {
    id: 'eu-paris-01',
    query: '巴黎埃菲尔铁塔附近浪漫酒店',
    expectedEntityId: 'FR-PAR',
    expectedLabels: ['巴黎', '埃菲尔铁塔'],
    scene: 'hotel',
    tags: ['europe', 'romantic'],
    tier: 'core',
  },
  {
    id: 'eu-reykjavik-alias-01',
    query: '冰岛首都住一晚',
    expectedEntityId: 'IS-REK',
    expectedLabels: ['雷克雅未克', '冰岛'],
    scene: 'hotel',
    tags: ['iceland'],
    tier: 'core',
  },

  // —— 国内经典 ——
  {
    id: 'cn-sanya-01',
    query: '三亚海景亲子酒店',
    expectedEntityId: 'CN-SYX',
    expectedLabels: ['三亚'],
    scene: 'hotel',
    tags: ['china', 'beach'],
    tier: 'core',
  },
  {
    id: 'cn-shanghai-01',
    query: '魔都迪士尼周边住宿',
    expectedEntityId: 'CN-SHA',
    expectedLabels: ['上海', '迪士尼乐园', '上海迪士尼乐园'],
    scene: 'hotel',
    tags: ['alias', 'shanghai'],
    tier: 'core',
  },
  {
    id: 'cn-beijing-01',
    query: '帝都周末故宫附近酒店',
    expectedEntityId: 'CN-BJS',
    expectedLabels: ['北京'],
    scene: 'hotel',
    tags: ['alias', 'beijing'],
    tier: 'core',
  },

  // —— 尼泊尔 / 瑞士 stretch ——
  {
    id: 'np-pokhara-01',
    query: '博卡拉费瓦湖徒步客栈',
    expectedEntityId: 'NP-PKR',
    expectedLabels: ['博卡拉', '尼泊尔'],
    tags: ['nepal', 'trek'],
    tier: 'stretch',
  },
  {
    id: 'ch-interlaken-01',
    query: '瑞士因特拉肯少女峰区域酒店',
    expectedEntityId: 'CH-ZRH',
    expectedLabels: ['因特拉肯', '瑞士'],
    scene: 'hotel',
    tags: ['switzerland'],
    tier: 'stretch',
  },

  // —— RAG 场景 ——
  {
    id: 'rag-iceland-froad-01',
    query: '冰岛F路开放时间 高地',
    expectedEntityId: 'IS',
    expectedLabels: ['冰岛'],
    scene: 'rag',
    tags: ['iceland', 'f-road', 'rag'],
    tier: 'core',
  },
  {
    id: 'rag-svalbard-safety-01',
    query: '斯瓦尔巴防熊装备规定',
    expectedEntityId: 'SJ-LYR',
    expectedLabels: ['斯瓦尔巴', '朗伊尔城', 'Svalbard'],
    scene: 'rag',
    tags: ['svalbard', 'safety', 'rag'],
    tier: 'core',
  },
];

export const GOLDEN_SET_BASELINE_THRESHOLDS = {
  coreMinAccuracy: 0.9,
  overallMinAccuracy: 0.82,
  adversarialMinAccuracy: 0.4,
} as const;
