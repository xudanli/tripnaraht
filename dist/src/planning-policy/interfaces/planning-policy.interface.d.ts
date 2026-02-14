import { InterestProfile, MobilityProfile } from '../../trips/interfaces/pacing-config.interface';
import { TransitSegment } from './transit-segment.interface';
export { InterestProfile, MobilityProfile } from '../../trips/interfaces/pacing-config.interface';
export type TripType = 'BUSINESS' | 'LEISURE' | 'FAMILY' | 'BACKPACKING';
export type BudgetSensitivity = 'LOW' | 'MEDIUM' | 'HIGH';
export type TimeSensitivity = 'LOW' | 'MEDIUM' | 'HIGH';
export type RiskTolerance = 'LOW' | 'MEDIUM' | 'HIGH';
export type PlanStabilityPreference = 'LOW' | 'MEDIUM' | 'HIGH';
export interface TravelerDto {
    type: InterestProfile;
    mobilityTag: MobilityProfile;
    weight?: number;
}
export interface UserContext {
    hasLuggage: boolean;
    hasElderly: boolean;
    isRaining: boolean;
    hasLimitedMobility: boolean;
    isMovingDay: boolean;
    budgetSensitivity: BudgetSensitivity;
    timeSensitivity: TimeSensitivity;
    currentCity?: string;
    targetCity?: string;
    riskTolerance?: RiskTolerance;
    planStabilityPreference?: PlanStabilityPreference;
}
export interface PacingConfig {
    hpMax: number;
    regenRate: number;
    walkSpeedMultiplier: number;
    stairPenalty: number;
    forcedRestIntervalMin: number;
    terrainRules: {
        forbidStairs: boolean;
        wheelchairOnly: boolean;
        maxContinuousWalkMin: number;
        maxDailyWalkMin: number;
    };
}
export interface HardConstraints {
    requireWheelchairAccess: boolean;
    forbidStairs: boolean;
    maxTransfers: number;
    maxSingleWalkMin: number;
    maxTotalWalkMinPerDay: number;
    mustHaveRestroomEveryMin: number;
}
export interface SoftWeights {
    tagAffinity: Record<string, number>;
    diversityPenalty: number;
    mustSeeBoost: number;
    valueOfTimePerMin: number;
    walkPainPerMin: number;
    transferPain: number;
    stairPain: number;
    crowdPainPerMin: number;
    rainWalkMultiplier: number;
    luggageTransitPenalty: number;
    elderlyTransferMultiplier: number;
    planChangePenalty: number;
    overtimePenaltyPerMin: number;
}
export interface EdgeCostInput {
    segment: TransitSegment;
    policy: PlanningPolicy;
}
export interface ItineraryCostInput {
    totalTravelMin: number;
    totalWalkMin: number;
    totalTransfers: number;
    totalQueueMin: number;
    totalStairsCount: number;
    overtimeMin: number;
    planChangeCount?: number;
}
export interface CostModel {
    edgeCost(input: EdgeCostInput): number;
    itineraryCost(input: ItineraryCostInput, policy: PlanningPolicy): number;
}
export interface PlanningPolicy {
    pacing: PacingConfig;
    constraints: HardConstraints;
    weights: SoftWeights;
    context: UserContext;
    derived: {
        groupInterestMix: Record<InterestProfile, number>;
        groupMobilityWorst: MobilityProfile;
    };
}
