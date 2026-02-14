import { PlanningWorkbenchAgentService, PlanningWorkbenchRequest } from './services/planning-workbench-agent.service';
import { BudgetEvaluationService } from '../trips/services/budget-evaluation.service';
import { TripBudgetService, BudgetConstraint } from '../trips/services/trip-budget.service';
import { PlanningWorkbenchAdminService } from './services/planning-workbench-admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { DataSourceRouterService } from '../data-contracts/services/data-source-router.service';
import { PlacesService } from '../places/places.service';
import { EvidenceFetchTaskService } from '../trips/services/evidence-fetch-task.service';
import { PlanningWorkbenchTaskService } from './services/planning-workbench-task.service';
import { TripSuggestionsService } from '../trips/services/trip-suggestions.service';
export declare class PlanningWorkbenchController {
    private readonly planningWorkbenchAgent;
    private readonly budgetEvaluationService;
    private readonly tripBudgetService;
    private readonly planningWorkbenchAdminService;
    private readonly prisma?;
    private readonly dataSourceRouter?;
    private readonly placesService?;
    private readonly evidenceFetchTaskService?;
    private readonly planningWorkbenchTaskService?;
    private readonly tripSuggestionsService?;
    private readonly logger;
    constructor(planningWorkbenchAgent: PlanningWorkbenchAgentService, budgetEvaluationService: BudgetEvaluationService, tripBudgetService: TripBudgetService, planningWorkbenchAdminService: PlanningWorkbenchAdminService, prisma?: PrismaService, dataSourceRouter?: DataSourceRouterService, placesService?: PlacesService, evidenceFetchTaskService?: EvidenceFetchTaskService, planningWorkbenchTaskService?: PlanningWorkbenchTaskService, tripSuggestionsService?: TripSuggestionsService);
    execute(request: PlanningWorkbenchRequest): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getState(planId: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getTripWorkbench(tripId: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getTripPlans(tripId: string, status?: string, limit?: number, offset?: number): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getPlan(planId: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    comparePlans(body: {
        planIds: string[];
        compareFields?: string[];
    }): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    adjustPlan(planId: string, body: {
        adjustments: Array<{
            type: string;
            data: any;
        }>;
        regenerate?: boolean;
    }): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    commitPlan(planId: string, body: {
        tripId: string;
        options?: {
            partialCommit?: boolean;
            commitDays?: number[];
        };
    }): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    evaluateBudget(body: {
        planId: string;
        tripId: string;
        estimatedCost: number;
        categoryBreakdown: {
            accommodation: number;
            transportation: number;
            food: number;
            activities: number;
            other: number;
        };
        budgetConstraint: BudgetConstraint;
    }): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getBudgetDecisionLog(planId: string, tripId: string, limit?: number, offset?: number): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getPlanBudgetEvaluation(planId: string, tripId: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    applyBudgetOptimization(body: {
        planId: string;
        tripId: string;
        optimizationIds: string[];
        autoCommit?: boolean;
    }): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    autoOptimize(body: {
        tripId: string;
        preview?: boolean;
        limit?: number;
    }): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getAdminSessions(query: any): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getAdminSessionStats(query: any): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getAdminSessionDetail(id: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getAdminPlans(query: any): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getAdminPlanDetail(id: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    fetchWeatherForTrip(tripId: string, placeIds?: string, forceRefresh?: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    fetchEvidenceForTrip(tripId: string, placeIds?: string, evidenceTypes?: string, forceRefresh?: string, async?: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    private executeFetchEvidenceAsync;
    getTaskProgress(taskId: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    cancelTask(taskId: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    executeAsync(request: PlanningWorkbenchRequest): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getPlanningWorkbenchTaskStatus(taskId: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    cancelPlanningWorkbenchTask(taskId: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    private executeTaskAsync;
}
