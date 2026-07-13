/**
 * RFC-002 — delegates to guardian-decision-core (Canonical Runtime).
 */

import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Rfc001DecisionCenterReadModelService } from '../../../trips/guardian-decision-core/read-model/rfc001-decision-center-read-model.service';
import { Rfc001AuthorizationService } from '../../../trips/guardian-decision-core/authorization/authorization.service';
import { Rfc001PlanVersionApplyExecutor } from '../../../trips/guardian-decision-core/execution/plan-version-apply.executor';
import { RoadSegmentUnavailableRunnerService } from '../../../trips/guardian-decision-core/execution/road-segment-unavailable-runner.service';
import { WeatherActivityProhibitedRunnerService } from '../../../trips/guardian-decision-core/execution/weather-activity-prohibited-runner.service';
import { ExcessiveDailyLoadRunnerService } from '../../../trips/guardian-decision-core/execution/excessive-daily-load-runner.service';
import { ExecutionSlipRunnerService } from '../../../trips/guardian-decision-core/execution/execution-slip-runner.service';
import { EXECUTION_SCHEDULE_INFEASIBLE_CAPABILITY } from '../../../trips/guardian-decision-core/contracts/execution-slip.types';
import { EvidenceResolverService } from '../../../trips/guardian-decision-core/evidence/evidence-resolver.service';
import { WeatherActivityProhibitedPipelineService } from '../../../trips/guardian-decision-core/detection/weather-activity-prohibited-pipeline.service';
import { ExcessiveDailyLoadPipelineService } from '../../../trips/guardian-decision-core/detection/excessive-daily-load-pipeline.service';
import { Rfc001DecisionLedgerStoreService } from '../../../trips/guardian-decision-core/persistence/rfc001-decision-ledger.store';
import { Rfc001DecisionProblemStoreService } from '../../../trips/guardian-decision-core/persistence/rfc001-decision-problem.store';
import { resolveRfc001ProblemSemanticKey } from '../../../decision-capabilities/problem-semantic';
import {
  bridgeCanonicalOptionPreview,
  bridgeRfc001ProblemToDecisionProblemSummary,
} from '../../../trips/guardian-decision-core/adapters/decision-center-bridge.adapter';
import { buildCandidateComparisonView } from '../../../trips/guardian-decision-core/adapters/candidate-comparison-view.util';
import type {
  DecisionProblemStatus,
  DecisionProblemType,
} from '../../../trips/decision-semantics/types/decision-semantics.types';
import {
  resolveTripRevision,
  revisionToString,
} from '../../../trips/trip-constraint-solver/utils/trip-revision.util';
import type { Rfc001DecisionCenterCandidateView } from '../../../trips/guardian-decision-core/adapters/decision-center-bridge.adapter';
import type { CandidateComparisonView } from '../frontend/candidate-comparison-view.types';
import type { ImpactScopeView } from '../frontend/impact-scope-view.types';
import type {
  DecisionOption,
  DecisionOptionsResponse,
} from '../../../trips/decision-semantics/types/decision-semantics.types';
import type {
  AuthorizeDecisionGatewayInput,
  ExecuteDecisionGatewayInput,
} from '../contracts/decision-gateway.types';
import { AuthorizationPolicyGatewayService } from '../../authorization/authorization-policy.gateway.service';
import type { AuthorizationPolicyResult } from '../../authorization/contracts/authorization-policy.types';

/** Runner output shared by road / weather / load evaluate paths. */
interface CanonicalEvaluateRunResult {
  runId: string;
  tripId: string;
  workspace: { workspaceId?: string } | null;
  record?: { selectedCandidateId?: string } | null;
}

export interface CanonicalEvaluatePresentation {
  options: DecisionOption[];
  candidates: Rfc001DecisionCenterCandidateView[];
  comparisonView?: CandidateComparisonView;
  impactScopeView?: ImpactScopeView;
  leadingPersona?: string;
  generatedAt: string;
}

export type CanonicalEvaluateResponse = CanonicalEvaluateRunResult &
  CanonicalEvaluatePresentation;

export interface CanonicalAuthorizeResponse {
  record: unknown;
  planVersion: unknown;
  authorizationPolicy?: AuthorizationPolicyResult;
}

export interface CanonicalExecuteResponse {
  authorizationPolicy?: AuthorizationPolicyResult;
  [key: string]: unknown;
}

