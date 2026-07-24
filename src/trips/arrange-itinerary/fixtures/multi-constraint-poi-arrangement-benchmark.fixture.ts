/**
 * Multi-Constraint POI Arrangement Benchmark v1
 *
 * 冰岛南岸多人旅行 — POI 顺序 / 插入 / 删除 / 替换 / 成员分流 决策传播基线。
 * 天气、道路、营业时间均为测试假数据，不可用于真实旅行。
 *
 * 本地写入：`npm run seed:multi-constraint-poi-benchmark`
 */
import { ICELAND_B_TIER_POI_SLUGS } from '../../../poi-access-capacity/fixtures/is-b-tier.rules';
import { ICELAND_C_TIER_POI_SLUGS } from '../../../poi-access-capacity/fixtures/is-c-tier.crowding-profiles';
import type { StoredUnifiedConstraint } from '../../trip-constraint-solver/types/trip-constraint.types';

export const MCPOI_BENCHMARK_TRIP_ID = 'TRIP-ICELAND-MULTI-001';
export const MCPOI_BENCHMARK_SCENARIO_ID = 'a1b2c3d4-e5f6-4789-a012-bc0a1b2c3d4e';
export const MCPOI_BENCHMARK_VERSION = 'multi-constraint-poi-arrangement-benchmark-v1';
export const MCPOI_BENCHMARK_DEFAULT_OWNER_USER_ID = '5872f534-4fdf-483d-9e5a-464d3f36935d';

export const MCPOI_BENCHMARK_DATE_RANGE = {
  startDate: '2026-10-04',
  endDate: '2026-10-10',
} as const;

export const MCPOI_BENCHMARK_TRIP_DAYS = [
  { id: 'mcpoi-day-001', dayIndex: 0, label: 'D1', date: '2026-10-04' },
  { id: 'mcpoi-day-002', dayIndex: 1, label: 'D2', date: '2026-10-05' },
  { id: 'mcpoi-day-003', dayIndex: 2, label: 'D3', date: '2026-10-06' },
  { id: 'mcpoi-day-004', dayIndex: 3, label: 'D4', date: '2026-10-07' },
  { id: 'mcpoi-day-005', dayIndex: 4, label: 'D5', date: '2026-10-08' },
  { id: 'mcpoi-day-006', dayIndex: 5, label: 'D6', date: '2026-10-09' },
  { id: 'mcpoi-day-007', dayIndex: 6, label: 'D7', date: '2026-10-10' },
] as const;

export type McpoiMemberId = 'M1' | 'M2' | 'M3' | 'M4' | 'M5';

export interface McpoiMemberProfile {
  memberId: McpoiMemberId;
  displayName: string;
  age: number;
  role: 'DRIVER' | 'ADULT' | 'ELDER' | 'CHILD';
  traits: string;
  keyNeeds: string[];
}

export const MCPOI_BENCHMARK_MEMBERS: McpoiMemberProfile[] = [
  {
    memberId: 'M1',
    displayName: '主驾驶',
    age: 35,
    role: 'DRIVER',
    traits: '主驾驶，单车自驾唯一驾驶员',
    keyNeeds: ['每日驾驶不超过 4.5 小时', '不接受夜间驾驶'],
  },
  {
    memberId: 'M2',
    displayName: '年轻成员',
    age: 30,
    role: 'ADULT',
    traits: '体力充沛，核心体验诉求强',
    keyNeeds: ['必须体验冰川徒步'],
  },
  {
    memberId: 'M3',
    displayName: '摄影成员',
    age: 28,
    role: 'ADULT',
    traits: '黄金时段摄影偏好',
    keyNeeds: ['希望日落时到达 Dyrhólaey 或冰河湖'],
  },
  {
    memberId: 'M4',
    displayName: '老人',
    age: 67,
    role: 'ELDER',
    traits: '低步行负荷',
    keyNeeds: ['每日步行不超过 5 公里', '连续步行不超过 60 分钟'],
  },
  {
    memberId: 'M5',
    displayName: '儿童',
    age: 8,
    role: 'CHILD',
    traits: '需规律休息与午餐',
    keyNeeds: ['不能参加 10 岁以上活动', '12:30 前后需要午餐', '每 2 小时休息'],
  },
];

