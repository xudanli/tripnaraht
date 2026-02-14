import { RailPassProfile, RailSegment, ReservationTask } from '../interfaces/railpass.interface';
import { ReservationDecisionEngineService } from './reservation-decision-engine.service';
import { ReservationOrchestrationService } from './reservation-orchestration.service';
import { TravelDayCalculationEngineService } from './travel-day-calculation-engine.service';
interface RegeneratePlanInput {
    passProfile: RailPassProfile;
    segments: RailSegment[];
    reservationTasks: ReservationTask[];
    strategy: 'MORE_STABLE' | 'MORE_ECONOMICAL' | 'MORE_AFFORDABLE' | 'CUSTOM';
    customParams?: {
        avoidMandatoryReservations?: boolean;
        minimizeTravelDays?: boolean;
        maxReservationFee?: number;
    };
}
export interface RegeneratePlanResult {
    segments: RailSegment[];
    reservationTasks: ReservationTask[];
    changes: Array<{
        segmentId: string;
        changeType: 'REMOVED' | 'REPLACED' | 'SHIFTED_TIME' | 'REPLACED_WITH_ALTERNATIVE';
        oldSegment?: RailSegment;
        newSegment?: RailSegment;
        reason: string;
    }>;
    metrics: {
        totalSegmentsBefore: number;
        totalSegmentsAfter: number;
        reservationTasksBefore: number;
        reservationTasksAfter: number;
        mandatoryReservationsRemoved?: number;
        travelDaysSaved?: number;
        costChangeEur?: number;
    };
    explanation: string;
}
export declare class PlanRegenerationService {
    private readonly reservationEngine;
    private readonly reservationOrchestrator;
    private readonly travelDayCalculator;
    private readonly logger;
    constructor(reservationEngine: ReservationDecisionEngineService, reservationOrchestrator: ReservationOrchestrationService, travelDayCalculator: TravelDayCalculationEngineService);
    regeneratePlan(input: RegeneratePlanInput): Promise<RegeneratePlanResult>;
    private regenerateForStability;
    private regenerateForEconomy;
    private regenerateForAffordability;
    private regenerateCustom;
    private estimateDirectTicketPrice;
    private shiftTime;
}
export {};
