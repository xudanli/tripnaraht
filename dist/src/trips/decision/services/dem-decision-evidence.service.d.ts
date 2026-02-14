import { TripPlan } from '../plan-model';
import { RouteDirectionData } from '../../../route-directions/interfaces/route-direction.interface';
import { DEMRouteSegmentationService, RouteSegmentation } from './dem-route-segmentation.service';
import { DEMDailyEnergyService } from './dem-daily-energy.service';
import { DemDecisionEvidence, DemEvidencePipelineResult } from '../interfaces/dem-decision-evidence.interface';
export declare class DemDecisionEvidenceService {
    private readonly demRouteSegmentationService;
    private readonly demDailyEnergyService;
    private readonly logger;
    constructor(demRouteSegmentationService: DEMRouteSegmentationService, demDailyEnergyService: DEMDailyEnergyService);
    generateEvidencePipeline(plan: TripPlan, routeDirection?: RouteDirectionData, routeSegmentation?: RouteSegmentation): Promise<DemEvidencePipelineResult>;
    private generateDecisionEvidence;
    private generateDayEvidence;
    private extractElevationProfileArray;
    private calculateMaxSlopeFromProfile;
    private calculateRollingAscent;
    private calculateFatigueIndex;
    private checkViolations;
    private generateExplanation;
    private generateMetadata;
    private detectRollingFatigue;
    private scoreCorridorQuality;
    private calculateViewExposure;
    private calculateElevationVariance;
    private calculateSlopePenalty;
    private generateExplainableFailure;
    validatePlanHasEvidence(plan: TripPlan, evidences: DemDecisionEvidence[]): {
        valid: boolean;
        reason?: string;
    };
}
