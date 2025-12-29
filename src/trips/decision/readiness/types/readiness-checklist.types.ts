// src/trips/decision/readiness/types/readiness-checklist.types.ts
/**
 * Travel Readiness Checklist Types
 * 
 * 从 WorldModelContext 反推出的旅行准备度清单
 */

/**
 * 准备度检查项类型
 */
export type ReadinessChecklistItemType = 'GEAR' | 'DOCUMENT' | 'HEALTH' | 'SKILL';

/**
 * 严重程度
 */
export type ReadinessSeverity = 'MUST' | 'SHOULD' | 'OPTIONAL';

/**
 * 旅行准备度检查项
 */
export interface TravelReadinessChecklistItem {
  /** 唯一标识 */
  id: string;
  
  /** 类型 */
  type: ReadinessChecklistItemType;
  
  /** 严重程度 */
  severity: ReadinessSeverity;
  
  /** 标题 */
  title: string;
  
  /** 描述 */
  description: string;
  
  /** 原因信号（来自哪些约束/标签） */
  reasonSignals: string[];
  
  /** 元数据（用于扩展） */
  metadata?: Record<string, any>;
}

/**
 * 旅行准备度结果
 */
export interface TravelReadinessResult {
  /** 路线 ID（如果有） */
  routeId?: string;
  
  /** 摘要 */
  summary: string;
  
  /** 检查项列表 */
  items: TravelReadinessChecklistItem[];
  
  /** 按类型分组 */
  itemsByType: {
    GEAR: TravelReadinessChecklistItem[];
    DOCUMENT: TravelReadinessChecklistItem[];
    HEALTH: TravelReadinessChecklistItem[];
    SKILL: TravelReadinessChecklistItem[];
  };
  
  /** 按严重程度分组 */
  itemsBySeverity: {
    MUST: TravelReadinessChecklistItem[];
    SHOULD: TravelReadinessChecklistItem[];
    OPTIONAL: TravelReadinessChecklistItem[];
  };
}

