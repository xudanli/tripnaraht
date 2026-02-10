// src/route-directions/interfaces/route-direction-metadata.interface.ts
/**
 * RouteDirection Metadata 类型定义
 * 
 * 规范化metadata结构，提升类型安全性
 */

import { RoutePhilosophy } from '../../trips/decision/models/route-philosophy.model';
import { FailureProfile, RouteNarrative } from './route-direction.interface';

/**
 * RouteDirection Metadata 接口
 * 
 * 用于规范化RouteDirection.metadata字段的结构
 */
export interface RouteDirectionMetadata {
  /** 版本号 */
  version?: string;
  
  /** 路线ID */
  route_id?: string;
  
  /** 最后更新时间 */
  last_updated?: string;
  
  /** 可信度评分 */
  credibility_score?: number;
  
  /** 路线哲学（核心约束） */
  philosophy?: RoutePhilosophy;
  
  /** 扩展字段 */
  extensions?: {
    /** 失败画像（用于Neptune决策策略） */
    failureProfile?: FailureProfile;
    
    /** 路线叙事（用于用户教育和决策解释） */
    narrative?: RouteNarrative;
  };
  
  /** 不适合的用户画像（用于路线推荐过滤） */
  antiPersona?: string[];
  
  /** 其他扩展字段 */
  [key: string]: any;
}

/**
 * 验证metadata结构
 */
export function validateRouteDirectionMetadata(metadata: any): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (!metadata || typeof metadata !== 'object') {
    errors.push('metadata必须是对象');
    return { valid: false, errors };
  }
  
  // 验证philosophy结构（如果存在）
  if (metadata.philosophy) {
    if (!metadata.philosophy.coreStatement) {
      errors.push('philosophy必须包含coreStatement');
    }
    if (!Array.isArray(metadata.philosophy.nonNegotiableRules)) {
      errors.push('philosophy.nonNegotiableRules必须是数组');
    }
  }
  
  // 验证failureProfile结构（如果存在）
  if (metadata.extensions?.failureProfile) {
    const fp = metadata.extensions.failureProfile;
    if (!Array.isArray(fp.commonFailureDays)) {
      errors.push('failureProfile.commonFailureDays必须是数组');
    }
    if (!Array.isArray(fp.typicalFailureReason)) {
      errors.push('failureProfile.typicalFailureReason必须是数组');
    }
    if (!['HIGH', 'MEDIUM', 'LOW'].includes(fp.rescueDifficulty)) {
      errors.push('failureProfile.rescueDifficulty必须是HIGH/MEDIUM/LOW之一');
    }
  }
  
  // 验证antiPersona结构（如果存在）
  if (metadata.antiPersona && !Array.isArray(metadata.antiPersona)) {
    errors.push('antiPersona必须是数组');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}
