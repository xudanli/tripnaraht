/**
 * Travel World Model - Experience Layer
 *
 * 体验向量：Place 承载的体验类型权重 (0-1)
 * 用于候选检索多样性采样、路径优化体验平衡
 *
 * @see docs/TRAVEL_WORLD_MODEL_EXECUTION_PLAN.md
 */

export type ExperienceType =
  | 'culture'
  | 'nature'
  | 'food'
  | 'nightlife'
  | 'shopping'
  | 'photography';

export interface ExperienceVector {
  culture?: number;
  nature?: number;
  food?: number;
  nightlife?: number;
  shopping?: number;
  photography?: number;
}

export const EXPERIENCE_TYPES: ExperienceType[] = [
  'culture',
  'nature',
  'food',
  'nightlife',
  'shopping',
  'photography',
];
