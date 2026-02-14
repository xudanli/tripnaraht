import { TripDecisionEngineService } from './trip-decision-engine.service';
import { StrategyOrchestratorService } from './services/strategy-orchestrator.service';
import { WorldModelContext, RoutePlanDraft } from './shared/world-model.types';
import { DecisionLogStorageService } from './services/decision-log-storage.service';
import { DecisionStatsService } from './services/decision-stats.service';
import { DecisionLogClusteringService } from './evaluation/decision-log-clustering.service';
import { AdminDecisionLogListQueryDto, AdminDecisionStatsQueryDto } from './dto/admin-decision.dto';
import { ConstraintConflictResolver } from './constraints/constraint-conflict-resolver.service';
import { ConstraintChecker } from './constraints/constraint-checker';
import { MultiPlanGenerator } from './services/multi-plan-generator.service';
import { DetectConflictsRequestDto, GenerateMultiplePlansRequestDto } from './dto/constraint-dsl.dto';
import { TripWorldState } from './world-model';
import { TripPlan } from './plan-model';
import { FeedbackCollectorService } from './feedback/feedback-collector.service';
import { QualityAssessorService } from './feedback/quality-assessor.service';
import { MemoryUpdaterService } from './feedback/memory-updater.service';
import { PlanVariantFeedbackDto, ConflictFeedbackDto, DecisionQualityFeedbackDto, BatchFeedbackDto, FeedbackStatsQueryDto } from './dto/feedback.dto';
export declare class DecisionController {
    private readonly decisionEngine;
    private readonly strategyOrchestrator;
    private readonly decisionLogStorage;
    private readonly decisionStats;
    private readonly clusteringService;
    private readonly conflictResolver?;
    private readonly constraintChecker?;
    private readonly multiPlanGenerator?;
    private readonly feedbackCollector?;
    private readonly qualityAssessor?;
    private readonly memoryUpdater?;
    private readonly logger;
    constructor(decisionEngine: TripDecisionEngineService, strategyOrchestrator: StrategyOrchestratorService, decisionLogStorage: DecisionLogStorageService, decisionStats: DecisionStatsService, clusteringService: DecisionLogClusteringService, conflictResolver?: ConstraintConflictResolver, constraintChecker?: ConstraintChecker, multiPlanGenerator?: MultiPlanGenerator, feedbackCollector?: FeedbackCollectorService, qualityAssessor?: QualityAssessorService, memoryUpdater?: MemoryUpdaterService);
    validateSafety(body: {
        tripId: string;
        plan: RoutePlanDraft;
        worldContext: WorldModelContext;
    }): Promise<import("../../common/dto/standard-response.dto").StandardResponse<any>>;
    adjustPacing(body: {
        tripId: string;
        plan: RoutePlanDraft;
        worldContext: WorldModelContext;
    }): Promise<import("../../common/dto/standard-response.dto").StandardResponse<any>>;
    replaceNodes(body: {
        tripId: string;
        plan: RoutePlanDraft;
        worldContext: WorldModelContext;
        unavailableNodes: Array<{
            nodeId: string;
            reason: string;
        }>;
    }): Promise<import("../../common/dto/standard-response.dto").StandardResponse<any>>;
    private generateAlternativeRoutes;
    getAdminLogs(query: AdminDecisionLogListQueryDto): Promise<import("../../common/dto/standard-response.dto").StandardResponse<any>>;
    getAdminLogDetail(id: string): Promise<import("../../common/dto/standard-response.dto").StandardResponse<any>>;
    getAdminStats(query: AdminDecisionStatsQueryDto): Promise<import("../../common/dto/standard-response.dto").StandardResponse<any>>;
    getAdminAnalytics(startDate?: string, endDate?: string, countryCode?: string): Promise<import("../../common/dto/standard-response.dto").StandardResponse<any>>;
    exportAdminLogs(body: {
        format?: 'json' | 'csv';
        filters?: any;
    }): Promise<import("../../common/dto/standard-response.dto").StandardResponse<any>>;
    detectConflicts(body: DetectConflictsRequestDto): Promise<import("../../common/dto/standard-response.dto").StandardResponse<any>>;
    checkConstraintsWithExplanation(body: {
        state: TripWorldState;
        plan: TripPlan;
    }): Promise<import("../../common/dto/standard-response.dto").StandardResponse<any>>;
    generateMultiplePlans(body: GenerateMultiplePlansRequestDto): Promise<import("../../common/dto/standard-response.dto").StandardResponse<any>>;
    submitPlanVariantFeedback(dto: PlanVariantFeedbackDto): Promise<import("../../common/dto/standard-response.dto").StandardResponse<any>>;
    submitConflictFeedback(dto: ConflictFeedbackDto): Promise<import("../../common/dto/standard-response.dto").StandardResponse<any>>;
    submitDecisionQualityFeedback(dto: DecisionQualityFeedbackDto): Promise<import("../../common/dto/standard-response.dto").StandardResponse<any>>;
    submitBatchFeedback(dto: BatchFeedbackDto): Promise<import("../../common/dto/standard-response.dto").StandardResponse<any>>;
    getFeedbackStats(query: FeedbackStatsQueryDto): Promise<import("../../common/dto/standard-response.dto").StandardResponse<any>>;
}
