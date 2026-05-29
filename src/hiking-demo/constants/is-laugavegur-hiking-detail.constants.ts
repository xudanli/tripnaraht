import type { HikingDetailRiskMatrixRow } from '../../route-directions/types/hiking-trail-detail.types';
import type { HikingDetailOverrideV1 } from '../../route-directions/types/hiking-detail-override.types';

/** 风险与约束 Tab — 表格行（代码种子 + Admin override 默认） */
export const LAUGAVEGUR_RISK_MATRIX_ROWS: HikingDetailRiskMatrixRow[] = [
  {
    id: 'season',
    labelCN: '季节窗口',
    value: '7–8 月',
    level: 'high',
    notes: '非窗口期高地封路或极端危险，禁止进入',
  },
  {
    id: 'wind',
    labelCN: '暴露路段风速',
    value: '>12 m/s 禁行',
    level: 'high',
    notes: '彩色流纹岩山脊与 Hrafntinnusker 段尤甚',
  },
  {
    id: 'river',
    labelCN: '融水河流',
    value: '午后暴涨',
    level: 'high',
    notes: 'Emstrur 等河段宜早晨低水位窗口过河',
  },
  {
    id: 'signal',
    labelCN: '通讯覆盖',
    value: '无手机信号',
    level: 'high',
    notes: '需卫星通讯或结伴，离线地图必备',
  },
  {
    id: 'hut',
    labelCN: '山屋容量',
    value: '须提前预订',
    level: 'medium',
    notes: 'FÍ 山屋夏季紧俏，无预订需完整露营装备',
  },
  {
    id: 'road',
    labelCN: '高地公路',
    value: 'F208 夏季开放',
    level: 'medium',
    notes: '接驳巴士与 4x4 自驾均受路况影响',
  },
];

/**
 * IS_LAUGAVEGUR 满配 metadata.hikingDetailOverride（种子 / Admin PUT 基线）
 * 与 HikingTrailDetailService.buildLaugavegurDetail 合并；override 字段优先。
 */
export const IS_LAUGAVEGUR_HIKING_DETAIL_OVERRIDE: HikingDetailOverrideV1 = {
  source: 'seed:is-laugavegur-v1',
  riskMatrix: LAUGAVEGUR_RISK_MATRIX_ROWS,
  emergency: {
    rescuePhone: '112',
    registrationPointZh: 'Landmannalaugar 访客中心 / FÍ 山屋登记',
    rangerContact: '冰岛搜救 112 · safe.is',
    notes: '高地无常规手机信号；建议携带 InReach 或结伴',
  },
  access: {
    byBus: '雷克雅未克 — Landmannalaugar 夏季巴士（班次有限，提前购票）',
    byShuttle: 'Þórsmörk — Seljalandsfoss / 雷市 4x4 接驳（旺季需预订）',
    byCar: 'Landmannalaugar 高地停车场（F208，建议 4x4）',
    notes: '仅 7–8 月高地巴士与 F 路开放窗口',
  },
  timeWindow: {
    suggestedDepartTime: '07:00',
    lastReturnBus: '17:30',
    sunsetBufferMin: 90,
    daylightHoursNoteZh: '夏季日照长，但仍需预留过河与避风时间；避免午后融水河过河',
  },
  permits: [
    {
      id: 'fi-hut',
      nameCN: 'FÍ 山屋预订',
      name: 'FÍ hut booking',
      titleZh: 'FÍ 山屋预订',
      required: true,
      bookingUrl: 'https://www.fi.is',
      noteZh: '夏季山屋紧俏，建议提前数周预订',
    },
    {
      id: 'safe-is-register',
      nameCN: 'safe.is 行程登记',
      name: 'safe.is trip registration',
      titleZh: 'safe.is 行程登记',
      required: true,
      noteZh: '出发前在 safe.is 登记行程与紧急联系人',
    },
    {
      id: 'highland-bus',
      nameCN: '高地巴士/接驳预订',
      name: 'Highland bus transfer',
      titleZh: '高地巴士/接驳预订',
      required: false,
      noteZh: 'Landmannalaugar / Þórsmörk 夏季班次有限',
    },
  ],
  checklistTemplates: [
    {
      id: 'gear-core',
      category: 'gear',
      titleZh: '核心装备',
      items: [
        { id: 'boots', labelZh: '防水徒步靴', required: true },
        { id: 'rain', labelZh: '硬壳雨衣裤', required: true },
        { id: 'warm', labelZh: '保暖层与手套', required: true },
        { id: 'gps', labelZh: '离线地图 / GPS', required: true },
      ],
    },
    {
      id: 'safety-highland',
      category: 'safety',
      titleZh: '高地安全',
      items: [
        { id: 'river', labelZh: '过河鞋 / 绳索（视河段）', required: false },
        { id: 'comm', labelZh: '卫星通讯或结伴', required: true },
        { id: 'register', labelZh: 'safe.is 行程登记', required: true },
      ],
    },
    {
      id: 'logistics-fi',
      category: 'logistics',
      titleZh: '冰岛后勤',
      items: [
        { id: 'hut-book', labelZh: 'FÍ 山屋预订确认', required: true },
        { id: 'bus', labelZh: '高地巴士票', required: false },
      ],
    },
  ],
  supplyPois: [
    { id: 'hut-landmannalaugar' },
    { id: 'hut-nyidalur' },
    { id: 'hut-thorsmork' },
    { id: 'froad-landmannalaugar' },
    { id: 'froad-thorsmork' },
  ],
  shelters: [
    { id: 'hut-landmannalaugar', bookingRequired: true },
    { id: 'hut-nyidalur', bookingRequired: true },
    { id: 'hut-thorsmork', bookingRequired: true },
  ],
};
