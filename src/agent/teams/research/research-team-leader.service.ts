import { Injectable, Logger, Optional } from '@nestjs/common';
import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import type { PhaseExecutorContext } from '../../../decision/kernel/interfaces/phase-executor.interface';
import { ResearchPipelineService } from './research-pipeline.service';
import { ResearchMemberRegistry } from './research-member.registry';
import { initResearchTeamState } from './research-team-state';
import { plannedResearchMembersForScopes } from './research-team-scope-planner';
import type { ResearchTeamResult, ResearchTeamAuditEntry } from './research-team.types';
import { buildTeamMergeSummary } from './research-team-merge-summary.util';
import { buildResearchConflictNegotiationReport } from './research-conflict-negotiation.util';
import { ResearchTeamBusService } from './research-team-bus.service';
import type { ResearchBudgetBucketsMap } from './research-team-bus.types';
import type { UserCognitiveProfile } from '../../memory/experience-replay/user-cognitive-profile.types';
import { extractTripTotalBudget, buildResearchBudgetBucketsFromTotal } from './research-team-budget-ledger.util';
import { readRealtimeRerollCount } from '../../memory/emotional-resonance/research-realtime-frustration.util';

/**
 * Research Team 调度入口（MAT 3.0）：单轨 Leader 拓扑 — prepare → Member → finalize；
 * 与 `ResearchPipelineService.runResearchPipeline` 步骤对齐，在此附加 Harness 审计。
 */
@Injectable()
export class ResearchTeamLeaderService {
  private readonly logger = new Logger(ResearchTeamLeaderService.name);

  constructor(
    private readonly researchPipeline: ResearchPipelineService,
    private readonly researchMemberRegistry: ResearchMemberRegistry,
    @Optional() private readonly researchTeamBus?: ResearchTeamBusService,
  ) {}

  /**
   * 5.0：将行程总预算按预设比例 + 4.0 认知轴微调切成各域 `ResearchBudgetBucket`（供总线 Assignment 锚定）。
   */
  divideBudgetIntoBuckets(totalBudget: number, profile?: UserCognitiveProfile): ResearchBudgetBucketsMap {
    return buildResearchBudgetBucketsFromTotal(totalBudget, profile);
  }

  /**
   * Kernel / Master 唯一入口：窄化上下文 → 规划成员 → 拓扑执行 → 合成结果与审计。
   */
  async run(
    dso: DecisionState,
    ctx: PhaseExecutorContext,
    priorData?: Record<string, unknown>,
  ): Promise<ResearchTeamResult> {
    const teamState = initResearchTeamState(ctx, priorData);
    try {
      const membersPlanned = plannedResearchMembersForScopes({
        researchMode: teamState.researchMode,
        scopes: teamState.researchScopesToRecompute,
      });
      const researchExecutionKind =
        teamState.researchMode === 'scoped_partial'
          ? 'SCOPED_PARTIAL'
          : teamState.researchMode === 'transport_only'
            ? 'TRANSPORT_ONLY'
            : 'FULL';

      const audit: ResearchTeamAuditEntry[] = [];

      const ws = await this.researchPipeline.prepareLeaderResearchWorkspace(dso, ctx);
      const tripRec =
        ws.effectiveTrip && typeof ws.effectiveTrip === 'object'
          ? (ws.effectiveTrip as Record<string, unknown>)
          : undefined;
      const tripTotalBudget = extractTripTotalBudget(tripRec);
      if (tripTotalBudget !== undefined && tripTotalBudget > 0) {
        ws.researchTripTotalBudget = tripTotalBudget;
        ws.researchBudgetBuckets = this.divideBudgetIntoBuckets(tripTotalBudget, ctx.userCognitiveProfile);
      }
      const scopeList = teamState.researchScopesToRecompute ?? [];
      const topologyPlan = this.researchMemberRegistry.buildTopologyPlanForResearchExecution({
        effectiveMode: ws.effectiveMode,
        scopesForTopology: ws.scopesForTopology,
        hasTrip: !!ctx.tripPlanRequest,
      });

      const planDetail: Record<string, unknown> = {
        request_id: teamState.requestId,
        research_mode: teamState.researchMode ?? 'full',
        research_execution_kind: researchExecutionKind,
        members_planned: membersPlanned,
        registry_member_ids: this.researchMemberRegistry.memberIdsForScopes(scopeList),
        scopes_to_recompute: scopeList,
        has_prior_research: teamState.hasPriorResearchData,
        has_rollback_snapshot: teamState.hasRollbackSnapshot,
        topology_plan: topologyPlan,
        leader_effective_mode: ws.effectiveMode,
        leader_scopes_for_topology: ws.scopesForTopology,
        research_trip_total_budget: ws.researchTripTotalBudget ?? null,
        research_budget_buckets: ws.researchBudgetBuckets ?? null,
      };
      const tPlan = Date.now();
      audit.push({
        at: new Date().toISOString(),
        member: 'ResearchTeamLeader',
        action: 'plan_members',
        duration_ms: Date.now() - tPlan,
        detail: planDetail,
      });

      const tTopo = Date.now();
      await this.researchPipeline.runTopologyPlanOnWorkspace(dso, ctx, ws, topologyPlan);
      const teamMergeSummary = buildTeamMergeSummary(ws.researchContextMergeLog, {
        globalReport: ws.globalFinancialReport,
        budgetShadowAlerts: ws.budgetShadowAlerts,
      });
      planDetail.team_merge_summary = teamMergeSummary;
      const conflictNegotiation = buildResearchConflictNegotiationReport({
        mergeLog: ws.researchContextMergeLog,
        teamMergeSummary,
        userCognitiveProfile: ctx.userCognitiveProfile,
        globalFinancialReport: ws.globalFinancialReport,
        researchTripTotalBudget: ws.researchTripTotalBudget,
        realtimeRerollCount: readRealtimeRerollCount(ws.researchData),
      });
      planDetail.conflict_negotiation = conflictNegotiation;
      planDetail.memory_replay = conflictNegotiation.memory_replay ?? null;
      audit.push({
        at: new Date().toISOString(),
        member: 'ResearchTeamLeader',
        action: 'run_member_topology',
        duration_ms: Date.now() - tTopo,
        detail: {
          request_id: teamState.requestId,
          topology_plan: topologyPlan,
          orchestration: 'leader_unified_prepare_topology_finalize',
          budget_shadow_alerts: ws.budgetShadowAlerts ?? [],
          budget_rerun_required: ws.budgetRerunRequired ?? false,
        },
      });

      const tFin = Date.now();
      const { researchData, environmentPatch } = await this.researchPipeline.finalizeLeaderResearchWorkspace(dso, ctx, ws);
      researchData.__research_conflict_negotiation = conflictNegotiation;
      audit.push({
        at: new Date().toISOString(),
        member: 'research_executor',
        action: 'finalize_workspace',
        duration_ms: Date.now() - tFin,
        detail: {
          request_id: teamState.requestId,
          research_execution_kind: researchExecutionKind,
          research_data_keys: Object.keys(researchData ?? {}),
        },
      });

      this.logger.debug(
        `[ResearchTeam] leader_topology requestId=${teamState.requestId} pre=${topologyPlan.preParallelSequential?.length ?? 0} parallel=${topologyPlan.parallel.length} sequential=${topologyPlan.sequential.length} keys=${Object.keys(researchData ?? {}).length}`,
      );

      return { researchData, environmentPatch, teamAuditLog: audit, conflictNegotiation };
    } finally {
      this.researchTeamBus?.finalizeRequest(teamState.requestId);
    }
  }
}
