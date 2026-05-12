/**
 * 极光「机会域」（Observation Opportunity）— 与可行性（blocked/marginal/feasible）正交。
 *
 * Aurora ≠ weather：此处表达的是夜间可观测效用与追逐策略，而非 daytime condition。
 */

import type { ISODate, ISOTime } from './aurora-night-signals.types';

export type AuroraObservationTier = 'LOW' | 'MEDIUM' | 'HIGH' | 'EXCEPTIONAL';

export type AuroraMobilityRecommendation = 'STAY' | 'MOVE_SOUTH' | 'MOVE_INLAND';

/**
 * 单日极光追逐 / 夜间观测机会表面的一点（utility field）。
 */
export interface AuroraOpportunitySignal {
  date: ISODate;
  /** 0–1：综合几何磁活动与局地净空的机会强度 */
  opportunityScore: number;
  /** 对 score 的信心（数据完整度、锚点是否可靠） */
  confidence: number;
  /** 本地墙上时钟下的推荐守候窗（与 policies.daylightUtcOffset / 目的地 TZ 一致时使用） */
  recommendedObservationWindow?: {
    start: ISOTime;
    end: ISOTime;
  };
  /** 相对当前锚点的夜间机动建议 */
  mobilityRecommendation?: AuroraMobilityRecommendation;
  /** 走廊级偏好标签（供 Neptune / Abu 候选扩展） */
  regionalPreference?: string[];
  observationTier: AuroraObservationTier;
}
