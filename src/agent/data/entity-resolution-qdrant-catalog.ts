/**
 * Entity Resolution Qdrant 种子目录 — Week 3.1。
 *
 * 将 KG 标准名映射到运营 entity_id（与 Golden Set expectedEntityId 对齐），
 * 供 scripts/seed-entity-resolution-qdrant.ts 全量 upsert。
 */

import {
  KNOWLEDGE_GRAPH_DESTINATIONS,
  KNOWLEDGE_GRAPH_POIS,
} from './query-rewriting-knowledge-graph';

export type ErQdrantEntityKind = 'destination' | 'poi';

export interface ErQdrantCatalogEntry {
  standard_name: string;
  kind: ErQdrantEntityKind;
  entity_id: string;
  parent_destination?: string;
}

/** 标准名 → entity_id（Golden Set + 运营对账） */
const ENTITY_ID_BY_LABEL: Readonly<Record<string, string>> = {
  冰岛: 'IS',
  维克: 'IS',
  阿克雷里: 'IS',
  雷克雅未克: 'IS-REK',
  西峡湾: 'IS-ISF',
  Westfjords: 'IS-ISF',
  伊萨菲厄泽: 'IS-ISF',
  斯瓦尔巴: 'SJ-LYR',
  朗伊尔城: 'SJ-LYR',
  Svalbard: 'SJ-LYR',
  Longyearbyen: 'SJ-LYR',
  西藏: 'CN-XZLZ',
  林芝: 'CN-XZLZ',
  Nyingchi: 'CN-XZLZ',
  北京: 'CN-BJS',
  上海: 'CN-SHA',
  三亚: 'CN-SYX',
  广州: 'CN-GZ',
  深圳: 'CN-SZX',
  杭州: 'CN-HGH',
  成都: 'CN-CTU',
  重庆: 'CN-CKG',
  西安: 'CN-SIA',
  南京: 'CN-NKG',
  苏州: 'CN-SZV',
  厦门: 'CN-XMN',
  青岛: 'CN-TAO',
  大连: 'CN-DLC',
  香港: 'CN-HKG',
  澳门: 'CN-MFM',
  台北: 'TW-TPE',
  东京: 'JP-TYO',
  大阪: 'JP-OSA',
  京都: 'JP-KYO',
  北海道: 'JP-HKD',
  镰仓: 'JP-KAM',
  名古屋: 'JP-NGO',
  福冈: 'JP-FUK',
  新宿: 'JP-TYO',
  首尔: 'KR-SEL',
  釜山: 'KR-PUS',
  济州岛: 'KR-CJU',
  曼谷: 'TH-BKK',
  清迈: 'TH-CNX',
  普吉岛: 'TH-HKT',
  新加坡: 'SG-SIN',
  吉隆坡: 'MY-KUL',
  巴厘岛: 'ID-DPS',
  纽约: 'US-NYC',
  洛杉矶: 'US-LAX',
  旧金山: 'US-SFO',
  拉斯维加斯: 'US-LAS',
  西雅图: 'US-SEA',
  芝加哥: 'US-CHI',
  伦敦: 'GB-LON',
  巴黎: 'FR-PAR',
  罗马: 'IT-ROM',
  米兰: 'IT-MIL',
  巴塞罗那: 'ES-BCN',
  马德里: 'ES-MAD',
  阿姆斯特丹: 'NL-AMS',
  柏林: 'DE-BER',
  苏黎世: 'CH-ZRH',
  日内瓦: 'CH-GVA',
  因特拉肯: 'CH-ZRH',
  瑞士: 'CH-ZRH',
  加德满都: 'NP-KTM',
  博卡拉: 'NP-PKR',
  尼泊尔: 'NP-PKR',
  香格里拉: 'CN-DIG',
  迪士尼乐园: 'CN-SHA',
  上海迪士尼乐园: 'CN-SHA',
  东京迪士尼乐园: 'JP-TYO',
  自由女神像: 'US-NYC',
  香格里拉红军长征博物馆: 'CN-DIG',
  长隆水上乐园: 'CN-GZ',
  富士山: 'JP-TYO',
  埃菲尔铁塔: 'FR-PAR',
};

