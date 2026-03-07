/**
 * Travel World Model - Experience Vector Service
 *
 * 从 Place 的 metadata/canonicalType/tags/category 计算或补全 experienceVector
 * 降级：无数据时返回空对象或基于 category 的默认值
 *
 * @see docs/TRAVEL_WORLD_MODEL_EXECUTION_PLAN.md
 */

import { Injectable } from '@nestjs/common';
import type { ExperienceVector } from '../interfaces/experience-vector.interface';

export interface PlaceForExperienceVector {
  category?: string;
  metadata?: {
    experienceVector?: ExperienceVector;
    canonicalType?: string;
    rawTags?: string[];
  };
}

@Injectable()
export class ExperienceVectorService {
  /**
   * 获取或计算 experienceVector
   * 优先使用已存储的 experienceVector，否则从 canonicalType/tags/category 推断
   */
  getOrCompute(place: PlaceForExperienceVector): ExperienceVector {
    const stored = place.metadata?.experienceVector;
    if (stored && this.hasAnyValue(stored)) {
      return stored;
    }
    return this.inferFromPlace(place);
  }

  /**
   * 计算两个 experienceVector 的余弦相似度 (0-1)
   * 用于多样性采样：相似度高的 Place 应分散
   */
  similarity(a: ExperienceVector, b: ExperienceVector): number {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof ExperienceVector>;
    if (keys.size === 0) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (const k of keys) {
      const va = (a[k] ?? 0) as number;
      const vb = (b[k] ?? 0) as number;
      dot += va * vb;
      normA += va * va;
      normB += vb * vb;
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom > 0 ? Math.min(1, Math.max(0, dot / denom)) : 0;
  }

  /**
   * 获取主导体验类型（权重最高的）
   */
  dominantType(vec: ExperienceVector): keyof ExperienceVector | null {
    let max = 0;
    let key: keyof ExperienceVector | null = null;
    for (const [k, v] of Object.entries(vec)) {
      const val = v as number;
      if (val > max) {
        max = val;
        key = k as keyof ExperienceVector;
      }
    }
    return key;
  }

  private hasAnyValue(vec: ExperienceVector): boolean {
    return Object.values(vec).some((v) => typeof v === 'number' && v > 0);
  }

  private inferFromPlace(place: PlaceForExperienceVector): ExperienceVector {
    const vec: ExperienceVector = {};
    const ct = (place.metadata?.canonicalType ?? '').toUpperCase();
    const tags = (place.metadata?.rawTags ?? []).join(' ').toLowerCase();
    const cat = (place.category ?? '').toUpperCase();

    // canonicalType 映射
    if (ct.includes('MUSEUM') || ct.includes('TEMPLE') || ct.includes('SHRINE')) {
      vec.culture = (vec.culture ?? 0) + 0.8;
    }
    if (ct.includes('PARK') || ct.includes('GARDEN') || ct.includes('MOUNTAIN')) {
      vec.nature = (vec.nature ?? 0) + 0.8;
    }
    if (ct.includes('RESTAURANT') || ct.includes('CAFE') || ct.includes('FOOD')) {
      vec.food = (vec.food ?? 0) + 0.9;
    }
    if (ct.includes('BAR') || ct.includes('NIGHTLIFE')) {
      vec.nightlife = (vec.nightlife ?? 0) + 0.9;
    }
    if (ct.includes('SHOP') || ct.includes('MALL') || ct.includes('MARKET')) {
      vec.shopping = (vec.shopping ?? 0) + 0.8;
    }
    if (ct.includes('VIEWPOINT') || ct.includes('OBSERVATORY') || ct.includes('TOWER')) {
      vec.photography = (vec.photography ?? 0) + 0.7;
    }

    // tags 关键词
    if (tags.includes('museum') || tags.includes('博物馆') || tags.includes('寺庙')) vec.culture = (vec.culture ?? 0) + 0.5;
    if (tags.includes('nature') || tags.includes('自然') || tags.includes('公园')) vec.nature = (vec.nature ?? 0) + 0.5;
    if (tags.includes('food') || tags.includes('美食') || tags.includes('餐厅')) vec.food = (vec.food ?? 0) + 0.5;
    if (tags.includes('night') || tags.includes('酒吧') || tags.includes('夜景')) vec.nightlife = (vec.nightlife ?? 0) + 0.5;
    if (tags.includes('shop') || tags.includes('购物') || tags.includes('商场')) vec.shopping = (vec.shopping ?? 0) + 0.5;
    if (tags.includes('photo') || tags.includes('摄影') || tags.includes('观景')) vec.photography = (vec.photography ?? 0) + 0.5;

    // category 默认
    if (cat === 'RESTAURANT') vec.food = (vec.food ?? 0) + 0.7;
    if (cat === 'ATTRACTION' && !vec.culture && !vec.nature) vec.culture = 0.5;
    if (cat === 'SHOPPING') vec.shopping = (vec.shopping ?? 0) + 0.7;

    // 归一化到 0-1
    const max = Math.max(...Object.values(vec).filter((v) => typeof v === 'number'), 0.01);
    const result: ExperienceVector = {};
    for (const [k, v] of Object.entries(vec)) {
      result[k as keyof ExperienceVector] = Math.min(1, (v as number) / max);
    }
    return result;
  }
}
