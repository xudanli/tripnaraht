/**
 * AI 自动执行授权中心 — 动作目录 SSOT。
 * @see internal-docs/product/AI_AUTOMATION_AUTHORIZATION_CENTER.md
 */

export const AUTOMATION_ACTION_CATALOG_SCHEMA_ID = 'tripnara.automation_action_catalog@v1';

export type AutomationActionGroup =
  | 'MONITORING'
  | 'TIME_ROUTE'
  | 'ACTIVITY'
  | 'BUDGET_BOOKING'
  | 'SAFETY'
  | 'TEAM_PRIVACY';

export type AutomationPermissionTier = 'AUTO' | 'ASK' | 'DENY';

export interface AutomationExecutionConditions {
  onlyUnbooked?: boolean;
  excludeCoreActivities?: boolean;
  noCrossDay?: boolean;
  noBudgetIncrease?: boolean;
  noDriveTimeIncrease?: boolean;
  maxItemsPerChange?: number;
  minMinutesBeforeActivity?: number;
  notifyOnApply?: boolean;
  teamCanUndo?: boolean;
}

export interface AutomationActionDefinition {
  key: string;
  group: AutomationActionGroup;
  label: string;
  description?: string;
  defaultTier: AutomationPermissionTier;
  /** 用户不可将权限升级为 AUTO 的硬底线 */
  floorTier?: 'ASK' | 'DENY';
  executionConditions?: AutomationExecutionConditions;
  /** 匹配 semanticKey / semanticCapability / legacy autoAllowed 键 */
  semanticKeys: string[];
  /** 兼容 TravelDecisionContract.automation.autoAllowed / confirmationRequired */
  legacyKeys?: string[];
  /** 冷启动首批 10 项 */
  coldStart?: boolean;
}

export const AUTOMATION_ACTION_GROUP_LABELS: Record<AutomationActionGroup, string> = {
  MONITORING: '环境监控',
  TIME_ROUTE: '时间与路线',
  ACTIVITY: '活动与体验',
  BUDGET_BOOKING: '预算与预订',
  SAFETY: '安全与风险',
  TEAM_PRIVACY: '团队与隐私',
};

export const AUTOMATION_PERMISSION_TIER_LABELS: Record<AutomationPermissionTier, string> = {
  AUTO: '自动处理',
  ASK: '需要我确认',
  DENY: '禁止自动执行',
};

/** 冷启动首批支持的 10 项 semantic 能力 */
export const COLD_START_AUTOMATION_ACTION_KEYS = [
  'monitoring.weather_road_update',
  'time_route.update_eta',
  'time_route.check_day_feasibility',
  'activity.generate_plan_b',
  'activity.reorder_unbooked_low_priority',
  'activity.trim_optional_items',
  'time_route.insert_rest_buffer',
  'tasks.create_update_reminders',
  'plan.record_changes_sync',
  'decision_queue.surface_issues',
] as const;

