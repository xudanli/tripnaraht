// src/skills/interfaces/skill.interface.ts
/**
 * Skill 接口定义
 *
 * Skills = 能力颗粒，最小可复用的能力单元
 * 每个 Skill 只做一件"决策上有意义的事"
 */

import type { OrchestrationStep, SubAgentType } from '../../agent/interfaces/trip-plan.interface';

/** P0: Orchestrator 注入的 Token 打点上下文，供 Skills 内 LLM 调用时传入 LlmService */
export interface SkillTokenContext {
  request_id: string;
  state_machine_step: OrchestrationStep;
  sub_agent: SubAgentType;
}

export interface SkillInput {
  [key: string]: any;
  /** P0: Orchestrator 注入，用于 Skills 内 LLM 打点（按阶段聚合 Token）。调用 LlmService.callLlmWithSchema 时传入第 4 参数 */
  tokenContext?: SkillTokenContext;
}

export interface SkillOutput {
  [key: string]: any;
}

/**
 * 参数类型检查规则
 */
export interface ParameterTypeCheck {
  /** 参数类型 */
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  /** 最小值（适用于 number 或 array.length） */
  min?: number;
  /** 最大值（适用于 number 或 array.length） */
  max?: number;
  /** 最小长度（适用于 string 或 array） */
  minLength?: number;
  /** 最大长度（适用于 string 或 array） */
  maxLength?: number;
  /** 格式验证（适用于 string） */
  format?: 'email' | 'url' | 'date' | 'date-time' | 'uuid';
  /** 枚举值（适用于 string 或 number） */
  enum?: (string | number)[];
  /** 自定义验证函数名称（在验证服务中注册） */
  validator?: string;
}

/**
 * 参数提取器配置
 */
export interface ParameterExtractor {
  /** 提取器类型 */
  type: 'context' | 'request' | 'step';
  /** 提取器名称（用于 context/request 类型） */
  name?: string; // 如 'tripId', 'countryCode'
  /** 步骤 ID（用于 step 类型） */
  stepId?: string; // 如 'step1', 'itinerary.generate'
  /** 结果路径（用于 step 类型，支持点号分隔的路径） */
  path?: string; // 如 'result.itinerary', 'result.issues'
  /** 默认值（如果提取失败） */
  defaultValue?: any;
}

/**
 * 输入参数 Schema 定义
 * 用于声明式验证 skill 的输入参数
 */
export interface SkillInputSchema {
  /** 必需参数列表 */
  required?: string[];
  /** 参数依赖关系：参数之间的依赖和替代关系 */
  dependencies?: Array<{
    param: string; // 参数名
    alternatives?: string[]; // 替代参数（如果这些参数存在，该参数可选）
  }>;
  /** 参数提取器：从 context/request/步骤结果中提取参数 */
  extractors?: Record<string, string | ParameterExtractor>; // 向后兼容：支持字符串（提取器名称）或对象（完整配置）
  /** 参数类型检查规则 */
  typeChecks?: Record<string, ParameterTypeCheck>;
}

export interface SkillMetadata {
  name: string;
  description: string;
  version: string;
  category: 'decision' | 'dem' | 'routeDirection' | 'countryPack' | 'readiness' | 'whatIf' | 'analytics' | 'rag' | 'world' | 'trip' | 'geo';
  /** 工具分组：DOMAIN（领域工具）或 CONTEXT（上下文工具） */
  toolGroup?: 'DOMAIN' | 'CONTEXT';
  /** 输入参数 Schema（可选，用于声明式验证） */
  inputSchema?: SkillInputSchema;
}

export interface Skill<TInput extends SkillInput = SkillInput, TOutput extends SkillOutput = SkillOutput> {
  metadata: SkillMetadata;
  execute(input: TInput): Promise<TOutput>;
}

