/** 路线对比表维度 — Compare 页 SSOT（与 candidate.metrics 字段对齐） */

export interface ExplorationCompareDimensionDef {
  key: string;
  label: string;
  /** true = 数值越大越好 */
  higherIsBetter: boolean;
}

export const EXPLORATION_COMPARE_DIMENSIONS: ExplorationCompareDimensionDef[] = [
  { key: 'exploration', label: '探索感', higherIsBetter: true },
  { key: 'drivingIntensity', label: '驾驶强度', higherIsBetter: false },
  { key: 'experienceDensity', label: '体验密度', higherIsBetter: true },
  { key: 'stayStability', label: '住宿稳定', higherIsBetter: true },
  { key: 'flexibility', label: '灵活性', higherIsBetter: true },
  { key: 'uncertainty', label: '不确定性', higherIsBetter: false },
];

export function buildCompareDimensionsView() {
  return EXPLORATION_COMPARE_DIMENSIONS;
}
