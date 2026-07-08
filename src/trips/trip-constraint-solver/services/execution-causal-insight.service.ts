import { Injectable, Logger, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { CanonicalCausalTraceService } from '../../../causal-protocol/services/canonical-causal-trace.service';
import { isTravelOrTransportProblem } from '../../../causal-protocol/adapters/iceland-causal-trace.adapter';
import { isDecisionGatewayUnifiedEnabled } from '../../../decision-runtime/gateway/config/decision-gateway.config';
import { DecisionEngineGatewayService } from '../../../decision-runtime/gateway/services/decision-engine-gateway.service';
import type { UnifiedDecisionProblemListItem } from '../../../decision-runtime/gateway/contracts/unified-decision-ui.types';
import type { EnvironmentEventSummary } from '../../in-trip-execution/types/environment-event.types';
import type { ExecutionCausalInsightDto } from '../types/trip-constraint-solver.types';
import { projectExecutionCausalInsight } from '../utils/execution-causal-insight.util';

@Injectable()
export class ExecutionCausalInsightService {
  private readonly logger = new Logger(ExecutionCausalInsightService.name);

  constructor(
    private readonly moduleRef: ModuleRef,
    @Optional() private readonly causalTrace?: CanonicalCausalTraceService,
  ) {}

  async resolve(input: {
    tripId: string;
    routeSummary?: string;
    environmentEvents: EnvironmentEventSummary[];
    dayNumber: number;
  }): Promise<ExecutionCausalInsightDto | undefined> {
    if (!this.causalTrace) return undefined;

    const travelProblem = await this.pickOpenTravelProblem(input.tripId);
    if (travelProblem) {
      const insight = await this.insightFromProblem(
        input.tripId,
        travelProblem,
        input.routeSummary,
      );
      if (insight) return insight;
    }

    return this.insightFromEnvironmentFallback(input);
  }

  private async pickOpenTravelProblem(
    tripId: string,
  ): Promise<UnifiedDecisionProblemListItem | undefined> {
    if (!isDecisionGatewayUnifiedEnabled()) return undefined;
    try {
      const gateway = this.moduleRef.get(DecisionEngineGatewayService, { strict: false });
      if (!gateway) return undefined;
      const list = await gateway.listProblems(tripId);
      const open = list.items.filter(
        (item) => !['RESOLVED', 'DISMISSED'].includes(item.workflowStatus),
      );
      const withGuardian = open.find((item) => item.guardianCausalStoryView?.headline);
      if (withGuardian) return withGuardian;
      return open.find(
        (item) =>
          isTravelOrTransportProblem({
            semanticKey: item.semanticKey,
            type: item.type,
            dimension: item.dimension,
          }) || item.dimension === 'SCHEDULE',
      );
    } catch (e: unknown) {
      this.logger.warn(
        `listProblems for execution causal insight failed trip=${tripId}: ${e instanceof Error ? e.message : e}`,
      );
      return undefined;
    }
  }

  private async insightFromProblem(
    tripId: string,
    problem: UnifiedDecisionProblemListItem,
    routeSummary?: string,
  ): Promise<ExecutionCausalInsightDto | undefined> {
    if (!this.causalTrace) return undefined;

    let guardianStory = problem.guardianCausalStoryView;
    let neutralStory = problem.causalStoryView;

    if (!guardianStory || !neutralStory) {
      try {
        const worldStateVersion = await this.causalTrace.resolveWorldStateVersion(tripId);
        const trace = await this.causalTrace.ensureProblemTrace({
          tripId,
          problemId: problem.problemId,
          worldStateVersion,
          semanticKey: problem.semanticKey,
          problemType: problem.type,
          dimension: problem.dimension,
          diagnosticMessage: problem.summary ?? routeSummary,
        });
        guardianStory = this.causalTrace.buildStoryView(trace, 'abu');
        neutralStory = this.causalTrace.buildStoryView(trace, 'neutral');
      } catch (e: unknown) {
        this.logger.warn(
          `ensureProblemTrace failed problem=${problem.problemId}: ${e instanceof Error ? e.message : e}`,
        );
        return undefined;
      }
    }

    if (!guardianStory?.headline || !neutralStory?.chain.length) return undefined;

    return projectExecutionCausalInsight({
      guardianStory,
      neutralStory,
      primaryEnforcement: problem.enforcement,
      linkedProblemId: problem.problemId,
    });
  }

  private async insightFromEnvironmentFallback(input: {
    tripId: string;
    routeSummary?: string;
    environmentEvents: EnvironmentEventSummary[];
    dayNumber: number;
  }): Promise<ExecutionCausalInsightDto | undefined> {
    if (!this.causalTrace) return undefined;

    const weatherEvent = input.environmentEvents.find(
      (ev) => ev.type === 'weather' && (ev.severity === 'red' || ev.severity === 'yellow'),
    );
    if (!weatherEvent && !input.routeSummary?.includes('→')) return undefined;

    const problemId = weatherEvent
      ? `in_trip_env_${weatherEvent.id}`
      : `in_trip_travel_day_${input.dayNumber}`;

    try {
      const worldStateVersion = await this.causalTrace.resolveWorldStateVersion(input.tripId);
      const trace = await this.causalTrace.ensureProblemTrace({
        tripId: input.tripId,
        problemId,
        worldStateVersion,
        semanticKey: 'travel',
        problemType: 'RISK',
        dimension: 'SCHEDULE',
        diagnosticMessage: weatherEvent?.description ?? input.routeSummary,
      });
      const guardianStory = this.causalTrace.buildStoryView(trace, 'abu');
      const neutralStory = this.causalTrace.buildStoryView(trace, 'neutral');
      if (!guardianStory.headline || !neutralStory.chain.length) return undefined;

      return projectExecutionCausalInsight({
        guardianStory,
        neutralStory,
        primaryEnforcement:
          weatherEvent?.severity === 'red' ? 'BLOCK' : 'REQUIRE_ADJUSTMENT',
        linkedProblemId: weatherEvent ? undefined : problemId,
      });
    } catch (e: unknown) {
      this.logger.warn(
        `environment causal insight fallback failed trip=${input.tripId}: ${e instanceof Error ? e.message : e}`,
      );
      return undefined;
    }
  }
}
