/**
 * 路网在世界 SSOT 中的规范状态（四档收口）。
 * 上游 RoadAccessState / 字符串态统一映射到此，再写入 `ConstraintField.state`。
 */
export type CanonicalRoadWorldState =
  | 'OPEN'
  | 'DEGRADED'
  | 'RESTRICTED'
  | 'CLOSED';