@Injectable()
export class CanonicalDecisionEngineAdapter {
  constructor(
    private readonly readModel: Rfc001DecisionCenterReadModelService,
    private readonly prisma: PrismaService,
    private readonly authorization: Rfc001AuthorizationService,
    private readonly executor: Rfc001PlanVersionApplyExecutor,
    private readonly roadRunner: RoadSegmentUnavailableRunnerService,
    private readonly weatherRunner: WeatherActivityProhibitedRunnerService,
    private readonly loadRunner: ExcessiveDailyLoadRunnerService,
    private readonly executionSlipRunner: ExecutionSlipRunnerService,
    private readonly evidenceResolver: EvidenceResolverService,
    private readonly weatherPipeline: WeatherActivityProhibitedPipelineService,
    private readonly loadPipeline: ExcessiveDailyLoadPipelineService,
    private readonly ledgerStore: Rfc001DecisionLedgerStoreService,
    private readonly problemStore: Rfc001DecisionProblemStoreService,
    @Optional() private readonly authPolicyGateway?: AuthorizationPolicyGatewayService,
  ) {}

  async getDecisionCenter(tripId: string) {
    return this.readModel.getTripView(tripId);
  }

  async getProblem(tripId: string, problemId: string) {
    return this.readModel.getProblemView(tripId, problemId);
  }

  async listProblems(tripId: string) {
    const view = await this.readModel.getTripView(tripId);
    return view.problems;
  }