export const AUTOMATION_ACTION_CATALOG: AutomationActionDefinition[] = [
  // ── 1. 环境监控 ──
  {
    key: 'monitoring.weather_road_update',
    group: 'MONITORING',
    label: '更新天气与道路状态',
    defaultTier: 'AUTO',
    coldStart: true,
    semanticKeys: [
      'refresh_road_weather',
      'refresh_road_weather_evidence',
      'weather.hazard',
      'weather_hazard',
      'WEATHER_ACTIVITY_PROHIBITED',
      'coverage-gap',
    ],
    legacyKeys: ['refresh_road_weather_evidence'],
    executionConditions: { notifyOnApply: false },
  },
  {
    key: 'monitoring.poi_status',
    group: 'MONITORING',
    label: '更新景点开放状态',
    defaultTier: 'AUTO',
    semanticKeys: ['poi.closure', 'poi_closure', 'POI_CLOSURE'],
  },
  {
    key: 'monitoring.transport_status',
    group: 'MONITORING',
    label: '更新交通与航班状态',
    defaultTier: 'AUTO',
    semanticKeys: ['flight.status', 'flight_status', 'FLIGHT_STATUS', 'transport.delay'],
  },
  {
    key: 'monitoring.booking_status',
    group: 'MONITORING',
    label: '更新预约状态',
    defaultTier: 'AUTO',
    semanticKeys: ['booking.status', 'booking_status', 'BOOKING_STATUS'],
  },
  {
    key: 'monitoring.activity_status',
    group: 'MONITORING',
    label: '更新活动与集合状态',
    defaultTier: 'AUTO',
    semanticKeys: ['activity.cancel', 'activity.reschedule', 'meeting.time_change'],
  },
  {
    key: 'monitoring.trip_progress',
    group: 'MONITORING',
    label: '更新旅行进度',
    defaultTier: 'AUTO',
    semanticKeys: ['trip.progress', 'route.deviation', 'schedule.late'],
  },

  // ── 2. 时间与路线 ──
  {
    key: 'time_route.update_eta',
    group: 'TIME_ROUTE',
    label: '更新预计到达时间',
    defaultTier: 'AUTO',
    coldStart: true,
    semanticKeys: ['update_eta', 'eta_recalc', 'arrival_time'],
    executionConditions: { noCrossDay: true },
  },
  {
    key: 'time_route.shift_unstarted',
    group: 'TIME_ROUTE',
    label: '顺延未开始活动',
    defaultTier: 'AUTO',
    semanticKeys: ['shift_activity', 'shift_meal', 'shift_meal_within_30min', 'meal_late'],
    legacyKeys: ['shift_meal_within_30min'],
    executionConditions: { excludeCoreActivities: true, noCrossDay: true },
  },
  {
    key: 'time_route.insert_rest_buffer',
    group: 'TIME_ROUTE',
    label: '插入休息与缓冲时间',
    defaultTier: 'AUTO',
    coldStart: true,
    semanticKeys: ['buffer', 'add_activity_buffer', 'add_activity_buffer_15min', 'rest_insert'],
    legacyKeys: ['add_activity_buffer_15min'],
    executionConditions: { notifyOnApply: true, teamCanUndo: true },
  },
  {
    key: 'time_route.insert_fuel_charge',
    group: 'TIME_ROUTE',
    label: '插入加油或充电节点',
    defaultTier: 'AUTO',
    semanticKeys: ['fuel_stop', 'charge_stop', 'refuel'],
    executionConditions: { notifyOnApply: true },
  },
  {
    key: 'time_route.optimize_route',
    group: 'TIME_ROUTE',
    label: '优化路线',
    defaultTier: 'AUTO',
    semanticKeys: ['route.optimize', 'same_day_reroute'],
    executionConditions: { noBudgetIncrease: true, noDriveTimeIncrease: true },
  },
  {
    key: 'time_route.reorder_optional',
    group: 'TIME_ROUTE',
    label: '重排可选项目',
    defaultTier: 'AUTO',
    semanticKeys: ['reorder_optional', 'reorder_poi'],
    executionConditions: {
      onlyUnbooked: true,
      excludeCoreActivities: true,
      maxItemsPerChange: 3,
    },
  },
  {
    key: 'time_route.check_day_feasibility',
    group: 'TIME_ROUTE',
    label: '判断当天行程是否可完成',
    defaultTier: 'AUTO',
    coldStart: true,
    semanticKeys: ['day_feasibility', 'executability_check', 'EXCESSIVE_DAILY_LOAD'],
  },
  {
    key: 'time_route.reroute_for_closure',
    group: 'TIME_ROUTE',
    label: '因道路封闭调整路线',
    defaultTier: 'ASK',
    floorTier: 'ASK',
    semanticKeys: ['ROAD_SEGMENT_UNAVAILABLE', 'road_segment_unavailable', 'road_segment'],
    executionConditions: { notifyOnApply: true, teamCanUndo: true },
  },
  {
    key: 'time_route.cross_day_move',
    group: 'TIME_ROUTE',
    label: '跨天移动活动',
    defaultTier: 'ASK',
    floorTier: 'ASK',
    semanticKeys: ['cross_day_move', 'inter_day_travel', 'change_intercity'],
    legacyKeys: ['change_intercity_route'],
  },

  // ── 3. 活动与体验 ──
  {
    key: 'activity.generate_plan_b',
    group: 'ACTIVITY',
    label: '自动生成 Plan B',
    defaultTier: 'AUTO',
    coldStart: true,
    semanticKeys: [
      'plan_b',
      'generate_plan_b',
      'weather_hazard_replan',
      'WEATHER_ACTIVITY_PROHIBITED',
    ],
    legacyKeys: ['weather_hazard_replan'],
    executionConditions: { notifyOnApply: true },
  },
  {
    key: 'activity.enable_plan_b',
    group: 'ACTIVITY',
    label: '自动启用 Plan B',
    defaultTier: 'ASK',
    semanticKeys: ['enable_plan_b', 'apply_plan_b'],
  },
  {
    key: 'activity.reorder_unbooked_low_priority',
    group: 'ACTIVITY',
    label: '重排未预订低优先级活动',
    defaultTier: 'AUTO',
    coldStart: true,
    semanticKeys: ['reorder_low_priority', 'reorder_unbooked'],
    executionConditions: {
      onlyUnbooked: true,
      excludeCoreActivities: true,
      maxItemsPerChange: 3,
    },
  },
  {
    key: 'activity.replace_normal',
    group: 'ACTIVITY',
    label: '替换普通活动',
    defaultTier: 'AUTO',
    semanticKeys: ['replace_normal', 'swap_poi', 'indoor_fallback'],
    executionConditions: { excludeCoreActivities: true, notifyOnApply: true },
  },
  {
    key: 'activity.trim_optional_items',
    group: 'ACTIVITY',
    label: '缩短或删除可选项目',
    defaultTier: 'ASK',
    coldStart: true,
    semanticKeys: ['trim_optional', 'remove_optional', 'remove_poi'],
    legacyKeys: ['remove_poi'],
    executionConditions: {
      excludeCoreActivities: true,
      maxItemsPerChange: 2,
      notifyOnApply: true,
      teamCanUndo: true,
    },
  },
  {
    key: 'activity.replace_core',
    group: 'ACTIVITY',
    label: '替换核心体验',
    defaultTier: 'ASK',
    floorTier: 'ASK',
    semanticKeys: ['replace_core', 'delete_core', 'remove_core_experience'],
  },
  {
    key: 'activity.adjust_booked',
    group: 'ACTIVITY',
    label: '调整已预订活动',
    defaultTier: 'ASK',
    floorTier: 'ASK',
    semanticKeys: ['adjust_booked', 'modify_booking', 'reschedule_booked'],
  },

  // ── 4. 预算与预订 ──
  {
    key: 'budget.forecast_update',
    group: 'BUDGET_BOOKING',
    label: '更新预算预测',
    defaultTier: 'AUTO',
    semanticKeys: ['budget.forecast', 'budget_update'],
  },
  {
    key: 'budget.increase',
    group: 'BUDGET_BOOKING',
    label: '增加预算',
    defaultTier: 'ASK',
    floorTier: 'ASK',
    semanticKeys: ['increase_cost', 'budget.increase', '超预算'],
    legacyKeys: ['increase_cost'],
  },
  {
    key: 'booking.change_lodging',
    group: 'BUDGET_BOOKING',
    label: '更换酒店',
    defaultTier: 'ASK',
    floorTier: 'ASK',
    semanticKeys: ['change_lodging', 'lodging', 'hotel'],
    legacyKeys: ['change_lodging'],
  },
  {
    key: 'booking.change_transport',
    group: 'BUDGET_BOOKING',
    label: '修改交通方式',
    defaultTier: 'ASK',
    floorTier: 'ASK',
    semanticKeys: ['change_transport', 'change_intercity_route'],
  },
  {
    key: 'booking.cancel',
    group: 'BUDGET_BOOKING',
    label: '取消预订',
    defaultTier: 'ASK',
    floorTier: 'ASK',
    semanticKeys: ['cancel_booking', '取消预约'],
    description: 'AI 未经确认不得自动取消；用户确认后可由系统代为执行',
  },
  {
    key: 'booking.payment',
    group: 'BUDGET_BOOKING',
    label: '自动支付',
    defaultTier: 'DENY',
    floorTier: 'DENY',
    semanticKeys: ['auto_payment', 'payment', 'purchase'],
  },

  // ── 5. 安全与风险 ──
  {
    key: 'safety.reduce_intensity',
    group: 'SAFETY',
    label: '自动降低行程强度',
    defaultTier: 'AUTO',
    semanticKeys: ['reduce_intensity', 'pace_reduce', 'lower_activity_count'],
    executionConditions: { notifyOnApply: true, teamCanUndo: true },
  },
  {
    key: 'safety.avoid_closed_road',
    group: 'SAFETY',
    label: '避开封闭道路',
    defaultTier: 'AUTO',
    semanticKeys: ['avoid_closed_road', 'road_closure_reroute'],
  },
  {
    key: 'safety.elevate_warnings',
    group: 'SAFETY',
    label: '提高风险警告等级',
    defaultTier: 'AUTO',
    semanticKeys: ['elevate_warning', 'risk_alert'],
  },
  {
    key: 'safety.enable_high_risk_route',
    group: 'SAFETY',
    label: '启用高风险路线',
    defaultTier: 'DENY',
    floorTier: 'DENY',
    semanticKeys: ['high_risk_route', 'f_road_override', 'enable_high_risk'],
  },
  {
    key: 'safety.ignore_official_warning',
    group: 'SAFETY',
    label: '忽略官方道路或天气警告',
    defaultTier: 'DENY',
    floorTier: 'DENY',
    semanticKeys: ['ignore_warning', 'bypass_safety', 'ignore_official'],
  },
  {
    key: 'safety.lower_safety_level',
    group: 'SAFETY',
    label: '降低安全限制',
    defaultTier: 'DENY',
    floorTier: 'DENY',
    semanticKeys: ['lower_safety', 'reduce_safety_level'],
  },

  // ── 6. 团队与隐私 ──
  {
    key: 'team.sync_plan_changes',
    group: 'TEAM_PRIVACY',
    label: '同步行程变化给成员',
    defaultTier: 'AUTO',
    semanticKeys: ['sync_plan', 'plan_version_sync'],
  },
  {
    key: 'team.remind_members',
    group: 'TEAM_PRIVACY',
    label: '提醒成员',
    defaultTier: 'AUTO',
    semanticKeys: ['remind_member', 'team_reminder'],
  },
  {
    key: 'team.start_vote',
    group: 'TEAM_PRIVACY',
    label: '发起投票',
    defaultTier: 'ASK',
    semanticKeys: ['start_vote', 'team_vote'],
  },
  {
    key: 'team.send_external_message',
    group: 'TEAM_PRIVACY',
    label: '向其他成员或外部发送消息',
    defaultTier: 'ASK',
    floorTier: 'ASK',
    semanticKeys: ['send_message', 'external_communication', 'contact_hotel'],
  },
  {
    key: 'team.share_location',
    group: 'TEAM_PRIVACY',
    label: '共享成员位置',
    defaultTier: 'ASK',
    floorTier: 'ASK',
    semanticKeys: ['share_location', 'location_share'],
  },
  {
    key: 'team.proxy_consent',
    group: 'TEAM_PRIVACY',
    label: '代表成员确认',
    defaultTier: 'DENY',
    floorTier: 'DENY',
    semanticKeys: ['proxy_consent', 'proxy_vote', 'member_consent'],
  },

  // ── 横切：任务、计划维护、决策队列 ──
  {
    key: 'tasks.create_update_reminders',
    group: 'MONITORING',
    label: '生成并更新旅行任务',
    defaultTier: 'AUTO',
    coldStart: true,
    semanticKeys: ['create_reminder', 'update_task', 'travel_task'],
  },
  {
    key: 'plan.record_changes_sync',
    group: 'TIME_ROUTE',
    label: '记录行程变更并同步',
    defaultTier: 'AUTO',
    coldStart: true,
    semanticKeys: ['record_change', 'change_log', 'plan_writeback'],
    executionConditions: { notifyOnApply: true, teamCanUndo: true },
  },
  {
    key: 'decision_queue.surface_issues',
    group: 'ACTIVITY',
    label: '发现需决策问题并进入队列',
    defaultTier: 'AUTO',
    coldStart: true,
    semanticKeys: ['surface_decision', 'decision_queue', 'feasibility_failure'],
  },
];

