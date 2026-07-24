import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { isDecisionGatewayUnifiedEnabled } from '../../../decision-runtime/gateway/config/decision-gateway.config';
import { DecisionEngineGatewayService } from '../../../decision-runtime/gateway/services/decision-engine-gateway.service';
import { UnifiedDecisionProblemReadModelService } from '../../../decision-runtime/gateway/services/unified-decision-problem-read-model.service';
import type {
  ApplyDecisionProblemResponse,
  SubmitDecisionProblemResolutionRequest,
  SubmitDecisionProblemResolutionResponse,
} from '../../../decision-runtime/gateway/contracts/unified-decision-ui.types';
import { FeasibilityReportService } from '../../trip-constraint-solver/services/feasibility-report.service';
import type { TripOntologyGatewayBridgeService } from '../../../decision-runtime/constraints/services/trip-ontology-gateway-bridge.service';
import { mapDecisionActionsToConsumerRepairOptions } from '../utils/consumer-repair-option.mapper';
import type {
  ConsumerRepairOptionViewModel,
  ExplorationIssuesResponse,
} from '../types/exploration.types';
import { ConsumerExplorationIssuesService } from './consumer-exploration-issues.service';
import {
  ExplorationCheckJobStoreService,
  type ExplorationCheckJobRecord,
} from './exploration-check-job.store';
import {
  ExplorationPoiIssueBridgeService,
  isCprePoiConsumerIssueId,
} from './exploration-poi-issue-bridge.service';
import type { TripFeasibilityReportDto } from '../../trip-constraint-solver/types/trip-constraint-solver.types';

const CHECK_SYNC_SLA_MS = 5000;

@Injectable()
export class ExplorationReliabilityService {
  private readonly logger = new Logger(ExplorationReliabilityService.name);

  constructor(
    private readonly feasibility: FeasibilityReportService,
    private readonly gateway: DecisionEngineGatewayService,
    private readonly readModel: UnifiedDecisionProblemReadModelService,
    private readonly issuesService: ConsumerExplorationIssuesService,
    private readonly checkJobStore: ExplorationCheckJobStoreService,
    @Optional() private readonly poiIssueBridge?: ExplorationPoiIssueBridgeService,
    @Optional() private readonly ontologyGatewayBridge?: TripOntologyGatewayBridgeService,
  ) {}

