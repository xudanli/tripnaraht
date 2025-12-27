// src/trips/decision/interfaces/spatial-issue.interface.ts
/**
 * Spatial Issue Interface
 * 
 * Neptune 要处理的空间问题类型
 */

/**
 * 空间问题类型
 */
export type SpatialIssueType =
  | 'ENTRY_UNREACHABLE'    // 入口不可达
  | 'POI_UNAVAILABLE'      // POI 不可用
  | 'SEGMENT_BLOCKED'      // 路段被阻塞
  | 'FERRY_CANCELLED'      // 渡轮停运
  | 'HAZARD_ZONE';         // 危险区域

/**
 * 空间问题
 */
export interface SpatialIssue {
  /** 问题 ID */
  issueId: string;
  /** 问题类型 */
  type: SpatialIssueType;
  /** 关联的路段 ID（如果有） */
  segmentId?: string;
  /** 关联的 POI ID（如果有） */
  poiId?: string;
  /** 严重程度 */
  severity: 'HARD' | 'SOFT';
  /** 原因描述 */
  reason: string;
  /** 原始位置（用于查找替代） */
  originalLocation?: {
    lat: number;
    lng: number;
  };
  /** 元数据 */
  metadata?: Record<string, any>;
  /** 兼容旧字段名 */
  meta?: Record<string, any>;
}

/**
 * Neptune 输入
 */
export interface NeptuneInput {
  world: import('../shared/world-model.types').WorldModelContext;
  plan: import('../shared/world-model.types').RoutePlanDraft;
  spatialIssues: SpatialIssue[];
  routeDirection: {
    id: string;
    corridorGeom?: string; // PostGIS LINESTRING
    regions?: string[];
    philosophy?: string;
    metadata?: Record<string, any>;
  };
}

