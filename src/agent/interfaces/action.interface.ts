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
}

