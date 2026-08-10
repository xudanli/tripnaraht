/** 发布表单 — 目的地大区 / 细分范围（与前端下拉选项 id 对齐） */

export interface DestinationSubScopeDefinition {
  id: string;
  label: string;
  patterns: RegExp[];
  /** 写入 POST destination 的展示文案 */
  destinationLabel: string;
}

export interface DestinationRegionDefinition {
  id: string;
  label: string;
  patterns: RegExp[];
  subScopes: DestinationSubScopeDefinition[];
}

export const DESTINATION_TAXONOMY: DestinationRegionDefinition[] = [
  {
    id: 'domestic_northwest',
    label: '国内 · 西北',
    patterns: [/西北/, /青甘/, /河西/, /敦煌/, /张掖/, /嘉峪关/],
    subScopes: [
      {
        id: 'qinggan_great_loop',
        label: '青甘大环',
        patterns: [/青甘大环/, /青甘环线/, /青甘线/, /西北环线/, /西北大环线/, /河西走廊/],
        destinationLabel: '西北·青甘大环',
      },
      {
        id: 'duku_highway',
        label: '独库公路',
        patterns: [/独库公路/, /独库线/, /(?<![\d])独库(?![\dA-Za-z])/],
        destinationLabel: '新疆·独库公路',
      },
      {
        id: 'g211_yinrong',
        label: 'G211银榕',
        patterns: [/G\s*211|国道\s*211|211\s*国道|银榕线|银西线/],
        destinationLabel: '西北·G211银榕线',
      },
      {
        id: 'xinjiang',
        label: '新疆',
        patterns: [/新疆/, /北疆/, /南疆/, /伊犁/, /喀纳斯/, /赛里木湖|塞里木湖/, /乌孙古道/],
        destinationLabel: '新疆',
      },
      {
        id: 'ningxia_inner_mongolia',
        label: '宁蒙',
        patterns: [/宁夏/, /内蒙.*西/, /阿拉善/],
        destinationLabel: '西北·宁蒙',
      },
    ],
  },
  {
    id: 'domestic_southwest',
    label: '国内 · 西南',
    patterns: [/西南/, /云贵川/, /西藏/, /川藏/, /滇藏/],
    subScopes: [
      {
        id: 'g318_chuan_zang',
        label: 'G318川藏',
        patterns: [/G\s*318|国道318|318川藏|川藏南线|(?<![\d])318(?![\d]).{0,6}川藏|川藏线/],
        destinationLabel: '西南·G318川藏南线',
      },
      {
        id: 'g317_chuan_zang_north',
        label: 'G317川藏北',
        patterns: [/G\s*317|国道317|317川藏|川藏北线/],
        destinationLabel: '西南·G317川藏北线',
      },
      {
        id: 'g219_xin_zang',
        label: 'G219新藏',
        patterns: [/G\s*219|国道219|219新藏|新藏线/],
        destinationLabel: '西南·G219新藏线',
      },
      {
        id: 'dianzang_route',
        label: '滇藏线',
        patterns: [/滇藏线|滇藏公路|云南进藏/],
        destinationLabel: '西南·滇藏线',
      },
      {
        id: 'dali_nomad',
        label: '大理游民',
        patterns: [/游民社区|数字游民|变蕉/],
        destinationLabel: '西南·大理游民',
      },
      {
        id: 'dali_lijiang',
        label: '大理丽江',
        patterns: [/大理/, /丽江/, /泸沽湖/],
        destinationLabel: '西南·大理丽江',
      },
      {
        id: 'chuanxi',
        label: '川西',
        patterns: [/川西/, /稻城/, /亚丁/, /四姑娘山/, /长坪沟/, /毕棚沟/, /贡嘎/],
        destinationLabel: '川西',
      },
      {
        id: 'yubeng',
        label: '雨崩',
        patterns: [/雨崩/, /天堂湖/],
        destinationLabel: '西南·雨崩',
      },
      {
        id: 'xizang',
        label: '西藏',
        patterns: [/西藏/, /拉萨/, /林芝/],
        destinationLabel: '西藏',
      },
    ],
  },
  {
    id: 'domestic_east_south',
    label: '国内 · 华东华南',
    patterns: [/华东/, /华南/, /海南/, /福建/, /广东/],
    subScopes: [
      {
        id: 'hainan',
        label: '海南',
        patterns: [/海南/, /三亚/],
        destinationLabel: '海南',
      },
      {
        id: 'hangzhou_trails',
        label: '杭州周边',
        patterns: [/杭州周边/, /浙西三尖/, /法喜寺/, /十里琅珰/],
        destinationLabel: '华东·杭州周边',
      },
    ],
  },
  {
    id: 'overseas_oceania',
    label: '海外 · 大洋洲',
    patterns: [/新西兰/, /澳大利亚/, /大洋洲/],
    subScopes: [
      {
        id: 'new_zealand',
        label: '新西兰',
        patterns: [
          /新西兰/,
          /新西兰南岛|南岛.*新西兰/,
          /皇后镇/,
          /南阿尔卑斯/,
          /高空跳伞/,
          /Milford|米尔福德/,
        ],
        destinationLabel: '新西兰',
      },
    ],
  },
  {
    id: 'overseas_europe',
    label: '海外 · 欧洲',
    patterns: [/冰岛/, /欧洲/, /挪威/, /瑞士/],
    subScopes: [
      {
        id: 'iceland',
        label: '冰岛',
        patterns: [/冰岛/, /环岛/],
        destinationLabel: '冰岛',
      },
    ],
  },
];

export interface DestinationTaxonomyMatch {
  destinationRegionId: string;
  destinationRegionLabel: string;
  destinationSubScopeId: string | null;
  destinationSubScopeLabel: string | null;
  destination: string;
}

export function inferDestinationTaxonomy(text: string): DestinationTaxonomyMatch | null {
  const normalized = text.trim();
  if (!normalized) return null;

  for (const region of DESTINATION_TAXONOMY) {
    for (const subScope of region.subScopes) {
      if (subScope.patterns.some((p) => p.test(normalized))) {
        return {
          destinationRegionId: region.id,
          destinationRegionLabel: region.label,
          destinationSubScopeId: subScope.id,
          destinationSubScopeLabel: subScope.label,
          destination: subScope.destinationLabel,
        };
      }
    }
  }

  for (const region of DESTINATION_TAXONOMY) {
    if (region.patterns.some((p) => p.test(normalized))) {
      const fallbackSub = region.subScopes[0];
      return {
        destinationRegionId: region.id,
        destinationRegionLabel: region.label,
        destinationSubScopeId: fallbackSub?.id ?? null,
        destinationSubScopeLabel: fallbackSub?.label ?? null,
        destination: fallbackSub?.destinationLabel ?? region.label.replace(/\s·\s/, '·'),
      };
    }
  }

  return null;
}

export function listDestinationRegionOptions(): Array<{
  id: string;
  label: string;
  subScopes: Array<{ id: string; label: string; destinationLabel: string }>;
}> {
  return DESTINATION_TAXONOMY.map((region) => ({
    id: region.id,
    label: region.label,
    subScopes: region.subScopes.map((sub) => ({
      id: sub.id,
      label: sub.label,
      destinationLabel: sub.destinationLabel,
    })),
  }));
}
