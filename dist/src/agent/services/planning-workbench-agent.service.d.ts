import { PlanState, PlanContext, PlanSkeletonSet, OptionComparison } from '../../skills/plan/shared/plan-state.types';
import { ContextBuildSkill } from '../../skills/context/context-build.skill';
import { PlanArchitectGenerateSkeletonSkill } from '../../skills/plan/architect/plan-architect-generate-skeleton.skill';
import { PlanArchitectCompareOptionsSkill } from '../../skills/plan/architect/plan-architect-compare-options.skill';
import { PlanArchitectCommitOptionSkill } from '../../skills/plan/architect/plan-architect-commit-option.skill';
import { PlanBudgetEstimateBaselineSkill } from '../../skills/plan/budget/plan-budget-estimate-baseline.skill';
import { PlanBudgetDetectOverrunSkill } from '../../skills/plan/budget/plan-budget-detect-overrun.skill';
import { PlanTransitBuildTransferGraphSkill } from '../../skills/plan/transit/plan-transit-build-transfer-graph.skill';
import { PlanPaceComputeTimeWindowsSkill } from '../../skills/plan/pace/plan-pace-compute-time-windows.skill';
import { PlanPaceFatigueScoreSkill } from '../../skills/plan/pace/plan-pace-fatigue-score.skill';
import { PlanGatePrecheckSkill } from '../../skills/plan/gate/plan-gate-precheck.skill';
import { PlanGateRunThreeGuardiansSkill } from '../../skills/plan/gate/plan-gate-run-three-guardians.skill';
import { PlanConstraintsDetectConflictsSkill } from '../../skills/plan/constraints/plan-constraints-detect-conflicts.skill';
import { PlanLogAppendDecisionSkill } from '../../skills/plan/log/plan-log-append-decision.skill';
import { PersonaShellService, PersonaShellOutput } from './persona-shell.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StateStoreService } from '../../agent/infra/state-store.service';
import { DEMEffortMetadataService } from '../../trips/dem/services/dem-effort-metadata.service';
import { GeoFactsService } from '../../trips/readiness/services/geo-facts.service';
import { GeoCheckHazardZonesSkill } from '../../skills/geo/geo-check-hazard-zones.skill';
import { TripRunManagerService } from './trip-run-manager.service';
import { DecisionDraftStorageService } from '../../decision-draft/storage/decision-draft-storage.service';
import { GeoAgentService } from './domain-agents/geo-agent.service';
import { WeatherAgentService } from './domain-agents/weather-agent.service';
import { CostAgentService } from './domain-agents/cost-agent.service';
import { ExperienceAgentService } from './domain-agents/experience-agent.service';
export interface PlanningWorkbenchRequest {
    context: PlanContext;
    tripId?: string;
    existingPlanState?: PlanState;
    userAction?: 'generate' | 'compare' | 'commit' | 'adjust';
}
export interface PlanningWorkbenchResponse {
    planState: PlanState;
    uiOutput: {
        skeletonOptions?: PlanSkeletonSet;
        comparison?: OptionComparison;
        personas?: PersonaShellOutput;
        health?: {
            budget: 'healthy' | 'warning' | 'critical';
            pace: 'healthy' | 'warning' | 'critical';
            feasibility: 'healthy' | 'warning' | 'critical';
        };
        confirmations?: string[];
    };
}
export declare class PlanningWorkbenchAgentService {
    private readonly contextBuild?;
    private readonly architectGenerateSkeleton?;
    private readonly architectCompareOptions?;
    private readonly architectCommitOption?;
    private readonly budgetEstimateBaseline?;
    private readonly budgetDetectOverrun?;
    private readonly transitBuildTransferGraph?;
    private readonly paceComputeTimeWindows?;
    private readonly paceFatigueScore?;
    private readonly gatePrecheck?;
    private readonly gateRunThreeGuardians?;
    private readonly constraintsDetectConflicts?;
    private readonly logAppendDecision?;
    private readonly personaShell?;
    private readonly prisma?;
    private readonly stateStore?;
    private readonly tripRunManager?;
    private readonly decisionDraftStorage?;
    private readonly geoAgent?;
    private readonly weatherAgent?;
    private readonly costAgent?;
    private readonly experienceAgent?;
    private readonly demEffortMetadataService?;
    private readonly geoFactsService?;
    private readonly geoCheckHazardZonesSkill?;
    private readonly logger;
    private readonly geoFeaturesMaxConcurrency;
    constructor(contextBuild?: ContextBuildSkill, architectGenerateSkeleton?: PlanArchitectGenerateSkeletonSkill, architectCompareOptions?: PlanArchitectCompareOptionsSkill, architectCommitOption?: PlanArchitectCommitOptionSkill, budgetEstimateBaseline?: PlanBudgetEstimateBaselineSkill, budgetDetectOverrun?: PlanBudgetDetectOverrunSkill, transitBuildTransferGraph?: PlanTransitBuildTransferGraphSkill, paceComputeTimeWindows?: PlanPaceComputeTimeWindowsSkill, paceFatigueScore?: PlanPaceFatigueScoreSkill, gatePrecheck?: PlanGatePrecheckSkill, gateRunThreeGuardians?: PlanGateRunThreeGuardiansSkill, constraintsDetectConflicts?: PlanConstraintsDetectConflictsSkill, logAppendDecision?: PlanLogAppendDecisionSkill, personaShell?: PersonaShellService, prisma?: PrismaService, stateStore?: StateStoreService, tripRunManager?: TripRunManagerService, decisionDraftStorage?: DecisionDraftStorageService, geoAgent?: GeoAgentService, weatherAgent?: WeatherAgentService, costAgent?: CostAgentService, experienceAgent?: ExperienceAgentService, demEffortMetadataService?: DEMEffortMetadataService, geoFactsService?: GeoFactsService, geoCheckHazardZonesSkill?: GeoCheckHazardZonesSkill);
    execute(request: PlanningWorkbenchRequest): Promise<PlanningWorkbenchResponse>;
    private createInitialPlanState;
    private enrichSegmentsWithGeographicData;
    private extractRoutePointsFromSegment;
    private calculateSegmentCenter;
    private recordDecisionTraceAndExclusions;
    private analyzeExclusionReason;
    private inferCountryCode;
    private computeHealth;
    commitPlan(planId: string, tripId: string, options?: {
        partialCommit?: boolean;
        commitDays?: number[];
    }): Promise<{
        tripId: string;
        planId: string;
        committedAt: string;
        changes: {
            added: number;
            modified: number;
            removed: number;
        };
    }>;
    getPlanState(planId: string): Promise<{
        planId: string;
        planState: PlanState | null;
    }>;
    getTripWorkbench(tripId: string): Promise<{
        tripId: string;
        currentPlan?: {
            planId: string;
            planVersion: number;
            status: 'DRAFT' | 'PROPOSED' | 'NEED_CONFIRM' | 'LOCKED';
            planState: PlanState;
            uiOutput: PlanningWorkbenchResponse['uiOutput'];
            createdAt: string;
            updatedAt: string;
        };
        planHistory: Array<{
            planId: string;
            planVersion: number;
            status: string;
            createdAt: string;
            summary?: string;
        }>;
        workbenchStatus: 'DRAFT' | 'PROPOSED' | 'NEED_CONFIRM' | 'LOCKED';
        decisionProcess?: {
            draftId: string;
            decisionSteps: any[];
            userMode: 'toc' | 'expert' | 'studio';
        };
    }>;
    getTripPlans(tripId: string, options?: {
        status?: 'DRAFT' | 'PROPOSED' | 'NEED_CONFIRM' | 'LOCKED';
        limit?: number;
        offset?: number;
    }): Promise<{
        plans: Array<{
            planId: string;
            planVersion: number;
            status: 'DRAFT' | 'PROPOSED' | 'NEED_CONFIRM' | 'LOCKED';
            createdAt: string;
            updatedAt: string;
            summary?: {
                itemCount: number;
                days: number;
                budget?: {
                    total: number;
                    currency: string;
                };
                consolidatedDecision?: {
                    status: string;
                    summary: string;
                };
                personas?: {
                    abu?: {
                        verdict: string;
                    };
                    drdre?: {
                        verdict: string;
                    };
                    neptune?: {
                        verdict: string;
                    };
                };
            };
        }>;
        total: number;
        hasMore: boolean;
    }>;
    getPlan(planId: string): Promise<{
        planId: string;
        planVersion: number;
        tripId: string;
        status: 'DRAFT' | 'PROPOSED' | 'NEED_CONFIRM' | 'LOCKED';
        planState: PlanState;
        uiOutput: PlanningWorkbenchResponse['uiOutput'];
        createdAt: string;
        updatedAt: string;
        createdBy?: string;
    }>;
    comparePlans(planIds: string[], compareFields?: string[]): Promise<{
        plans: Array<{
            planId: string;
            planVersion: number;
            planState: PlanState;
            uiOutput: PlanningWorkbenchResponse['uiOutput'];
        }>;
        differences: Array<{
            field: string;
            plan1Value: any;
            plan2Value: any;
            impact: 'low' | 'medium' | 'high';
            description?: string;
        }>;
        summary: {
            bestBudget?: string;
            bestRoute?: string;
            bestTime?: string;
            recommendations?: string[];
        };
    }>;
    adjustPlan(planId: string, adjustments: Array<{
        type: string;
        data: any;
    }>, regenerate?: boolean): Promise<{
        newPlanId: string;
        newPlanVersion: number;
        planState: PlanState;
        uiOutput: PlanningWorkbenchResponse['uiOutput'];
        changes: Array<{
            type: string;
            description: string;
            impact: 'low' | 'medium' | 'high';
        }>;
    }>;
    private savePlan;
    getWorldModelData(context: PlanContext): Promise<{
        geo?: Awaited<ReturnType<GeoAgentService['analyzeTerrain']>>;
        weather?: Awaited<ReturnType<WeatherAgentService['getForecast']>>;
        cost?: Awaited<ReturnType<CostAgentService['estimateTripCost']>>;
        experience?: Awaited<ReturnType<ExperienceAgentService['assessHumanExecutability']>>;
    }>;
}