export interface McpoiPoiCatalogEntry {
  poiId: string;
  name: string;
  durationMinutes: number;
  walkKm: number;
  weatherSensitivity: 'low' | 'medium' | 'high';
  memberNotes: string;
  specialValue: string;
  minAge?: number;
  indoor?: boolean;
}

export const MCPOI_BENCHMARK_POI_CATALOG: Record<string, McpoiPoiCatalogEntry> = {
  'POI-SELJALANDSFOSS': {
    poiId: 'POI-SELJALANDSFOSS',
    name: 'Seljalandsfoss',
    durationMinutes: 60,
    walkKm: 1.2,
    weatherSensitivity: 'medium',
    memberNotes: '老人需注意湿滑',
    specialValue: '经典瀑布',
  },
  'POI-SKOGAFOSS': {
    poiId: 'POI-SKOGAFOSS',
    name: 'Skógafoss',
    durationMinutes: 75,
    walkKm: 1.8,
    weatherSensitivity: 'medium',
    memberNotes: '登顶阶梯不适合老人',
    specialValue: '年轻成员偏好',
  },
  'POI-DYRHOLAEY': {
    poiId: 'POI-DYRHOLAEY',
    name: 'Dyrhólaey',
    durationMinutes: 60,
    walkKm: 1.0,
    weatherSensitivity: 'high',
    memberNotes: '大风时禁止',
    specialValue: '日落摄影',
  },
  'POI-REYNISFJARA': {
    poiId: 'POI-REYNISFJARA',
    name: 'Reynisfjara',
    durationMinutes: 60,
    walkKm: 1.2,
    weatherSensitivity: 'high',
    memberNotes: '儿童需要严格看护',
    specialValue: '黑沙滩',
  },
  'POI-LAVA-SHOW': {
    poiId: 'POI-LAVA-SHOW',
    name: 'Lava Show',
    durationMinutes: 60,
    walkKm: 0.2,
    weatherSensitivity: 'low',
    memberNotes: '全员适合',
    specialValue: '室内恢复点',
    indoor: true,
  },
  'POI-FJADRARGLJUFUR': {
    poiId: 'POI-FJADRARGLJUFUR',
    name: 'Fjaðrárgljúfur',
    durationMinutes: 75,
    walkKm: 2.5,
    weatherSensitivity: 'medium',
    memberNotes: '老人负担较大',
    specialValue: '景观价值高',
  },
  'POI-GLACIER-HIKE': {
    poiId: 'POI-GLACIER-HIKE',
    name: 'Glacier Hike',
    durationMinutes: 180,
    walkKm: 4.0,
    weatherSensitivity: 'high',
    memberNotes: '最低年龄 10 岁',
    specialValue: '核心体验',
    minAge: 10,
  },
  'POI-VISITOR-CENTER': {
    poiId: 'POI-VISITOR-CENTER',
    name: 'Visitor Center',
    durationMinutes: 120,
    walkKm: 0.3,
    weatherSensitivity: 'low',
    memberNotes: '全员适合',
    specialValue: '分流承接',
    indoor: true,
  },
  'POI-JOKULSARLON': {
    poiId: 'POI-JOKULSARLON',
    name: 'Jökulsárlón',
    durationMinutes: 75,
    walkKm: 1.0,
    weatherSensitivity: 'medium',
    memberNotes: '全员适合',
    specialValue: '摄影核心点',
  },
  'POI-DIAMOND-BEACH': {
    poiId: 'POI-DIAMOND-BEACH',
    name: 'Diamond Beach',
    durationMinutes: 45,
    walkKm: 1.2,
    weatherSensitivity: 'medium',
    memberNotes: '全员适合',
    specialValue: '与冰河湖组合',
  },
};

/** Canonical slug 映射（POI Access / 规划检索） */
export const MCPOI_BENCHMARK_POI_SLUGS: Record<string, string> = {
  'POI-SELJALANDSFOSS': ICELAND_C_TIER_POI_SLUGS.SELJALANDSFOSS,
  'POI-SKOGAFOSS': ICELAND_C_TIER_POI_SLUGS.SKOGAFOSS,
  'POI-DYRHOLAEY': ICELAND_B_TIER_POI_SLUGS.DYRHOlaEY,
  'POI-REYNISFJARA': ICELAND_B_TIER_POI_SLUGS.REYNISFJARA,
  'POI-FJADRARGLJUFUR': 'is.fjadrargljufur',
  'POI-JOKULSARLON': ICELAND_C_TIER_POI_SLUGS.JOKULSARLON,
  'POI-DIAMOND-BEACH': 'is.diamond_beach',
  'POI-LAVA-SHOW': 'is.lava_show_vik',
  'POI-GLACIER-HIKE': 'is.glacier_hike_skaftafell',
  'POI-VISITOR-CENTER': 'is.skaftafell_visitor_center',
};

