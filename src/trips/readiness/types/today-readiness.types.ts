import type { ReadinessScoreBreakdown, ReadinessScoreFinding } from './coverage-map.types';

/** 行中「今日就绪」快照 — 仅评估指定 dayNumber 的可执行性 */
export interface TodayReadinessSnapshot {
  dayNumber: number;
  date: string;
  status: 'block' | 'warn' | 'pass';
  score: number;
  summary: {
    blockers: number;
    must: number;
    should: number;
  };
  dimensions: Pick<
    ReadinessScoreBreakdown,
    | 'entryTransit'
    | 'healthInsurance'
    | 'gearPacking'
    | 'bookingsCredentials'
    | 'logisticsComms'
    | 'emergency'
  >;
  topFindings: Array<
    Pick<ReadinessScoreFinding, 'id' | 'type' | 'category' | 'message' | 'actionRequired' | 'severity'>
  >;
  readinessPhase: 'in_trip';
  calculatedAt: string;
  /** 非今日项已折叠；完整行前清单见 /readiness */
  scopeNote: { zh: string; en: string };
}
