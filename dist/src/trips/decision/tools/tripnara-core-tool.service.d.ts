import { StrategyOrchestratorService } from '../services/strategy-orchestrator.service';
import { ITripNaraCoreTool, TripNaraCoreToolInput, TripNaraCoreToolOutput } from './tripnara-core-tool.interface';
import { RouteDirectionsService } from '../../../route-directions/route-directions.service';
import { DemDecisionEvidencePipelineService } from '../services/dem-decision-evidence-pipeline.service';
import { PhysicalRealityRetrievalService } from '../../readiness/services/physical-reality-retrieval.service';
export declare class TripNaraCoreToolService implements ITripNaraCoreTool {
    private readonly orchestrator;
    private readonly routeDirectionsService?;
    private readonly demEvidencePipeline?;
    private readonly physicalRealityService?;
    private readonly logger;
    constructor(orchestrator: StrategyOrchestratorService, routeDirectionsService?: RouteDirectionsService, demEvidencePipeline?: DemDecisionEvidencePipelineService, physicalRealityService?: PhysicalRealityRetrievalService);
    execute(input: TripNaraCoreToolInput): Promise<TripNaraCoreToolOutput>;
    getDescription(): string;
    getSchema(): Record<string, any>;
    private validateInput;
    private buildWorldModelContext;
    private buildHumanCapabilityModel;
    private getRouteDirection;
    private buildPhysicalRealityModel;
    private identifyRegionFromCountryCode;
    private extractRouteCoordinates;
    private calculateAccessibilityScoreFromRiskLevel;
    private buildComplianceEvidence;
    private buildInitialPlan;
    private convertToToolOutput;
    private generateExplanation;
}