export interface McpoiWorldFact {
  id: string;
  date: string;
  area: string;
  type: 'WIND' | 'RAIN' | 'VISIBILITY' | 'ROAD_DELAY';
  value: string;
  effectiveTime: string;
  severity: 'BLOCKER' | 'WARNING' | 'OPPORTUNITY';
}

export const MCPOI_BENCHMARK_WORLD_FACTS: McpoiWorldFact[] = [
  {
    id: 'WF-01',
    date: '2026-10-06',
    area: 'Dyrholaey',
    type: 'WIND',
    value: '18-22m/s',
    effectiveTime: '15:00-19:00',
    severity: 'BLOCKER',
  },
  {
    id: 'WF-02',
    date: '2026-10-07',
    area: 'South Coast',
    type: 'RAIN',
    value: 'heavy',
    effectiveTime: '08:00-11:30',
    severity: 'WARNING',
  },
  {
    id: 'WF-03',
    date: '2026-10-07',
    area: 'Jokulsarlon',
    type: 'VISIBILITY',
    value: 'clear',
    effectiveTime: '15:30-18:00',
    severity: 'OPPORTUNITY',
  },
  {
    id: 'WF-04',
    date: '2026-10-07',
    area: 'Vik-Skaftafell',
    type: 'ROAD_DELAY',
    value: '40 minutes',
    effectiveTime: '15:00-18:00',
    severity: 'WARNING',
  },
];

export interface McpoiScheduledItem {
  itemId: string;
  poiId?: string;
  label: string;
  startTime: string;
  endTime: string;
  type: 'ACTIVITY' | 'MEAL' | 'HOTEL' | 'TRANSIT';
  memberIds?: McpoiMemberId[];
  note?: string;
}

export interface McpoiPlanVariant {
  variantId: 'A' | 'B' | 'C' | 'D';
  title: string;
  dayIndex: number;
  expectedStatus:
    | 'INFEASIBLE'
    | 'FEASIBLE_WITH_TRADEOFF'
    | 'FEASIBLE_WITH_SPLIT'
    | 'FEASIBLE';
  items: McpoiScheduledItem[];
  expectedViolations?: string[];
  expectedRecommendation?: string;
  tradeoffs?: string[];
}

const nowIso = () => new Date().toISOString();
const FIXTURE_USER = 'benchmark-fixture';