  async runCheck(input: {
    scenarioId: string;
    tripId: string;
    userId?: string;
    protocolId?: string | null;
    asyncMode?: boolean;
  }): Promise<
    | { mode: 'sync'; job: ExplorationCheckJobRecord; issues: ExplorationIssuesResponse }
    | { mode: 'async'; jobId: string; status: 'PENDING' }
  > {
    if (input.asyncMode) {
      const jobId = randomUUID();
      await this.checkJobStore.create({
        jobId,
        scenarioId: input.scenarioId,
        tripId: input.tripId,
        userId: input.userId,
        status: 'PENDING',
      });
      void this.executeCheckJob(jobId, input.tripId, input.protocolId);
      return { mode: 'async', jobId, status: 'PENDING' };
    }

    const started = Date.now();
    const jobId = randomUUID();
    await this.checkJobStore.create({
      jobId,
      scenarioId: input.scenarioId,
      tripId: input.tripId,
      userId: input.userId,
      status: 'RUNNING',
    });

    try {
      const report = await this.feasibility.validate(input.tripId, {});
      this.readModel.invalidateCache(input.tripId);
      const issues = await this.issuesService.listIssuesForScenario({
        tripId: input.tripId,
        protocolId: input.protocolId,
      });

      const checkDiagnostics = await this.buildCheckDiagnostics(
        report,
        issues,
        input.tripId,
      );

      const job = (await this.checkJobStore.update(jobId, {
        status: 'COMPLETED',
        completedAt: new Date().toISOString(),
        result: {
          verdictStatus: report.verdict?.status,
          totalIssueCount: issues.totalIssueCount,
          checkDurationMs: Date.now() - started,
          ...checkDiagnostics,
        },
      }))!;

      if (Date.now() - started > CHECK_SYNC_SLA_MS) {
        this.logger.warn(
          `Exploration check exceeded sync SLA (${Date.now() - started}ms) for trip ${input.tripId}`,
        );
      }

      return { mode: 'sync', job, issues };
    } catch (err) {
      await this.checkJobStore.update(jobId, {
        status: 'FAILED',
        completedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  async getCheckJob(jobId: string): Promise<ExplorationCheckJobRecord> {
    const job = await this.checkJobStore.get(jobId);
    if (!job) {
      throw new NotFoundException(`Check job ${jobId} not found`);
    }
    return job;
  }

  async getCheckJobWithIssues(
    jobId: string,
    protocolId?: string | null,
  ): Promise<{ job: ExplorationCheckJobRecord; issues?: ExplorationIssuesResponse }> {
    const job = await this.getCheckJob(jobId);
    if (job.status !== 'COMPLETED') {
      return { job };
    }
    const issues = await this.issuesService.listIssuesForScenario({
      tripId: job.tripId,
      protocolId,
    });
    return { job, issues };
  }

  async getRepairOptions(
    tripId: string,
    problemId: string,
  ): Promise<{ problemId: string; options: ConsumerRepairOptionViewModel[] }> {
    if (isCprePoiConsumerIssueId(problemId) && this.poiIssueBridge) {
      return this.poiIssueBridge.getConfirmRepairOptions(tripId, problemId);
    }

    this.assertGateway();

    const view = await this.gateway.getOptions(tripId, problemId);
    return {
      problemId,
      options: mapDecisionActionsToConsumerRepairOptions(view.actions ?? []),
    };
  }

  async submitDecision(
    tripId: string,
    problemId: string,
    userId: string,
    body: SubmitDecisionProblemResolutionRequest,
  ): Promise<SubmitDecisionProblemResolutionResponse> {
    this.assertGateway();
    if (!body.selectedActionId) {
      throw new BadRequestException('selectedActionId (optionId) is required');
    }
    return this.gateway.submitResolution(tripId, problemId, userId, body);
  }

  async applyDecision(
    tripId: string,
    problemId: string,
    userId: string,
  ): Promise<ApplyDecisionProblemResponse> {
    this.assertGateway();
    const result = await this.gateway.applyResolution(tripId, problemId, userId);
    this.readModel.invalidateCache(tripId);
    return result;
  }

  async revalidate(input: {
    tripId: string;
    protocolId?: string | null;
  }): Promise<{
    revalidation: ApplyDecisionProblemResponse['revalidation'];
    issues: ExplorationIssuesResponse;
    verdictStatus?: string;
  }> {
    const report = await this.feasibility.validate(input.tripId, {});
    this.readModel.invalidateCache(input.tripId);
    const issues = await this.issuesService.listIssuesForScenario({
      tripId: input.tripId,
      protocolId: input.protocolId,
    });

    const hasBlock = (issues.blockerIssueCount ?? 0) > 0;

    return {
      revalidation: {
        status: hasBlock ? 'FAILED' : 'PASSED',
        message: hasBlock
          ? '重新验证完成，仍有问题需要处理'
          : '重新验证通过，当前未发现新的阻断问题',
      },
      issues,
      verdictStatus: report.verdict?.status,
    };
  }

  private async executeCheckJob(
    jobId: string,
    tripId: string,
    protocolId?: string | null,
  ) {
    await this.checkJobStore.update(jobId, { status: 'RUNNING' });
    const started = Date.now();
    try {
      const report = await this.feasibility.validate(tripId, {});
      this.readModel.invalidateCache(tripId);
      const issues = await this.issuesService.listIssuesForScenario({ tripId, protocolId });
      const checkDiagnostics = await this.buildCheckDiagnostics(report, issues, tripId);
      await this.checkJobStore.update(jobId, {
        status: 'COMPLETED',
        completedAt: new Date().toISOString(),
        result: {
          verdictStatus: report.verdict?.status,
          totalIssueCount: issues.totalIssueCount,
          checkDurationMs: Date.now() - started,
          ...checkDiagnostics,
        },
      });
    } catch (err) {
      await this.checkJobStore.update(jobId, {
        status: 'FAILED',
        completedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private assertGateway() {
    if (!isDecisionGatewayUnifiedEnabled()) {
      throw new ServiceUnavailableException(
        'DECISION_GATEWAY_UNIFIED must be enabled for exploration reliability flow',
      );
    }
  }

  private async buildCheckDiagnostics(
    report: TripFeasibilityReportDto,
    issues: ExplorationIssuesResponse,
    tripId: string,
  ): Promise<{
    feasibilitySummary?: {
      mustHandle: number;
      suggestAdjust: number;
      pendingConfirm: number;
    };
    gatewayOpenCount?: number;
    unresolvedPoiCount?: number;
    ontologyIssueCount?: number;
    blockerIssueCount?: number;
    ontologyGatewayAssertionCount?: number;
    diagnosis?: string;
  }> {
    const verdictStatus = report.verdict?.status;
    const gatewayOpenCount = issues.gatewayIssueCount ?? 0;
    const unresolvedPoiCount = issues.unresolvedPoiIssueCount ?? 0;
    const ontologyIssueCount = issues.ontologyIssueCount ?? 0;
    const blockerIssueCount = issues.blockerIssueCount ?? 0;
    const ontologyGatewayAssertionCount = await this.loadOntologyGatewayAssertionCount(tripId);
    const feasibilitySummary = report.summary
      ? {
          mustHandle: report.summary.mustHandle,
          suggestAdjust: report.summary.suggestAdjust,
          pendingConfirm: report.summary.pendingConfirm,
        }
      : undefined;

    let diagnosis: string | undefined;
    if (
      verdictStatus === 'ADJUST_REQUIRED' &&
      issues.totalIssueCount === 0
    ) {
      diagnosis = 'VERDICT_GATEWAY_MISMATCH';
      this.logger.warn(
        `[ExplorationCheck] ADJUST_REQUIRED but totalIssueCount=0 trip=${report.tripId} ` +
          `feasibility=${JSON.stringify(feasibilitySummary)} gateway=${gatewayOpenCount} poi=${unresolvedPoiCount}`,
      );
    } else if (
      verdictStatus === 'ADJUST_REQUIRED' &&
      gatewayOpenCount === 0 &&
      ontologyIssueCount > 0
    ) {
      diagnosis = 'ONTOLOGY_CONSTRAINT_BLOCK';
    } else if (
      verdictStatus === 'ADJUST_REQUIRED' &&
      gatewayOpenCount === 0 &&
      unresolvedPoiCount > 0
    ) {
      diagnosis = 'POI_CONFIRMATION_REQUIRED';
    }

    return {
      feasibilitySummary,
      gatewayOpenCount,
      unresolvedPoiCount,
      ontologyIssueCount,
      blockerIssueCount,
      ontologyGatewayAssertionCount,
      diagnosis,
    };
  }

  private async loadOntologyGatewayAssertionCount(tripId: string): Promise<number | undefined> {
    if (!this.ontologyGatewayBridge) return undefined;
    try {
      return await this.ontologyGatewayBridge.countOntologyGatewayAssertions(tripId);
    } catch (err) {
      this.logger.debug(
        `Ontology gateway bridge skipped for trip ${tripId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return undefined;
    }
  }
}
