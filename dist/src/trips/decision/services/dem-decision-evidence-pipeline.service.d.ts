import { TripPlan } from '../plan-model';
import { DEMElevationService } from '../../dem/services/dem-elevation.service';
import { DEMEffortMetadataService } from '../../dem/services/dem-effort-metadata.service';
import { DemEvidencePipelineResult } from '../interfaces/dem-decision-evidence.interface';
export declare class DemDecisionEvidencePipelineService {
    private readonly demElevationService?;
    private readonly demEffortService?;
    private readonly logger;
    constructor(demElevationService?: DEMElevationService, demEffortService?: DEMEffortMetadataService);
    generateEvidenceForPlan(plan: TripPlan, userConstraints?: {
        maxDailyAscentM?: number;
        maxElevationM?: number;
        maxSlopePct?: number;
        rollingAscent3DaysThreshold?: number;
    }): Promise<DemEvidencePipelineResult>;
    private generateEvidenceForDay;
    private inferElevationProfile;
    private calculateFatigueIndex;
    private detectRollingFatigue;
    private calculateCorridorQuality;
    private calculateElevationVariance;
    private calculateViewExposureScore;
    private calculateSlopePenalty;
    private generateExplainableFailure;
    validatePlanHasEvidence(plan: TripPlan, evidenceResult: DemEvidencePipelineResult): {
        isValid: boolean;
        reason?: string;
    };
}
