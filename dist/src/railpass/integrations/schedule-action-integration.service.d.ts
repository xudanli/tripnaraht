import { RailPassProfile, RailSegment, ReservationTask } from '../interfaces/railpass.interface';
import { ComplianceValidatorService } from '../services/compliance-validator.service';
import { ReservationOrchestrationService } from '../services/reservation-orchestration.service';
import { ReservationDecisionEngineService } from '../services/reservation-decision-engine.service';
import { RailPassConstraintsService } from '../constraints/railpass-constraints.service';
export interface ReservationRevalidationResult {
    needsRevalidation: boolean;
    valid: boolean;
    newViolations: Array<{
        code: string;
        severity: 'error' | 'warning';
        message: string;
        segmentId?: string;
    }>;
    affectedTasks: Array<{
        taskId: string;
        segmentId: string;
        oldStatus: string;
        newStatus: string;
        reason: string;
    }>;
    recommendedActions: string[];
}
export declare class ScheduleActionIntegrationService {
    private readonly complianceValidator;
    private readonly reservationOrchestrator;
    private readonly reservationEngine;
    private readonly constraintsService;
    private readonly logger;
    constructor(complianceValidator: ComplianceValidatorService, reservationOrchestrator: ReservationOrchestrationService, reservationEngine: ReservationDecisionEngineService, constraintsService: RailPassConstraintsService);
    revalidateReservationFeasibility(args: {
        passProfile: RailPassProfile;
        oldSegments: RailSegment[];
        newSegments: RailSegment[];
        oldReservationTasks: ReservationTask[];
    }): Promise<ReservationRevalidationResult>;
    private detectSegmentChanges;
    private isSegmentModified;
    private identifyAffectedTasks;
    private generateRecommendations;
}
