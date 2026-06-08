/** PRD 3.14 — 徒步场景 Layer 0 体能物理硬约束 */

export type PhysicalTierLevel = 1 | 2 | 3 | 4 | 5;

export interface RoutePhysicalProfile {
  tier: PhysicalTierLevel;
  tierLabel: string;
  /** 路线单日爬升极值（米） */
  maxDailyAscentM: number;
  /** 最高海拔（米） */
  maxAltitudeM: number;
  /** 重装负重极值（kg） */
  maxPackWeightKg: number;
  requiresHeavyPackCamping: boolean;
  /** 硬拦截阈值：申请人历史指标须 ≥ 路线极值 × ratio */
  interceptThresholdRatio: number;
}

/** 持久化于 user_travel_profile.extended_profile.trekking_fitness_baseline */
export interface TrekkingFitnessBaseline {
  maxDailyAscentM: number;
  maxAltitudeM: number;
  maxPackWeightKg: number;
  heavyPackCampingVerified: boolean;
  /** 近 30 天有氧训练次数（合规授权摘要） */
  recentAerobicSessions30d: number;
  source: 'trip_history' | 'questionnaire' | 'default';
  /** 脱敏行程实证标签，供队长审批透镜展示 */
  evidenceLabel?: string | null;
  updatedAt?: string;
  /** 行后体能降权次数 — 供 Decision DNA / 匹配降权 */
  hardTrekMatchPenaltyCount?: number;
}

export type TrekkingPhysicalFailureEventType =
  | 'route_rollback'
  | 'mid_trip_evacuation'
  | 'rescue_called'
  | 'member_fitness_collapse';

export interface TrekkingPhysicalFailureEventRecord {
  tripId: string;
  subjectUserId: string;
  eventType: TrekkingPhysicalFailureEventType;
  evidenceLabel?: string | null;
  at: string;
}

export interface PhysicalFitnessFitReportView {
  fitPercent: number;
  headline: string;
  lines: Array<{ status: 'ok' | 'warn' | 'fail'; label: string; detail: string }>;
  evidenceLabel: string | null;
  hardwareNotes: string[];
}

export interface PhysicalFitnessGateView {
  /** 本招募是否激活 Layer 0 物理熔断 */
  active: boolean;
  blocked: boolean;
  blockReason: string | null;
  routeTier: PhysicalTierLevel | null;
  routeTierLabel: string | null;
  /** HARD GATES 一行摘要，如 🏃 体能门槛：Level 4 · 重装进阶 */
  hardGateSummaryLine: string | null;
  hardGateHint: string | null;
  fitPercent: number | null;
  report: PhysicalFitnessFitReportView | null;
}

export interface PhysicalSurvivalQuizQuestionView {
  id: string;
  prompt: string;
  options: Array<{ id: string; label: string }>;
}