  /** Metadata-only list for BFF — no candidates, workspace, or lineage hydration. */
  async listProblemSummariesLite(tripId: string): Promise<
    Array<{
      problemId: string;
      title: string;
      description: string;
      type: DecisionProblemType;
      status: DecisionProblemStatus;
    }>
  > {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true, updatedAt: true },
    });
    if (!trip) return [];
    const tripVersion = revisionToString(resolveTripRevision(trip));
    const problems = (await this.problemStore.list(tripId)).filter(
      (p) => p.status !== 'FAILED',
    );
    return problems.map((problem) => {
      const summary = bridgeRfc001ProblemToDecisionProblemSummary(problem, tripVersion);
      return {
        problemId: problem.problemId,
        title: summary.title,
        description: summary.description ?? '',
        type: summary.type,
        status: summary.status,
      };
    });
  }

  async getOptions(tripId: string, problemId: string): Promise<DecisionOptionsResponse> {
    const view = await this.readModel.getProblemView(tripId, problemId);
    return {
      problemId,
      tripId,
      options: view.options,
      generatedAt: new Date().toISOString(),
    };
  }

  async previewOption(tripId: string, problemId: string, optionId: string) {
    const view = await this.readModel.getProblemView(tripId, problemId);
    if (!view.workspace) {
      throw new NotFoundException(
        `Workspace for problem ${problemId} not found; run evaluate first`,
      );
    }
    try {
      return bridgeCanonicalOptionPreview(view, optionId);
    } catch {
      throw new NotFoundException(`DECISION_OPTION_NOT_FOUND: ${optionId}`);
    }
  }

  async pollWeatherHazard(
    tripId: string,
    dayIndex: number,
    runFull?: boolean,
  ) {
    const evidenceOnly = await this.evidenceResolver.fetchAndResolveWeatherIfChanged({
      tripId,
      dayIndex,
    });
    if (!evidenceOnly) {
      return { ok: true, changed: false, result: null };
    }
    const result = await this.weatherPipeline.runFromResolvedEvidence(
      tripId,
      evidenceOnly,
    );
    if (runFull && result.problem) {
      const run = await this.weatherRunner.evaluateAndFinalizeByProblemId(
        tripId,
        result.problem.problemId,
      );
      return {
        ok: true,
        changed: true,
        runFull: true,
        ...(await this.enrichEvaluateResult(tripId, result.problem.problemId, run)),
      };
    }
    return { ok: true, changed: true, result };
  }

  async scanDailyLoad(tripId: string, runFull?: boolean) {
    const result = await this.loadPipeline.scanTrip(tripId);
    if (!result) {
      return { ok: true, overloaded: false, result: null };
    }
    if (runFull && result.problem) {
      const run = await this.loadRunner.runFullFromPlanScan(tripId);
      const problemId = run.problem?.problemId ?? result.problem.problemId;
      return {
        ok: true,
        overloaded: true,
        runFull: true,
        ...(await this.enrichEvaluateResult(tripId, problemId, run)),
      };
    }
    return { ok: true, overloaded: true, ...result };
  }

  async evaluate(tripId: string, problemId: string): Promise<CanonicalEvaluateResponse> {
    const problem = await this.problemStore.get(tripId, problemId);
    if (!problem) {
      throw new NotFoundException(`Canonical problem ${problemId} not found`);
    }
    let run: CanonicalEvaluateRunResult;
    if (problem.semanticCapability === 'WEATHER_ACTIVITY_PROHIBITED') {
      run = await this.weatherRunner.evaluateAndFinalizeByProblemId(tripId, problemId);
    } else if (problem.semanticCapability === 'EXCESSIVE_DAILY_LOAD') {
      run = await this.loadRunner.evaluateAndFinalizeByProblemId(tripId, problemId);
    } else if (problem.semanticCapability === EXECUTION_SCHEDULE_INFEASIBLE_CAPABILITY) {
      run = await this.executionSlipRunner.finalizeByProblemId(tripId, problemId);
    } else {
      run = await this.roadRunner.evaluateAndFinalizeByProblemId(tripId, problemId);
    }
    return this.enrichEvaluateResult(tripId, problemId, run);
  }

  /** Project bridge options + candidate views onto evaluate / runFull responses. */
  private async enrichEvaluateResult(
    tripId: string,
    problemId: string,
    run: CanonicalEvaluateRunResult,
  ): Promise<CanonicalEvaluateResponse> {
    if (!run.workspace) {
      return {
        ...run,
        options: [],
        candidates: [],
        comparisonView: undefined,
        impactScopeView: undefined,
        generatedAt: new Date().toISOString(),
      };
    }
    const view = await this.readModel.getProblemView(tripId, problemId);
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { destination: true },
    });
    const comparisonView = buildCandidateComparisonView(view, {
      destinationCountry: trip?.destination ?? undefined,
    });
    return {
      ...run,
      options: view.options,
      candidates: view.candidates,
      comparisonView,
      impactScopeView: view.impactScopeView,
      leadingPersona: view.leadingPersona,
      generatedAt: new Date().toISOString(),
    };
  }

  async resolveProblemSemanticKey(
    tripId: string,
    problemId: string,
  ): Promise<string | undefined> {
    const problem = await this.problemStore.get(tripId, problemId);
    if (!problem) return undefined;
    return resolveRfc001ProblemSemanticKey(problem);
  }

  async authorize(input: AuthorizeDecisionGatewayInput): Promise<CanonicalAuthorizeResponse> {
    const authorizationPolicy = await this.evaluateDecisionAuthorization(input);
    const result = await this.authorization.authorize(input);
    return { ...result, authorizationPolicy };
  }

  async execute(input: ExecuteDecisionGatewayInput): Promise<CanonicalExecuteResponse> {
    const authorizationPolicy = await this.evaluateEffectivePlanCommit(input);
    const result = await this.executor.execute(input);
    return { ...result, authorizationPolicy };
  }

  async rollback(tripId: string, decisionId: string) {
    return this.executor.rollback({ tripId, decisionId });
  }

  async ownsDecision(tripId: string, decisionId: string): Promise<boolean> {
    const record = await this.ledgerStore.getDecision(tripId, decisionId);
    return Boolean(record);
  }

  async hasProblem(tripId: string, problemId: string): Promise<boolean> {
    return Boolean(await this.problemStore.get(tripId, problemId));
  }

  private async evaluateDecisionAuthorization(
    input: AuthorizeDecisionGatewayInput,
  ): Promise<AuthorizationPolicyResult | undefined> {
    if (!this.authPolicyGateway?.isEnabled()) {
      return undefined;
    }
    const policy = await this.authPolicyGateway.evaluate({
      scope: 'DECISION',
      tripId: input.tripId,
      decisionId: input.decisionId,
      candidateId: input.choice,
      metadata: await this.buildAuthorizationMetadata(input.tripId, input.decisionId),
    });
    if (!policy.delegatedToLegacy && policy.outcome === 'DENY') {
      throw new BadRequestException({
        message: 'Authorization policy denied decision authorize',
        reasonCodes: policy.reasonCodes,
        authorizationPolicy: policy,
      });
    }
    return policy;
  }

  private async evaluateEffectivePlanCommit(
    input: ExecuteDecisionGatewayInput,
  ): Promise<AuthorizationPolicyResult | undefined> {
    if (!this.authPolicyGateway?.isEnabled()) {
      return undefined;
    }
    const policy = await this.authPolicyGateway.evaluate({
      scope: 'EFFECTIVE_PLAN_COMMIT',
      tripId: input.tripId,
      decisionId: input.decisionId,
    });
    if (!policy.delegatedToLegacy && policy.outcome === 'DENY') {
      throw new BadRequestException({
        message: 'Authorization policy denied effective plan commit',
        reasonCodes: policy.reasonCodes,
        authorizationPolicy: policy,
      });
    }
    return policy;
  }

  private async buildAuthorizationMetadata(
    tripId: string,
    decisionId: string,
  ): Promise<Record<string, unknown>> {
    const record = await this.ledgerStore.getDecision(tripId, decisionId);
    if (!record?.problemId) return {};
    const problem = await this.problemStore.get(tripId, record.problemId);
    if (!problem) return {};
    const semanticKey = await this.resolveProblemSemanticKey(tripId, problem.problemId);
    return {
      semanticKey,
      semanticCapability: problem.semanticCapability,
      enforcement: problem.type === 'FEASIBILITY_FAILURE' ? 'BLOCK' : 'REQUIRE_ADJUSTMENT',
    };
  }
}
