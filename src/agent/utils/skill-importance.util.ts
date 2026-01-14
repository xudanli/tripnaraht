// src/agent/utils/skill-importance.util.ts

/**
 * Skills 重要性级别
 * 
 * 用于降级策略：
 * - CRITICAL: 关键 Skills，失败时必须拒绝或降级
 * - IMPORTANT: 重要 Skills，失败时标记数据缺失但继续执行
 * - OPTIONAL: 可选 Skills，失败时静默忽略
 */
export type SkillImportance = 'CRITICAL' | 'IMPORTANT' | 'OPTIONAL';

/**
 * Skills 重要性映射表
 * 
 * 定义每个 Skill 的重要性级别，用于降级策略决策
 */
const SKILL_IMPORTANCE_MAP: Record<string, SkillImportance> = {
  // === CRITICAL: 关键 Skills（失败时必须拒绝或降级）===
  'transport.search': 'CRITICAL', // 交通数据是行程规划的核心
  'itinerary.generate': 'CRITICAL', // 行程生成是核心功能
  
  // === IMPORTANT: 重要 Skills（失败时标记数据缺失但继续执行）===
  'poi.search': 'IMPORTANT', // POI 数据重要，但可以降级
  'opening_hours.get': 'IMPORTANT', // 开放时间重要，但可以降级
  'itinerary.verify': 'IMPORTANT', // 验证重要，但可以降级
  'gatekeeper.evaluate': 'IMPORTANT', // Gate 评估重要，但可以降级
  
  // === OPTIONAL: 可选 Skills（失败时静默忽略）===
  'dem.get.profile': 'OPTIONAL', // DEM 数据可选，用于增强功能
  'geo.check.hazard.zones': 'OPTIONAL', // 风险检查可选
  'repair.apply': 'OPTIONAL', // 修复可选，可以手动处理
};

/**
 * 获取 Skill 的重要性级别
 * 
 * @param skillName Skill 名称
 * @returns 重要性级别（默认 OPTIONAL）
 */
export function getSkillImportance(skillName: string): SkillImportance {
  return SKILL_IMPORTANCE_MAP[skillName] || 'OPTIONAL';
}

/**
 * 判断 Skill 是否关键
 * 
 * @param skillName Skill 名称
 * @returns 是否为关键 Skill
 */
export function isCriticalSkill(skillName: string): boolean {
  return getSkillImportance(skillName) === 'CRITICAL';
}

/**
 * 判断 Skill 是否重要
 * 
 * @param skillName Skill 名称
 * @returns 是否为重要 Skill
 */
export function isImportantSkill(skillName: string): boolean {
  return getSkillImportance(skillName) === 'IMPORTANT';
}

/**
 * 判断 Skill 是否可选
 * 
 * @param skillName Skill 名称
 * @returns 是否为可选 Skill
 */
export function isOptionalSkill(skillName: string): boolean {
  return getSkillImportance(skillName) === 'OPTIONAL';
}

/**
 * Skill 失败处理策略
 * 
 * 根据重要性级别决定如何处理失败：
 * - CRITICAL: 拒绝或降级
 * - IMPORTANT: 标记数据缺失，继续执行
 * - OPTIONAL: 静默忽略
 */
export interface SkillFailureStrategy {
  /** 是否应该拒绝请求 */
  shouldReject: boolean;
  /** 是否应该降级 */
  shouldDegrade: boolean;
  /** 是否应该标记数据缺失 */
  shouldMarkMissing: boolean;
  /** 是否应该静默忽略 */
  shouldIgnore: boolean;
  /** 错误消息 */
  errorMessage?: string;
}

/**
 * 获取 Skill 失败处理策略
 * 
 * @param skillName Skill 名称
 * @param error 错误信息
 * @returns 失败处理策略
 */
export function getSkillFailureStrategy(
  skillName: string,
  error?: Error,
): SkillFailureStrategy {
  const importance = getSkillImportance(skillName);
  
  // 检查是否是依赖缺失错误
  const isDependencyMissing = error?.message?.includes('未注入') || 
                               error?.message?.includes('not injected') ||
                               error?.message?.includes('未配置') ||
                               error?.message?.includes('not configured');
  
  switch (importance) {
    case 'CRITICAL':
      // 依赖缺失时可以降级，执行失败时拒绝
      if (isDependencyMissing) {
        return {
          shouldReject: false,
          shouldDegrade: true,
          shouldMarkMissing: true,
          shouldIgnore: false,
          errorMessage: `Critical skill '${skillName}' dependency missing: ${error?.message || 'Unknown error'}`,
        };
      }
      return {
        shouldReject: true,
        shouldDegrade: false,
        shouldMarkMissing: false,
        shouldIgnore: false,
        errorMessage: `Critical skill '${skillName}' failed: ${error?.message || 'Unknown error'}`,
      };
    
    case 'IMPORTANT':
      return {
        shouldReject: false,
        shouldDegrade: false,
        shouldMarkMissing: true,
        shouldIgnore: false,
        errorMessage: `Important skill '${skillName}' failed, data marked as missing: ${error?.message || 'Unknown error'}`,
      };
    
    case 'OPTIONAL':
    default:
      return {
        shouldReject: false,
        shouldDegrade: false,
        shouldMarkMissing: false,
        shouldIgnore: true,
        errorMessage: `Optional skill '${skillName}' failed, ignored: ${error?.message || 'Unknown error'}`,
      };
  }
}
