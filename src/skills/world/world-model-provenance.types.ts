/**
 * 世界模型数据源契约（投产兜底：避免空数组被误读为「全绿」）
 */

export type DataProvenance = 'NONE' | 'LIVE' | 'STATIC_INFERRED' | 'PLACEHOLDER';

export interface WorldModelMeta {
  physicalRealityIncomplete?: boolean;
  /** ISO 3166-1 alpha-2 */
  countryCode?: string;
  /** 物理数据文件区域前缀（如 iceland、lofoten） */
  dataRegion?: string;
  subregion?: string;
  physicalDataProvenance?: DataProvenance;
  /** OPTIMIZE 落盘：路由骨架已锁定，后续仅允许 Slot 级微调 */
  isRouteTopologyLocked?: boolean;
  route_skeleton_locked?: boolean;
  lockedSegmentIds?: string[];
  routeSkeletonSignature?: string;
}
