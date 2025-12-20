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

export interface ReadinessCheckResult {
  findings: ReadinessFinding[];
  summary: {
    totalBlockers: number;
    totalMust: number;
    totalShould: number;
    totalOptional: number;
    totalRisks: number;
  };
}

