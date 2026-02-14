import { ActivityCandidate } from '../world-model';
import { TripPlan } from '../plan-model';
import { DEMElevationService } from '../../dem/services/dem-elevation.service';
export interface ActivityRiskScore {
    activityId: string;
    totalRiskScore: number;
    altitudeRisk: number;
    slopeRisk: number;
    consecutiveAscentRisk: number;
    riskFlags: Array<{
        type: string;
        severity: 'LOW' | 'MEDIUM' | 'HIGH';
        message: string;
    }>;
}
export interface PlanRiskScore {
    totalRiskScore: number;
    consecutiveHighAltitudeDays: number;
    consecutiveAscent: number;
    steepConcentratedSections: number;
    dailyRiskScores: Array<{
        day: number;
        date: string;
        riskScore: number;
        maxElevation: number;
        totalAscent: number;
        riskFlags: Array<{
            type: string;
            severity: 'LOW' | 'MEDIUM' | 'HIGH';
            message: string;
        }>;
    }>;
    riskFlags: Array<{
        type: string;
        severity: 'LOW' | 'MEDIUM' | 'HIGH';
        message: string;
    }>;
}
export interface RiskScoringConfig {
    highAltitudeThreshold?: number;
    consecutiveHighAltitudeDaysThreshold?: number;
    consecutiveAscentThreshold?: number;
    steepSlopeThreshold?: number;
    steepSectionMinLength?: number;
}
export declare class DEMRiskScoringService {
    private readonly demElevationService?;
    private readonly logger;
    constructor(demElevationService?: DEMElevationService);
    calculateActivityRiskScore(activity: ActivityCandidate, previousElevation?: number, config?: RiskScoringConfig): Promise<ActivityRiskScore>;
    calculatePlanRiskScore(plan: TripPlan, routeSegmentation?: any, config?: RiskScoringConfig): Promise<PlanRiskScore>;
    getRiskWeightForDrDre(activity: ActivityCandidate, previousElevation?: number, config?: RiskScoringConfig): Promise<number>;
    getRiskWeightForNeptune(activity: ActivityCandidate, previousElevation?: number, config?: RiskScoringConfig): Promise<number>;
}
