import { FINANCIAL_HOLD_HANDLER_ID } from '../dto/financial-hold-side-effect-params.dto';

export const SIDE_EFFECT_RULE_META_SCHEMA_VERSION = 'side_effect_rule_meta_v1' as const;
export const SIDE_EFFECT_RULE_SCHEMA_VERSION = 'side_effect_rule_schema_v1' as const;
export const RESOURCE_LOCK_HANDLER_ID = 'side_effect.resource_lock.inventory_v1' as const;
export const RESOURCE_CHECK_AVAILABILITY_HANDLER_ID = 'side_effect.resource_check.availability_v1' as const;
export const DNA_SYNC_UPDATE_HANDLER_ID = 'side_effect.dna_sync.update_v1' as const;
export const SHADOW_AUDIT_HANDLER_ID = 'side_effect.audit_log.shadow_audit_v1' as const;
export const WEATHER_GATE_HANDLER_ID = 'side_effect.environment_check.weather_gate_v1' as const;
export const FINANCIAL_REFUND_HANDLER_ID = 'side_effect.financial_refund.v1' as const;
export const VEHICLE_POLICY_CHECK_HANDLER_ID = 'side_effect.vehicle_policy_check.v1' as const;
export const SOLAR_SAFETY_CHECK_HANDLER_ID = 'side_effect.solar_safety.sunset_check.v1' as const;

export const SIDE_EFFECT_ACTION_LABELS: Record<string, string> = {
  'trip.apply_user_edit': '用户修改行程',
  'trip.confirm_booking': '用户确认预订',
  'trip.plan_itinerary': '规划行程',
  'trip.cancel_booking': '取消预订',
  'trip.confirm_itinerary': '确认行程',
  'transport.book_vehicles': '预订车辆',
  'trip.route_optimization': '路线优化',
  'hiking.start_session': '开始徒步',
  'agent.decision_finalized': '决策完成',
  'action.execute_high_risk': '执行高风险动作',
  'trip.load_draft': '加载行程草稿',
  'trip.persist_plan': '保存规划结果',
  'execution.remind': '通知提醒',
};

export const SIDE_EFFECT_HANDLER_LABELS: Record<string, string> = {
  [FINANCIAL_HOLD_HANDLER_ID]: '资金锁定',
  [FINANCIAL_REFUND_HANDLER_ID]: '资金退款',
  [RESOURCE_LOCK_HANDLER_ID]: '库存锁定',
  [RESOURCE_CHECK_AVAILABILITY_HANDLER_ID]: '库存可用性校验',
  [VEHICLE_POLICY_CHECK_HANDLER_ID]: '车型准入校验',
  [WEATHER_GATE_HANDLER_ID]: '天气门控',
  [SOLAR_SAFETY_CHECK_HANDLER_ID]: '日照安全校验',
  [DNA_SYNC_UPDATE_HANDLER_ID]: 'DNA 异步同步',
  [SHADOW_AUDIT_HANDLER_ID]: '影子审计',
};

export const SIDE_EFFECT_ACTION_HANDLER_PAIRS: Record<string, string[]> = {
  'trip.apply_user_edit': [FINANCIAL_HOLD_HANDLER_ID, RESOURCE_LOCK_HANDLER_ID],
  'trip.confirm_booking': [FINANCIAL_HOLD_HANDLER_ID],
  'trip.plan_itinerary': [RESOURCE_CHECK_AVAILABILITY_HANDLER_ID],
  'trip.cancel_booking': [FINANCIAL_REFUND_HANDLER_ID],
  'trip.confirm_itinerary': [RESOURCE_LOCK_HANDLER_ID],
  'transport.book_vehicles': [VEHICLE_POLICY_CHECK_HANDLER_ID],
  'trip.route_optimization': [WEATHER_GATE_HANDLER_ID],
  'hiking.start_session': [SOLAR_SAFETY_CHECK_HANDLER_ID],
  'agent.decision_finalized': [DNA_SYNC_UPDATE_HANDLER_ID],
  'action.execute_high_risk': [SHADOW_AUDIT_HANDLER_ID],
};

export function getActionLabel(actionName: string): string {
  return SIDE_EFFECT_ACTION_LABELS[actionName] ?? actionName;
}

export function getHandlerLabel(handlerId: string): string {
  return SIDE_EFFECT_HANDLER_LABELS[handlerId] ?? handlerId;
}

export function isSupportedActionHandlerPair(actionName: string, handlerId: string): boolean {
  const list = SIDE_EFFECT_ACTION_HANDLER_PAIRS[actionName];
  if (!list) return false;
  return list.includes(handlerId);
}

export function getSupportedActionDefaults(): string[] {
  return Object.keys(SIDE_EFFECT_ACTION_HANDLER_PAIRS);
}