const TIER_RESTRICTIVENESS: Record<AutomationPermissionTier, number> = {
  DENY: 3,
  ASK: 2,
  AUTO: 1,
};

export function getAutomationActionByKey(key: string): AutomationActionDefinition | undefined {
  return AUTOMATION_ACTION_CATALOG.find((a) => a.key === key);
}

export function listAutomationActionsByGroup(
  group: AutomationActionGroup,
): AutomationActionDefinition[] {
  return AUTOMATION_ACTION_CATALOG.filter((a) => a.group === group);
}

export function listColdStartAutomationActions(): AutomationActionDefinition[] {
  return AUTOMATION_ACTION_CATALOG.filter((a) => a.coldStart === true);
}

function normalizeToken(token: string): string {
  return token.toLowerCase().replace(/_/g, ' ').trim();
}

function tokenMatchesBlob(token: string, blob: string): boolean {
  const normalized = normalizeToken(token);
  return blob.includes(normalized) || blob.includes(token.toLowerCase());
}

/** 从 semanticKey / capability / legacy 键解析匹配的动作定义 */
export function resolveMatchingAutomationActions(input: {
  semanticKey?: string;
  semanticCapability?: string;
  legacyKeys?: string[];
}): AutomationActionDefinition[] {
  const parts = [input.semanticKey, input.semanticCapability, ...(input.legacyKeys ?? [])].filter(
    (p): p is string => Boolean(p),
  );
  if (parts.length === 0) return [];

  const blob = parts.join(' ').toLowerCase();
  const matched = new Set<AutomationActionDefinition>();

  for (const action of AUTOMATION_ACTION_CATALOG) {
    const keys = [...action.semanticKeys, ...(action.legacyKeys ?? [])];
    if (keys.some((key) => tokenMatchesBlob(key, blob))) {
      matched.add(action);
    }
  }

  return [...matched];
}

export function pickMostRestrictiveTier(
  tiers: AutomationPermissionTier[],
): AutomationPermissionTier {
  if (tiers.length === 0) return 'ASK';
  return tiers.reduce((best, tier) =>
    TIER_RESTRICTIVENESS[tier] > TIER_RESTRICTIVENESS[best] ? tier : best,
  );
}

export function snapshotAutomationActionCatalog() {
  return {
    schemaId: AUTOMATION_ACTION_CATALOG_SCHEMA_ID,
    actionCount: AUTOMATION_ACTION_CATALOG.length,
    coldStartCount: listColdStartAutomationActions().length,
    groups: (Object.keys(AUTOMATION_ACTION_GROUP_LABELS) as AutomationActionGroup[]).map(
      (group) => ({
        group,
        label: AUTOMATION_ACTION_GROUP_LABELS[group],
        actions: listAutomationActionsByGroup(group).map((a) => ({
          key: a.key,
          label: a.label,
          defaultTier: a.defaultTier,
          coldStart: a.coldStart ?? false,
        })),
      }),
    ),
  };
}
