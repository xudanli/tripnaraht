// src/trips/decision/interfaces/replacement-candidate.interface.ts
/**
 * Replacement Candidate Interface
 * 
 * 替代候选点的数据结构
 */

/**
 * 替代候选点
 */
export interface ReplacementCandidate {
  /** POI ID */
  poiId: string;
  /** 位置 */
  lat: number;
  lng: number;
  /** 类型 */
  type: string;
  /** 标签 */
  tags: string[];
  /** 与原点距离（米） */
  distM: number;
  /** 在走廊上的投影位置 [0,1] */
  corridorT: number;
  /** 海拔差（米，正数表示更高） */
  demDeltaM: number;
  /** 热度评分 0-1 */
  popularity: number;
  /** 元数据 */
  metadata?: {
    openingHours?: any;
    access?: string;
    elevationM?: number;
    [key: string]: any;
  };
}

/**
 * 替代操作
 */
export interface ReplacementOperation {
  /** 操作类型 */
  type: 'ENTRY_REPLACEMENT' | 'POI_REPLACEMENT' | 'SEGMENT_REPLACEMENT';
  /** 原始 POI ID */
  originalPoiId?: string;
  /** 新 POI ID */
  newPoiId?: string;
  /** 原始路段 ID */
  originalSegmentId?: string;
  /** 新路段 ID 列表 */
  newSegmentIds?: string[];
  /** 评分 */
  score: number;
  /** 解释 */
  explanation: string;
}

