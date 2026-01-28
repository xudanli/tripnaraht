// src/trips/readiness/types/coverage-map.types.ts

/**
 * Coverage Map Types
 * 
 * 定义覆盖地图相关的数据类型
 */

// ==================== 准备度分数类型 ====================

/**
 * 准备度分数详情
 */
export interface ReadinessScoreBreakdown {
  overall: number;              // 总体分数 0-100
  evidenceCoverage: number;     // 证据覆盖率 0-100
  scheduleFeasibility: number;  // 时间可行性 0-100
  transportCertainty: number;   // 交通确定性 0-100
  safetyRisk: number;           // 安全风险分数 0-100 (越高越安全)
  buffers: number;              // 缓冲时间分数 0-100
}

/**
 * 准备度发现项
 */
export interface ReadinessScoreFinding {
  id: string;
  type: 'blocker' | 'warning' | 'suggestion';
  category: string;
  message: string;
  severity: 'high' | 'medium' | 'low';
  affectedDays?: number[];
  actionRequired?: string;
}

/**
 * 准备度风险项
 */
export interface ReadinessScoreRisk {
  id: string;
  type: string;
  severity: 'high' | 'medium' | 'low';
  message: string;
  mitigation?: string[];
  affectedPois?: string[];
}

/**
 * 准备度分数响应
 */
export interface ReadinessScoreResponse {
  tripId: string;
  score: ReadinessScoreBreakdown;
  findings: ReadinessScoreFinding[];
  risks: ReadinessScoreRisk[];
  summary: {
    totalFindings: number;
    blockers: number;
    warnings: number;
    suggestions: number;
    highRisks: number;
    mediumRisks: number;
    lowRisks: number;
  };
  calculatedAt: string;
}

// ==================== 修复选项类型 ====================

/**
 * 修复选项请求
 */
export interface RepairOptionsRequest {
  tripId: string;
  blockerId: string;
}

/**
 * 修复选项
 */
export interface RepairOption {
  id: string;
  title: string;
  description: string;
  cost?: number;
  impact: 'high' | 'medium' | 'low';
  timeEstimate?: string;
  actionType?: string;
  metadata?: Record<string, any>;
}

/**
 * 修复选项响应
 */
export interface RepairOptionsResponse {
  blockerId: string;
  blockerMessage?: string;
  options: RepairOption[];
}

/**
 * 坐标点
 */
export interface Coordinates {
  lat: number;
  lng: number;
}

/**
 * 地图边界
 */
export interface MapBounds {
  northeast: Coordinates;
  southwest: Coordinates;
}

/**
 * POI 覆盖状态
 */
export type PoiCoverageStatus = 'covered' | 'partial' | 'uncovered';

/**
 * 路段覆盖状态
 */
export type SegmentCoverageStatus = 'covered' | 'warning' | 'blocked';

/**
 * 证据类型
 */
export type EvidenceType = 
  | 'opening_hours'
  | 'weather'
  | 'road_closure'
  | 'booking_confirmation'
  | 'permit'
  | 'other';

/**
 * 危险/风险类型
 */
export interface SegmentHazard {
  type: string;
  severity: 'high' | 'medium' | 'low';
  message: string;
}

/**
 * POI 覆盖数据
 */
export interface PoiCoverage {
  id: string;
  day: number;
  order: number;
  name: string;
  type: string;
  coordinates: Coordinates;
  coverageStatus: PoiCoverageStatus;
  evidenceCount: number;
  evidenceTypes?: EvidenceType[];
  missingEvidence?: EvidenceType[];
  metadata?: any; // 保存原始 Place.metadata 引用，用于获取证据时间戳和来源
}

/**
 * 路段覆盖数据
 */
export interface SegmentCoverage {
  id: string;
  fromPoiId: string;
  toPoiId: string;
  day: number;
  distance: number; // km
  duration: number; // minutes
  routeType: 'driving' | 'walking' | 'transit' | 'cycling';
  coverageStatus: SegmentCoverageStatus;
  polyline: string; // Google Encoded Polyline / Mapbox polyline
  hazards: SegmentHazard[];
}

/**
 * 证据状态
 */
export interface EvidenceStatus {
  type: EvidenceType;
  status: 'fetched' | 'missing' | 'fetching' | 'failed';
  lastUpdated?: string;
  source?: string;
}

/**
 * 覆盖缺口
 */
export interface CoverageGap {
  id: string;
  type: 'poi' | 'segment';
  relatedId: string;
  coordinates: Coordinates;
  severity: 'high' | 'medium' | 'low';
  message: string;
  missingEvidence?: EvidenceType[];
  hazards?: string[];
  hazardType?: string; // 用于去重的危险类型
  evidenceStatus?: EvidenceStatus[]; // 证据获取状态
  affectedDays?: number[]; // 受影响的天数
  affectedPois?: string[]; // 受影响的 POI IDs
}

/**
 * 覆盖摘要
 */
export interface CoverageSummary {
  totalPois: number;
  coveredPois: number;
  partialPois: number;
  uncoveredPois: number;
  totalSegments: number;
  coveredSegments: number;
  warningSegments: number;
  blockedSegments: number;
  totalGaps: number;
  coverageRate: number; // 0-1
}

/**
 * 覆盖地图数据响应
 */
export interface CoverageMapData {
  tripId: string;
  bounds: MapBounds;
  center: Coordinates;
  zoom: number;
  pois: PoiCoverage[];
  segments: SegmentCoverage[];
  gaps: CoverageGap[];
  summary: CoverageSummary;
  // 优化后的数据
  deduplicatedWarnings?: CoverageGap[]; // 去重后的警告列表
  warningsBySeverity?: {
    high: CoverageGap[];
    medium: CoverageGap[];
    low: CoverageGap[];
  };
  evidenceStatusSummary?: {
    total: number;
    fetched: number;
    missing: number;
    fetching: number;
    failed: number;
  };
  calculatedAt: string; // 计算时间戳
  dataFreshness?: {
    weather?: string; // 天气数据最后更新时间
    roadClosure?: string; // 道路封闭数据最后更新时间
    openingHours?: string; // 开放时间数据最后更新时间
  };
}
