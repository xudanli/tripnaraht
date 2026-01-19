// src/agent/memory/interfaces/persona-state-management.interface.ts

import { UserPersona, PersonaContext } from './multi-persona.interface';

/**
 * Persona状态
 */
export type PersonaState = 
  | 'INACTIVE'      // 未激活
  | 'ACTIVE'        // 激活中
  | 'SUSPENDED'     // 暂停
  | 'ARCHIVED';     // 归档

/**
 * Persona切换策略
 */
export type PersonaSwitchStrategy = 
  | 'MANUAL'        // 手动切换
  | 'AUTO_CONTEXT'  // 基于上下文自动切换
  | 'AUTO_TIME'     // 基于时间自动切换
  | 'AUTO_ACTIVITY'; // 基于活动自动切换

/**
 * Persona状态信息
 */
export interface PersonaStateInfo {
  personaName: string;
  state: PersonaState;
  activatedAt?: Date;
  lastUsedAt?: Date;
  switchCount: number;
  totalUsageTime: number; // 总使用时间（毫秒）
  contextHistory: Array<{
    timestamp: Date;
    context: PersonaContext;
    state: PersonaState;
  }>;
}

/**
 * Persona切换请求
 */
export interface PersonaSwitchRequest {
  userId: string;
  fromPersona?: string;
  toPersona: string;
  strategy: PersonaSwitchStrategy;
  context?: PersonaContext;
  reason?: string;
  force?: boolean; // 强制切换，忽略冲突检查
}

/**
 * Persona切换结果
 */
export interface PersonaSwitchResult {
  success: boolean;
  fromPersona?: string;
  toPersona: string;
  switchTime: Date;
  strategy: PersonaSwitchStrategy;
  reason?: string;
  conflicts?: Array<{
    type: 'STATE_CONFLICT' | 'CONTEXT_MISMATCH' | 'PRECONDITION_FAILED';
    message: string;
  }>;
  transition?: {
    duration: number; // 切换耗时（毫秒）
    steps: string[];
  };
}

/**
 * Persona状态机配置
 */
export interface PersonaStateMachineConfig {
  enableAutoSwitch?: boolean;
  autoSwitchThreshold?: number; // 自动切换阈值（0-1）
  stateTransitionRules?: Array<{
    from: PersonaState;
    to: PersonaState;
    conditions?: Array<{
      type: 'CONTEXT_MATCH' | 'TIME_MATCH' | 'ACTIVITY_MATCH';
      value: any;
    }>;
  }>;
  statePersistence?: {
    enabled: boolean;
    persistenceInterval?: number; // 持久化间隔（毫秒）
  };
}

/**
 * Persona状态快照
 */
export interface PersonaStateSnapshot {
  userId: string;
  timestamp: Date;
  activePersona?: string;
  personaStates: Map<string, PersonaStateInfo>;
  context: PersonaContext;
  metadata: {
    totalPersonas: number;
    activePersonas: number;
    lastSwitchTime?: Date;
  };
}