/** entity_id → 父级目的地（POI / 子区域） */
const PARENT_DESTINATION_BY_ENTITY_ID: Readonly<Record<string, string>> = {
  'IS-REK': '冰岛',
  'IS-ISF': '冰岛',
  'SJ-LYR': '斯瓦尔巴',
  'CN-XZLZ': '西藏',
  'JP-TYO': '东京',
  'JP-OSA': '大阪',
  'JP-KYO': '京都',
  'JP-HKD': '北海道',
  'JP-KAM': '镰仓',
  'JP-NGO': '名古屋',
  'JP-FUK': '福冈',
  'KR-PUS': '釜山',
  'KR-CJU': '济州岛',
  'TH-HKT': '普吉岛',
  'US-NYC': '纽约',
  'US-LAX': '洛杉矶',
  'US-SFO': '旧金山',
  'US-LAS': '拉斯维加斯',
  'US-SEA': '西雅图',
  'US-CHI': '芝加哥',
  'FR-PAR': '巴黎',
  'IT-ROM': '罗马',
  'IT-MIL': '米兰',
  'ES-BCN': '巴塞罗那',
  'ES-MAD': '马德里',
  'NL-AMS': '阿姆斯特丹',
  'DE-BER': '柏林',
  'CH-GVA': '日内瓦',
  'NP-PKR': '尼泊尔',
  'NP-KTM': '尼泊尔',
  'CN-SHA': '上海',
  'CN-GZ': '广州',
};

function slugEntityId(label: string, kind: ErQdrantEntityKind): string {
  const prefix = kind === 'poi' ? 'POI' : 'DEST';
  const slug = label
    .replace(/[^\w\u4e00-\u9fff]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
  return `${prefix}-${slug || 'unknown'}`;
}

function resolveEntityId(label: string, kind: ErQdrantEntityKind): string {
  return ENTITY_ID_BY_LABEL[label] ?? slugEntityId(label, kind);
}

function resolveParentDestination(
  entityId: string,
  label: string,
  kind: ErQdrantEntityKind,
): string | undefined {
  if (kind === 'destination') {
    const countryParents: Record<string, string> = {
      IS: '冰岛',
      'IS-REK': '冰岛',
      'IS-ISF': '冰岛',
      'SJ-LYR': '斯瓦尔巴',
      'CN-XZLZ': '西藏',
      'NP-PKR': '尼泊尔',
      'CH-ZRH': '瑞士',
    };
    return countryParents[entityId];
  }
  return PARENT_DESTINATION_BY_ENTITY_ID[entityId];
}

/**
 * Golden Set expectedLabels 中 KG 未覆盖的补全项（与 entity-resolution-golden-set 对账）。
 * 避免 src → test 交叉引用导致 build 失败。
 */
const GOLDEN_SET_LABEL_SUPPLEMENTS: ReadonlyArray<{
  standard_name: string;
  kind: ErQdrantEntityKind;
  entity_id: string;
}> = [{ standard_name: 'New York', kind: 'destination', entity_id: 'US-NYC' }];

/** 构建全量 Qdrant upsert 目录（KG + Golden Set 补全，去重按 standard_name） */
export function buildErQdrantCatalog(): ErQdrantCatalogEntry[] {
  const byName = new Map<string, ErQdrantCatalogEntry>();

  for (const label of KNOWLEDGE_GRAPH_DESTINATIONS) {
    const entityId = resolveEntityId(label, 'destination');
    byName.set(label, {
      standard_name: label,
      kind: 'destination',
      entity_id: entityId,
      parent_destination: resolveParentDestination(entityId, label, 'destination'),
    });
  }

  for (const label of KNOWLEDGE_GRAPH_POIS) {
    const entityId = resolveEntityId(label, 'poi');
    byName.set(label, {
      standard_name: label,
      kind: 'poi',
      entity_id: entityId,
      parent_destination: resolveParentDestination(entityId, label, 'poi'),
    });
  }

  for (const sup of GOLDEN_SET_LABEL_SUPPLEMENTS) {
    if (!byName.has(sup.standard_name)) {
      byName.set(sup.standard_name, {
        standard_name: sup.standard_name,
        kind: sup.kind,
        entity_id: sup.entity_id,
        parent_destination: resolveParentDestination(
          sup.entity_id,
          sup.standard_name,
          sup.kind,
        ),
      });
    }
  }

  return [...byName.values()].sort((a, b) =>
    a.standard_name.localeCompare(b.standard_name, 'zh-CN'),
  );
}

/** 确定性 Qdrant point id（entity_id + standard_name） */
export function stableErPointId(entityId: string, standardName: string): number {
  const s = `${entityId}:${standardName}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