export function getSupportedHandlerDefaults(): string[] {
  const out = new Set<string>();
  Object.values(SIDE_EFFECT_ACTION_HANDLER_PAIRS).forEach((handlers) => handlers.forEach((h) => out.add(h)));
  return Array.from(out.values()).sort();
}

export function getParamsSchemaForActionHandler(actionName: string, handlerId: string): Record<string, any> {
  if (handlerId === FINANCIAL_HOLD_HANDLER_ID) {
    return {
      type: 'object',
      title: `${actionName} / ${handlerId}`,
      description: '资金冻结参数',
      properties: {
        ttl_seconds: {
          type: 'number',
          minimum: 1,
          maximum: 604800,
          default: 900,
        },
        hold_ratio: {
          type: 'number',
          minimum: 0.0001,
          maximum: 1,
          default: 1,
        },
      },
      required: [],
      additionalProperties: false,
    };
  }
  if (handlerId === RESOURCE_LOCK_HANDLER_ID) {
    return {
      type: 'object',
      title: `${actionName} / ${handlerId}`,
      description: '库存锁定参数',
      properties: {
        ttl_seconds: {
          type: 'number',
          minimum: 1,
          maximum: 604800,
          default: 1800,
        },
        lock_type: {
          type: 'string',
          enum: ['SOFT_HOLD', 'HARD_LOCK'],
          default: 'SOFT_HOLD',
        },
        inventory_ref: {
          type: 'string',
        },
      },
      required: [],
      additionalProperties: true,
    };
  }
  if (handlerId === RESOURCE_CHECK_AVAILABILITY_HANDLER_ID) {
    return {
      type: 'object',
      title: `${actionName} / ${handlerId}`,
      description: '库存可用性预检查参数',
      properties: {
        provider_timeout_ms: { type: 'number', minimum: 100, maximum: 30000, default: 3000 },
        fallback_strategy: { type: 'string', enum: ['FAIL_FAST', 'DEGRADE_WITH_WARNING'], default: 'DEGRADE_WITH_WARNING' },
      },
      required: [],
      additionalProperties: true,
    };
  }
  if (handlerId === DNA_SYNC_UPDATE_HANDLER_ID) {
    return {
      type: 'object',
      title: `${actionName} / ${handlerId}`,
      description: 'DNA 异步学习同步参数',
      properties: {
        sync_priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'], default: 'MEDIUM' },
        learning_weight: { type: 'number', minimum: 0, maximum: 1, default: 0.1 },
      },
      required: [],
      additionalProperties: false,
    };
  }
  if (handlerId === SHADOW_AUDIT_HANDLER_ID) {
    return {
      type: 'object',
      title: `${actionName} / ${handlerId}`,
      description: '高风险动作影子审计参数',
      properties: {
        log_level: { type: 'string', enum: ['INFO', 'WARN', 'CRITICAL'], default: 'CRITICAL' },
        notify_admin: { type: 'boolean', default: true },
      },
      required: [],
      additionalProperties: false,
    };
  }
  if (handlerId === WEATHER_GATE_HANDLER_ID) {
    return {
      type: 'object',
      title: `${actionName} / ${handlerId}`,
      description: '天气门控参数',
      properties: {
        max_wind_kph: { type: 'number', minimum: 0, maximum: 200, default: 50 },
        alert_level: { type: 'string', enum: ['WARNING', 'BLOCK'], default: 'BLOCK' },
      },
      required: [],
      additionalProperties: false,
    };
  }
  if (handlerId === FINANCIAL_REFUND_HANDLER_ID) {
    return {
      type: 'object',
      title: `${actionName} / ${handlerId}`,
      description: '退款策略参数',
      properties: {
        fee_waive: { type: 'boolean', default: false },
        audit_required: { type: 'boolean', default: true },
      },
      required: [],
      additionalProperties: false,
    };
  }
  if (handlerId === VEHICLE_POLICY_CHECK_HANDLER_ID) {
    return {
      type: 'object',
      title: `${actionName} / ${handlerId}`,
      description: '车辆策略校验参数',
      properties: {
        force_4x4: { type: 'boolean', default: true },
        check_engine_type: { type: 'boolean', default: true },
      },
      required: [],
      additionalProperties: false,
    };
  }
  if (handlerId === SOLAR_SAFETY_CHECK_HANDLER_ID) {
    return {
      type: 'object',
      title: `${actionName} / ${handlerId}`,
      description: '日照安全校验参数',
      properties: {
        buffer_min: { type: 'number', minimum: 0, maximum: 360, default: 60 },
        fail_action: { type: 'string', enum: ['WARNING', 'BLOCK'], default: 'WARNING' },
      },
      required: [],
      additionalProperties: false,
    };
  }
  return {
    type: 'object',
    additionalProperties: true,
  };
}
