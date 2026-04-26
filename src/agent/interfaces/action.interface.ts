// src/agent/interfaces/action.interface.ts

/**
 * Action 类型
 */
export enum ActionKind {
  INTERNAL = 'internal',
  EXTERNAL = 'external',
}

/**
 * Action 成本
 */
export enum ActionCost {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

/**
 * Action 副作用
 */
export enum ActionSideEffect {
  NONE = 'none',
  WRITES_DB = 'writes_db',
  CALLS_API = 'calls_api',
  CHARGES_MONEY = 'charges_money',
}

export type ActionFeasibilityStatus = 'feasible' | 'blocked' | 'requires_confirmation';

export type PreconditionFindingCode =
  | 'MISSING_FIELD'
  | 'INSUFFICIENT_FUNDS'
  | 'BUDGET_LIMIT_WARNING'
  | 'PRECONDITION_FAILED'
  | 'UNKNOWN';

export interface PreconditionFinding {
  code: PreconditionFindingCode;
  message: string;
  /** Optional JSON path / dotted path that failed */
  path?: string;
  severity: 'INFO' | 'WARN' | 'BLOCK';
}

export interface ShadowDeltaBudget {
  current: number;
  delta: number;
  after: number;
  currency: string;
}

export interface ShadowDeltaView {
  resources?: {
    budget?: ShadowDeltaBudget;
    time?: { start_offset_ms: number; end_offset_ms: number; duration_delta_ms: number };
  };
  risk_profile?: { before: string; after: string; delta_reason: string };
  ontology_patches?: any[];
}

export interface PreconditionAssessment {
  status: ActionFeasibilityStatus;
  findings: PreconditionFinding[];
  shadow_delta?: ShadowDeltaView;
}

/**
 * Action 元数据
 */
export interface ActionMetadata {
  /** Action 类型 */
  kind: ActionKind;
  /** 成本 */
  cost: ActionCost;
  /** 副作用 */
  side_effect: ActionSideEffect;
  /** 前置条件 */
  preconditions: string[];
  /** 是否幂等 */
  idempotent: boolean;
  /** 是否可缓存 */
  cacheable: boolean;
  /** 缓存键（如果可缓存） */
  cache_key?: string;
}

/**
 * Action 定义
 */
export interface Action {
  /** Action 名称（如 "trip.load_draft"） */
  name: string;
  /** 描述 */
  description: string;
  /** 元数据 */
  metadata: ActionMetadata;
  /** 输入 Schema（JSON Schema） */
  input_schema: Record<string, any>;
  /** 输出 Schema（JSON Schema） */
  output_schema: Record<string, any>;
  /** 执行函数 */
  execute: (input: any, state: any) => Promise<any>;

  /**
   * Optional: richer precondition + impact assessment for preview.
   * If omitted, registry falls back to metadata.preconditions dotted-path checks.
   */
  assess_preconditions?: (input: any, state: any) => PreconditionAssessment | Promise<PreconditionAssessment>;

  /**
   * Declarative side-effect wiring (config only; runtime resolved via SideEffectRegistry).
   * This makes SideEffects a first-class, extensible contract.
   */
  side_effect_configs?: Array<{
    handlerId: string;
    params?: Record<string, any>;
  }>;
}

