// src/trips/readiness/types/readiness-findings.types.ts

/**
 * Readiness Findings Types
 * 
 * 定义 Readiness Checker 的输出结果
 * 这些结果会被编译成决策层的约束
 */

import { ActionLevel, ReadinessCategory, RuleSeverity, HazardType, Task } from './readiness-pack.types';

export interface ReadinessFindingItem {
  id: string; // rule id
  category: ReadinessCategory;
  severity: RuleSeverity;
  level: ActionLevel;
  message: string;
  tasks?: Task[];
  askUser?: string[];
  evidence?: Array<{
    sourceId: string;
    sectionId?: string;
    quote?: string;
  }>;
}

export interface ReadinessFinding {
  destinationId: string;
  packId: string;
  packVersion: string;
  
  blockers: ReadinessFindingItem[]; // level === 'blocker'
  must: ReadinessFindingItem[]; // level === 'must'
  should: ReadinessFindingItem[]; // level === 'should'
  optional: ReadinessFindingItem[]; // level === 'optional'
  
  risks: Array<{
    type: HazardType;
    severity: RuleSeverity;
    summary: string;
    mitigations: string[];
  }>;
  
  missingInfo?: string[]; // 需要用户提供的信息
}

export interface ReadinessDisclaimer {
  /**
   * 免责声明消息
   * 告知用户本检查结果仅供参考，实际要求以官方机构为准
   */
  message: string;
  
  /**
   * 数据最后更新时间
   * 格式：ISO 8601 datetime
   * 来源：所有Pack的lastReviewedAt中的最新日期
   */
  lastUpdated?: string;
  
  /**
   * 数据来源列表
   * 例如：['pack.is.iceland', 'facts.NZ']
   */
  dataSources?: string[];
  
  /**
   * 用户必须自行验证的事项
   * 例如：['签证要求', '保险覆盖范围']
   */
  userActionRequired?: string[];
}

export interface ReadinessCheckResult {
  findings: ReadinessFinding[];
  summary: {
    totalBlockers: number;
    totalMust: number;
    totalShould: number;
    totalOptional: number;
    totalRisks: number;
  };
  /**
   * 免责声明和责任边界
   * 必须包含在API响应中，前端必须显示给用户
   */
  disclaimer?: ReadinessDisclaimer;
}