function hardConstraint(
  id: string,
  name: string,
  description: string,
  value: unknown,
): StoredUnifiedConstraint {
  return {
    id,
    name,
    description,
    category: 'MEMBER',
    type: 'HARD',
    status: 'ACTIVE',
    scope: { type: 'TRIP' },
    operator: 'LTE',
    value,
    allowRelaxation: false,
    locked: true,
    source: { type: 'USER', sourceId: MCPOI_BENCHMARK_VERSION },
    visibility: 'TEAM',
    createdBy: FIXTURE_USER,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function softConstraint(
  id: string,
  name: string,
  description: string,
  weight: number,
  value: unknown,
): StoredUnifiedConstraint {
  return {
    id,
    name,
    description,
    category: 'MEMBER',
    type: 'SOFT',
    status: 'ACTIVE',
    scope: { type: 'TRIP' },
    operator: 'CUSTOM',
    value,
    priority: Math.round(weight * 100),
    allowRelaxation: true,
    locked: false,
    source: { type: 'USER', sourceId: MCPOI_BENCHMARK_VERSION },
    visibility: 'TEAM',
    createdBy: FIXTURE_USER,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

export function buildMcpoiBenchmarkConstraints(): StoredUnifiedConstraint[] {
  return [
    hardConstraint('H-01', '主驾驶每日驾驶上限', '主驾驶每日驾驶时间 ≤ 4.5 小时', {
      memberId: 'M1',
      maxDriveMinutes: 270,
    }),
    hardConstraint('H-02', '夜间长距离驾驶禁止', '19:00 后不得继续长距离驾驶', {
      memberId: 'M1',
      noLongDriveAfter: '19:00',
    }),
    hardConstraint('H-03', '老人每日步行上限', '老人每日累计步行 ≤ 5 公里', {
      memberId: 'M4',
      maxWalkKm: 5,
    }),
    hardConstraint('H-04', '儿童年龄限制', '儿童不能参加最低年龄 10 岁的冰川徒步', {
      memberId: 'M5',
      minActivityAge: 10,
      blockedPoiIds: ['POI-GLACIER-HIKE'],
    }),
    hardConstraint('H-05', '冰川徒步签到', '冰川徒步预约 D4 10:00，09:30 前必须签到', {
      poiId: 'POI-GLACIER-HIKE',
      checkInBy: '09:30',
      appointmentAt: '10:00',
      dayIndex: 3,
    }),
    hardConstraint('H-06', '酒店最晚到达', '酒店最晚 21:00 到达', { latestHotelArrival: '21:00' }),
    hardConstraint('H-07', '强风悬崖阻断', '风速 ≥18m/s 时高暴露悬崖类 POI 不允许安排', {
      windThresholdMps: 18,
      blockedPoiIds: ['POI-DYRHOLAEY'],
      worldFactId: 'WF-01',
    }),
    hardConstraint('H-08', '成员并行互斥', '同一成员不能同时出现在两个并行活动中', {
      rule: 'NO_PARALLEL_MEMBER',
    }),
    softConstraint('S-01', '摄影黄金时段', '摄影成员希望至少获得一次黄金时段拍摄', 0.8, {
      memberId: 'M3',
      preferredPoiIds: ['POI-DYRHOLAEY', 'POI-JOKULSARLON'],
    }),
    softConstraint('S-02', '儿童午餐窗口', '儿童午餐安排在 12:00—13:30', 0.9, {
      memberId: 'M5',
      mealWindow: ['12:00', '13:30'],
    }),
    softConstraint('S-03', '老人下午室内休息', '老人每天下午需要至少 45 分钟室内休息', 0.7, {
      memberId: 'M4',
      indoorRestMinutes: 45,
    }),
    softConstraint('S-04', '避免成员分流', '尽量避免成员分流', 0.5, { preferUnifiedGroup: true }),
    softConstraint('S-05', '冰川核心体验', '年轻成员的冰川徒步属于必须满足的核心体验', 0.95, {
      memberId: 'M2',
      mustExperiencePoiId: 'POI-GLACIER-HIKE',
    }),
    softConstraint('S-06', '日程缓冲', '每天至少保留 45 分钟缓冲', 0.8, { minBufferMinutes: 45 }),
    softConstraint('S-07', '单日 POI 上限', '单日 POI 数量最好不超过 5 个', 0.6, {
      maxPoiPerDay: 5,
    }),
  ];
}

export const MCPOI_BENCHMARK_PLAN_VARIANTS: McpoiPlanVariant[] = [
  {
    variantId: 'A',
    title: '最大化 POI 数量（D3）',
    dayIndex: 2,
    expectedStatus: 'INFEASIBLE',
    expectedViolations: ['H-07', 'H-03', 'S-02', 'S-06', 'S-07'],
    expectedRecommendation:
      '将 Dyrhólaey 提前到上午并删除 Skógafoss 登顶部分；或取消 Dyrhólaey，保留 Lava Show 作为全员恢复活动。',
    items: [
      { itemId: 'mcpoi-a-001', poiId: 'POI-SELJALANDSFOSS', label: 'Seljalandsfoss', startTime: '09:00', endTime: '10:00', type: 'ACTIVITY' },
      { itemId: 'mcpoi-a-002', poiId: 'POI-SKOGAFOSS', label: 'Skógafoss', startTime: '11:00', endTime: '12:15', type: 'ACTIVITY' },
      { itemId: 'mcpoi-a-003', poiId: 'POI-REYNISFJARA', label: 'Reynisfjara', startTime: '13:15', endTime: '14:15', type: 'ACTIVITY' },
      { itemId: 'mcpoi-a-004', poiId: 'POI-DYRHOLAEY', label: 'Dyrhólaey', startTime: '15:30', endTime: '16:30', type: 'ACTIVITY' },
      { itemId: 'mcpoi-a-005', poiId: 'POI-LAVA-SHOW', label: 'Lava Show', startTime: '17:30', endTime: '18:30', type: 'ACTIVITY' },
      { itemId: 'mcpoi-a-006', label: '晚餐', startTime: '19:00', endTime: '20:00', type: 'MEAL' },
      { itemId: 'mcpoi-a-007', label: '酒店', startTime: '20:30', endTime: '21:00', type: 'HOTEL' },
    ],
  },
  {
    variantId: 'B',
    title: '调整 POI 顺序（D3）',
    dayIndex: 2,
    expectedStatus: 'FEASIBLE_WITH_TRADEOFF',
    expectedRecommendation: '推荐方案 B：增加约 35 分钟回头路，但消除强风阻断并满足成员约束。',
    tradeoffs: ['路线出现部分回头路，驾驶时间增加约 35 分钟'],
    items: [
      { itemId: 'mcpoi-b-001', poiId: 'POI-DYRHOLAEY', label: 'Dyrhólaey', startTime: '09:00', endTime: '10:00', type: 'ACTIVITY' },
      { itemId: 'mcpoi-b-002', poiId: 'POI-REYNISFJARA', label: 'Reynisfjara', startTime: '10:45', endTime: '11:45', type: 'ACTIVITY' },
      { itemId: 'mcpoi-b-003', label: '午餐', startTime: '12:15', endTime: '13:00', type: 'MEAL', memberIds: ['M5'] },
      { itemId: 'mcpoi-b-004', poiId: 'POI-SKOGAFOSS', label: 'Skógafoss', startTime: '13:30', endTime: '14:45', type: 'ACTIVITY' },
      { itemId: 'mcpoi-b-005', poiId: 'POI-SELJALANDSFOSS', label: 'Seljalandsfoss', startTime: '15:30', endTime: '16:30', type: 'ACTIVITY' },
      { itemId: 'mcpoi-b-006', label: '酒店', startTime: '18:00', endTime: '18:30', type: 'HOTEL' },
    ],
  },
  {
    variantId: 'C',
    title: '冰川日前插入峡谷（D4）',
    dayIndex: 3,
    expectedStatus: 'INFEASIBLE',
    expectedRecommendation:
      '插入 Fjaðrárgljúfur 将错过冰川签到，破坏 M2 核心目标并可能产生不可退费用。',
    items: [
      { itemId: 'mcpoi-c-001', label: '从 Vík 出发', startTime: '07:45', endTime: '08:45', type: 'TRANSIT' },
      { itemId: 'mcpoi-c-002', poiId: 'POI-FJADRARGLJUFUR', label: 'Fjaðrárgljúfur', startTime: '08:45', endTime: '10:00', type: 'ACTIVITY' },
      { itemId: 'mcpoi-c-003', label: '离开峡谷', startTime: '10:00', endTime: '11:20', type: 'TRANSIT' },
      { itemId: 'mcpoi-c-004', poiId: 'POI-GLACIER-HIKE', label: 'Glacier Hike', startTime: '11:30', endTime: '14:30', type: 'ACTIVITY', memberIds: ['M1', 'M2', 'M3'] },
      { itemId: 'mcpoi-c-005', poiId: 'POI-JOKULSARLON', label: 'Jökulsárlón', startTime: '15:30', endTime: '16:45', type: 'ACTIVITY' },
      { itemId: 'mcpoi-c-006', poiId: 'POI-DIAMOND-BEACH', label: 'Diamond Beach', startTime: '17:00', endTime: '17:45', type: 'ACTIVITY' },
      { itemId: 'mcpoi-c-007', label: '酒店', startTime: '20:30', endTime: '21:00', type: 'HOTEL' },
    ],
  },
  {
    variantId: 'D',
    title: '冰川活动成员分流（D4）',
    dayIndex: 3,
    expectedStatus: 'FEASIBLE_WITH_SPLIT',
    expectedRecommendation:
      '推荐分流：全员冰川不可行，全员放弃会损害核心目标；分流可同时满足年龄、体力、休息与摄影窗口。',
    items: [
      { itemId: 'mcpoi-d-001', label: '全员从 Vík 出发', startTime: '08:00', endTime: '09:20', type: 'TRANSIT' },
      {
        itemId: 'mcpoi-d-002',
        poiId: 'POI-GLACIER-HIKE',
        label: 'Glacier Hike',
        startTime: '09:30',
        endTime: '13:00',
        type: 'ACTIVITY',
        memberIds: ['M1', 'M2', 'M3'],
      },
      {
        itemId: 'mcpoi-d-003',
        poiId: 'POI-VISITOR-CENTER',
        label: 'Visitor Center + 午餐 + 室内休息',
        startTime: '09:30',
        endTime: '13:00',
        type: 'ACTIVITY',
        memberIds: ['M4', 'M5'],
      },
      { itemId: 'mcpoi-d-004', label: '全员会合', startTime: '13:15', endTime: '13:30', type: 'TRANSIT' },
      { itemId: 'mcpoi-d-005', poiId: 'POI-JOKULSARLON', label: 'Jökulsárlón', startTime: '15:30', endTime: '16:45', type: 'ACTIVITY' },
      { itemId: 'mcpoi-d-006', poiId: 'POI-DIAMOND-BEACH', label: 'Diamond Beach', startTime: '17:00', endTime: '17:45', type: 'ACTIVITY' },
      { itemId: 'mcpoi-d-007', label: '酒店', startTime: '19:30', endTime: '20:00', type: 'HOTEL' },
    ],
  },
];

export interface McpoiHarnessCase {
  caseId: string;
  changeAction: string;
  expected: string;
  baseVariant?: 'A' | 'B' | 'C' | 'D';
  change?: {
    type: string;
    poiId?: string;
    from?: string;
    to?: string;
    memberIds?: McpoiMemberId[];
  };
}

export const MCPOI_BENCHMARK_HARNESS_CASES: McpoiHarnessCase[] = [
  { caseId: 'POI-ORDER-001', changeAction: '调换 Dyrhólaey 和 Reynisfjara 顺序', expected: '风险从阻断降为可行', baseVariant: 'A', change: { type: 'REORDER', poiId: 'POI-DYRHOLAEY' } },
  { caseId: 'POI-INSERT-002', changeAction: '冰川前插入峡谷', expected: '错过固定预约，计划不可行', baseVariant: 'D', change: { type: 'INSERT', poiId: 'POI-FJADRARGLJUFUR' } },
  { caseId: 'POI-REMOVE-003', changeAction: '删除 Lava Show', expected: '老人恢复时间不足', baseVariant: 'A', change: { type: 'REMOVE', poiId: 'POI-LAVA-SHOW' } },
  { caseId: 'POI-ADD-004', changeAction: '同日增加 Skógafoss 登顶', expected: '老人步行超限', baseVariant: 'B', change: { type: 'ADD', poiId: 'POI-SKOGAFOSS' } },
  { caseId: 'POI-SPLIT-005', changeAction: '冰川活动成员分流', expected: '从不可行变为可行', baseVariant: 'C', change: { type: 'SPLIT', poiId: 'POI-GLACIER-HIKE', memberIds: ['M1', 'M2', 'M3'] } },
  { caseId: 'POI-REPLACE-006', changeAction: 'Dyrhólaey 替换为室内 POI', expected: '安全提升，摄影目标下降', baseVariant: 'A', change: { type: 'REPLACE', poiId: 'POI-DYRHOLAEY', to: 'POI-LAVA-SHOW' } },
  { caseId: 'POI-SWAP-007', changeAction: '冰河湖移动到天气转晴后', expected: '摄影满意度提升，但酒店缓冲下降', baseVariant: 'D', change: { type: 'MOVE', poiId: 'POI-JOKULSARLON' } },
  { caseId: 'POI-CHAIN-008', changeAction: '单个 POI 延迟 50 分钟', expected: '触发晚餐、驾驶、酒店连续冲突', baseVariant: 'A', change: { type: 'DELAY', poiId: 'POI-SELJALANDSFOSS', from: '09:00', to: '09:50' } },
];

export interface McpoiDecisionOutput {
  decisionId: string;
  change: {
    type: string;
    poiId?: string;
    from?: string;
    to?: string;
  };
  directImpacts: Array<{ constraintId: string; before: string; after: string }>;
  downstreamImpacts: Array<Record<string, unknown>>;
  affectedMembers: McpoiMemberId[];
  planStatusBefore: string;
  planStatusAfter: string;
  recommendation: string;
  reason: string;
  reversible: boolean;
}

/** 方案 A → B 的典型决策输出（POI-ORDER-001 参考） */
export const MCPOI_BENCHMARK_SAMPLE_DECISION: McpoiDecisionOutput = {
  decisionId: 'DEC-POI-001',
  change: { type: 'MOVE_POI', poiId: 'POI-DYRHOLAEY', from: '15:30', to: '09:00' },
  directImpacts: [{ constraintId: 'H-07', before: 'VIOLATED', after: 'SATISFIED' }],
  downstreamImpacts: [
    { type: 'DRIVE_TIME', deltaMinutes: 35 },
    { type: 'MEMBER_SATISFACTION', memberId: 'M3', delta: 18 },
    { type: 'MEAL_WINDOW', memberId: 'M5', before: 'LATE', after: 'ON_TIME' },
  ],
  affectedMembers: ['M1', 'M3', 'M4', 'M5'],
  planStatusBefore: 'INFEASIBLE',
  planStatusAfter: 'FEASIBLE_WITH_TRADEOFF',
  recommendation: 'ACCEPT_CHANGE',
  reason: '增加少量驾驶时间，但消除了安全阻断和成员约束冲突',
  reversible: true,
};

export function buildMcpoiBenchmarkTripMetadata(input: {
  scenarioId: string;
  activePlanVariant?: 'A' | 'B' | 'C' | 'D';
}) {
  return {
    source: 'benchmark',
    fixture: MCPOI_BENCHMARK_VERSION,
    explorationScenarioId: input.scenarioId,
    tripVersion: 1,
    benchmark: {
      name: 'Multi-Constraint POI Arrangement Benchmark v1',
      scenarioRef: MCPOI_BENCHMARK_TRIP_ID,
      activePlanVariant: input.activePlanVariant ?? 'A',
      members: MCPOI_BENCHMARK_MEMBERS,
      poiCatalog: MCPOI_BENCHMARK_POI_CATALOG,
      poiSlugs: MCPOI_BENCHMARK_POI_SLUGS,
      worldFacts: MCPOI_BENCHMARK_WORLD_FACTS,
      planVariants: MCPOI_BENCHMARK_PLAN_VARIANTS,
      harnessCases: MCPOI_BENCHMARK_HARNESS_CASES,
      sampleDecision: MCPOI_BENCHMARK_SAMPLE_DECISION,
      verificationGoals: [
        '变化传播是否正确',
        '硬软约束是否分层',
        '成员影响是否可解释',
        '系统能否提出结构性方案',
      ],
      testDataDisclaimer: '所有天气、道路、营业时间均为测试假数据，不能用于真实旅行。',
    },
    intent: {
      primaryGoal: '冰川体验、南岸自然景观、不过度疲劳',
      rankedPrinciples: ['SAFETY_FIRST', 'MEMBER_EXPERIENCE', 'POI_COUNT'],
      destination: { countryCode: 'IS', label: 'Iceland South Coast' },
    },
    constraints: {
      vehicle_type: '2WD',
      drivers: [{ memberId: 'M1', maxDailyDriveHours: 4.5 }],
      partySize: 5,
    },
    unifiedConstraints: buildMcpoiBenchmarkConstraints(),
    travelers: MCPOI_BENCHMARK_MEMBERS.map((m) => ({
      memberId: m.memberId,
      type: m.role === 'CHILD' ? 'CHILD' : m.role === 'ELDER' ? 'SENIOR' : 'ADULT',
      age: m.age,
      displayName: m.displayName,
      mobilityTag: m.role === 'ELDER' ? 'LOW' : m.role === 'CHILD' ? 'CHILD' : 'NORMAL',
      keyNeeds: m.keyNeeds,
    })),
    explorationInput: {
      destinationCodes: ['IS'],
      dateRange: MCPOI_BENCHMARK_DATE_RANGE,
      travelers: [{ role: 'ADULT', count: 3 }, { role: 'SENIOR', count: 1 }, { role: 'CHILD', count: 1 }],
      source: 'BENCHMARK',
      mobilityContext: { vehicleType: '2WD', driverCount: 1 },
    },
  };
}

/** 将方案变体条目映射为 DB itinerary item 写入参数 */
export function mcpoiVariantItemsForDay(
  variant: McpoiPlanVariant,
): McpoiScheduledItem[] {
  return variant.items;
}
