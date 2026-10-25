/**
 * PD-7.3 — Nest Apply adapter: Confirm → RFC-001 finalize → authorize → execute.
 * Authority only; no parallel itinerary write chain (ADR-012).
 */

import { Injectable, Logger } from '@nestjs/common';
import type { Rfc001DecisionProblem } from '../../guardian-decision-core/contracts/decision-problem.types';
import { Rfc001DecisionProblemStoreService } from '../../guardian-decision-core/persistence/rfc001-decision-problem.store';
import { WeatherActivityProhibitedRunnerService } from '../../guardian-decision-core/execution/weather-activity-prohibited-runner.service';
import { RoadSegmentUnavailableRunnerService } from '../../guardian-decision-core/execution/road-segment-unavailable-runner.service';
import { ExcessiveDailyLoadRunnerService } from '../../guardian-decision-core/execution/excessive-daily-load-runner.service';
import { Rfc001AuthorizationService } from '../../guardian-decision-core/authorization/authorization.service';
import { Rfc001PlanVersionApplyExecutor } from '../../guardian-decision-core/execution/plan-version-apply.executor';
import { resolveProactiveDecisionFlagMatrix } from '../config/proactive-decision-flag-matrix.util';
import type { ProactiveChangeDraftV1 } from './proactive-change-draft.types';
import type { ProactiveApplyPort } from './proactive-draft-lifecycle.util';

export type ProactiveRfc001ApplyPortResult = Awaited<
  ReturnType<ProactiveApplyPort>
>;

export type ProactiveRfc001FinalizeRun = {
  record: { decisionId: string; recordStatus?: string } | null;
  planVersion: { planVersionId: string } | null;
  shadowMode: boolean;
  humanDecisionRequired: boolean;
};

/**
 * Pure routing helper (unit-testable without Nest).
 */
export async function runProactiveRfc001FinalizeForProblem(input: {
  problem: Rfc001DecisionProblem;
  weather: {
    evaluateAndFinalizeByProblemId: (
      tripId: string,
      problemId: string,
    ) => Promise<ProactiveRfc001FinalizeRun>;
  };
  road: {
    evaluateAndFinalizeByProblemId: (
      tripId: string,
      problemId: string,
    ) => Promise<ProactiveRfc001FinalizeRun>;
  };
  load: {
    evaluateAndFinalizeByProblemId: (
      tripId: string,
      problemId: string,
    ) => Promise<ProactiveRfc001FinalizeRun>;
  };
}): Promise<
  | { ok: true; run: ProactiveRfc001FinalizeRun }
  | { ok: false; errorZh: string }
> {
  const cap = input.problem.semanticCapability ?? '';
  const tripId = input.problem.tripId;
  const problemId = input.problem.problemId;

  try {
    if (cap === 'WEATHER_ACTIVITY_PROHIBITED' || cap === 'ACTIVITY_WINDOW_MISSED') {
      // ACTIVITY_WINDOW_MISSED (postpone) reuses weather evaluate path in V1;
      // ExecutionSlipRunner has no evaluate-by-problemId yet.
      const run = await input.weather.evaluateAndFinalizeByProblemId(
        tripId,
        problemId,
      );
      return { ok: true, run };
    }
    if (cap === 'ROAD_SEGMENT_UNAVAILABLE') {
      const run = await input.road.evaluateAndFinalizeByProblemId(
        tripId,
        problemId,
      );
      return { ok: true, run };
    }
    if (cap === 'EXCESSIVE_DAILY_LOAD') {
      const run = await input.load.evaluateAndFinalizeByProblemId(
        tripId,
        problemId,
      );
      return { ok: true, run };
    }
    return {
      ok: false,
      errorZh: `不支持的 Decision Problem 能力：${cap || 'unknown'}`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, errorZh: `RFC001 finalize 失败：${message}` };
  }
}

@Injectable()
export class ProactiveRfc001ApplyAdapterService {
  private readonly logger = new Logger(ProactiveRfc001ApplyAdapterService.name);

  constructor(
    private readonly problemStore: Rfc001DecisionProblemStoreService,
    private readonly weatherRunner: WeatherActivityProhibitedRunnerService,
    private readonly roadRunner: RoadSegmentUnavailableRunnerService,
    private readonly loadRunner: ExcessiveDailyLoadRunnerService,
    private readonly authorization: Rfc001AuthorizationService,
    private readonly executor: Rfc001PlanVersionApplyExecutor,
  ) {}

  isWriteEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
    return resolveProactiveDecisionFlagMatrix(env).confirmApplyWriteEnabled;
  }

  createApplyPort(env: NodeJS.ProcessEnv = process.env): ProactiveApplyPort {
    return (draft) => this.applyConfirmedDraft(draft, env);
  }

  async applyConfirmedDraft(
    draft: ProactiveChangeDraftV1,
    env: NodeJS.ProcessEnv = process.env,
  ): Promise<ProactiveRfc001ApplyPortResult> {
    if (!this.isWriteEnabled(env)) {
      return {
        ok: false,
        errorZh:
          'Proactive Confirm→Apply 写链未开启（PROACTIVE_DECISION_CONFIRM_APPLY_WRITE_ENABLED）',
      };
    }

    const problemId = draft.decisionProblemId;
    if (!problemId) {
      return { ok: false, errorZh: 'Change Draft 缺少 decisionProblemId' };
    }

    const problem = await this.problemStore.get(draft.tripId, problemId);
    if (!problem) {
      return {
        ok: false,
        errorZh: `Decision Problem 不存在：${problemId}`,
      };
    }

    const finalized = await runProactiveRfc001FinalizeForProblem({
      problem,
      weather: this.weatherRunner,
      road: this.roadRunner,
      load: this.loadRunner,
    });
    if (finalized.ok === false) {
      return { ok: false, errorZh: finalized.errorZh };
    }

    const { run } = finalized;
    if (!run.record?.decisionId) {
      return { ok: false, errorZh: 'RFC001 finalize 未产生 DecisionRecord' };
    }

    const decisionId = run.record.decisionId;

    // Shadow：只落审计，不写行程
    if (run.shadowMode || !run.planVersion) {
      this.logger.debug(
        `PD apply shadow/no-plan trip=${draft.tripId} decision=${decisionId}`,
      );
      return {
        ok: true,
        actionId: decisionId,
        appliedToItinerary: false,
        shadowMode: true,
      };
    }

    try {
      if (run.record.recordStatus !== 'AUTHORIZED') {
        await this.authorization.authorize({
          tripId: draft.tripId,
          decisionId,
        });
      }

      const exec = await this.executor.execute({
        tripId: draft.tripId,
        decisionId,
        idempotencyKey: `pd_v1:apply:${draft.draftId}`,
      });

      return {
        ok: true,
        actionId: exec.record.decisionId,
        planVersionId: exec.planVersion.planVersionId,
        appliedToItinerary: Boolean(exec.itineraryMaterialized ?? true),
        shadowMode: false,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `PD apply authorize/execute failed trip=${draft.tripId} decision=${decisionId}: ${message}`,
      );
      return {
        ok: false,
        errorZh: `RFC001 authorize/execute 失败：${message}`,
      };
    }
  }
}
