import type { ObjectiveVector } from './objective-vector.types';

const KEYS: (keyof ObjectiveVector)[] = [
  'satisfaction',
  'efficiency',
  'cost',
  'fatigue',
  'experience',
  'risk',
];

/** A 支配 B：A 所有维度 ≥ B 且至少一维严格更优（最大化问题）。 */
export function dominates(a: ObjectiveVector, b: ObjectiveVector): boolean {
  let geAll = true;
  let strict = false;
  for (const k of KEYS) {
    if (a[k] < b[k]) geAll = false;
    if (a[k] > b[k]) strict = true;
  }
  return geAll && strict;
}

/**
 * 返回非支配解集（Pareto 前沿）。同目标向量可能均保留。
 */
export function computeParetoFront<T extends { objectives: ObjectiveVector }>(items: T[]): T[] {
  if (items.length <= 1) return [...items];
  return items.filter(
    (item) => !items.some((other) => other !== item && dominates(other.objectives, item.objectives)),
  );
}
