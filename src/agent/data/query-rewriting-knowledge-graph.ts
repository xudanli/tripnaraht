/**
 * Tripnara Query Rewriting 知识图谱词表（静态层，可替换为 Redis / DB）。
 * 别名归一化、目的地/POI 约束池、Prompt 注入均从此读取。
 */

export type KnowledgeGraphEntityKind = 'destination' | 'poi' | 'alias';

export interface KnowledgeGraphAlias {
  alias: string;
  standard: string;
  kind: 'destination' | 'poi';
}

export const KNOWLEDGE_GRAPH_DESTINATIONS: readonly string[] = [
  '北京', '上海', '广州', '深圳', '杭州', '成都', '重庆', '西安', '南京', '苏州',
  '三亚', '厦门', '青岛', '大连', '香港', '澳门', '台北',
  '东京', '大阪', '京都', '北海道', '镰仓', '名古屋', '福冈', '新宿',
  '首尔', '釜山', '济州岛',
  '曼谷', '清迈', '普吉岛', '新加坡', '吉隆坡', '巴厘岛',
  '纽约', '洛杉矶', '旧金山', '拉斯维加斯', '西雅图', '芝加哥',
  '伦敦', '巴黎', '罗马', '米兰', '巴塞罗那', '马德里', '阿姆斯特丹', '柏林',
  '雷克雅未克', '维克', '阿克雷里', '冰岛', '西峡湾', 'Westfjords', '伊萨菲厄泽',
  '斯瓦尔巴', '朗伊尔城', 'Svalbard', 'Longyearbyen',
  '西藏', '林芝', 'Nyingchi',
  '苏黎世', '日内瓦', '因特拉肯', '瑞士',
  '加德满都', '博卡拉', '尼泊尔',
  '香格里拉',
];

export const KNOWLEDGE_GRAPH_POIS: readonly string[] = [
  '迪士尼乐园', '上海迪士尼乐园', '东京迪士尼乐园', '自由女神像',
  '香格里拉红军长征博物馆', '长隆水上乐园', '富士山', '埃菲尔铁塔',
];

/** 别名 → 标准实体（替代散落 POI_ALIAS_MAP） */
export const KNOWLEDGE_GRAPH_ALIASES: readonly KnowledgeGraphAlias[] = [
  { alias: '大苹果', standard: '纽约', kind: 'destination' },
  { alias: 'LA', standard: '洛杉矶', kind: 'destination' },
  { alias: 'la', standard: '洛杉矶', kind: 'destination' },
  { alias: 'NYC', standard: '纽约', kind: 'destination' },
  { alias: 'nyc', standard: '纽约', kind: 'destination' },
  { alias: '大坂', standard: '大阪', kind: 'destination' },
  { alias: '大阪府', standard: '大阪', kind: 'destination' },
  { alias: '魔都', standard: '上海', kind: 'destination' },
  { alias: '帝都', standard: '北京', kind: 'destination' },
  { alias: '自由女神', standard: '自由女神像', kind: 'poi' },
  { alias: '西峡湾', standard: '西峡湾', kind: 'destination' },
  { alias: '北极熊', standard: '斯瓦尔巴', kind: 'destination' },
  { alias: 'longyearbyen', standard: '朗伊尔城', kind: 'destination' },
  { alias: 'Longyearbyen', standard: '朗伊尔城', kind: 'destination' },
  { alias: '桃花节', standard: '林芝', kind: 'destination' },
];

export const KNOWLEDGE_GRAPH_SPELL_CORRECTIONS: Readonly<Record<string, string>> = {
  记念碑: '纪念碑',
  记念馆: '纪念馆',
};
