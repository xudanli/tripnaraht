import { RailPassProfile, RailSegment, ReservationTask } from '../interfaces/railpass.interface';
import { ReservationDecisionEngineService } from '../services/reservation-decision-engine.service';
import { ReservationOrchestrationService } from '../services/reservation-orchestration.service';
export interface RailPassRobustnessMetrics {
    reservationFailureRisk: number;
    quotaRiskSegmentsCount: number;
    mandatoryReservationMissingCount: number;
    totalReservationFeeEstimate: {
        min: number;
        max: number;
        currency: string;
    };
    travelDayRisk?: {
        daysUsed: number;
        daysRemaining: number;
        nearLimit: boolean;
    };
    overallRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}
export declare class PlanningPolicyIntegrationService {
    private readonly reservationEngine;
    private readonly reservationOrchestrator;
    private readonly logger;
    constructor(reservationEngine: ReservationDecisionEngineService, reservationOrchestrator: ReservationOrchestrationService);
    evaluateRailPassRobustness(args: {
        passProfile: RailPassProfile;
        segments: RailSegment[];
        reservationTasks: ReservationTask[];
        travelDaysUsed?: number;
        travelDaysTotal?: number;
    }): Promise<RailPassRobustnessMetrics>;
    convertToRiskPenalty(metrics: RailPassRobustnessMetrics): number;
    generateRobustnessImprovements(metrics: RailPassRobustnessMetrics): string[];
}
