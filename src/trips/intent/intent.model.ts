/**
 * Trip Intent — 结构化用户偏好（可编译为权重与软约束）
 */

export type MobilityPreference = 'LOW_DRIVE' | 'BALANCED' | 'ROAD_TRIP';

export type PacePreference = 'RELAXED' | 'NORMAL' | 'INTENSIVE';

export type RiskTolerance = 'LOW' | 'MEDIUM' | 'HIGH';

export interface TripIntent {
  readonly mobilityPreference: MobilityPreference;
  readonly pace: PacePreference;
  readonly riskTolerance: RiskTolerance;
  readonly experienceBias: {
    readonly nature: number;
    readonly driving: number;
    readonly city: number;
  };
}

export interface UserMessage {
  readonly text: string;
}

export interface TripContext {
  readonly region?: string;
  readonly tripDays?: number;
}
