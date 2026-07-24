/**
 * PR-A → PR-D — internal/staging API for Iceland road-close pipeline.
 */

import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import { isRfc001IcelandRoadCloseEnabled, isRfc001IcelandWeatherActivityEnabled, isRfc001IcelandExcessiveDailyLoadEnabled } from '../config/rfc001-iceland.config';
import {
  buildRoadStatusChangedEvent,
  type RoadStatusChangedStatus,
  type RoadStatusSourceProvider,
} from '../evidence/road-status-changed.event';
import { EvidenceResolverService } from '../evidence/evidence-resolver.service';
import { WorldStateStoreService } from '../evidence/world-state-store.service';
import { RoadSegmentUnavailablePipelineService } from '../detection/road-segment-unavailable-pipeline.service';
import { Rfc001DecisionProblemStoreService } from '../persistence/rfc001-decision-problem.store';
import { RoadSegmentUnavailableEvaluateService } from '../orchestration/road-segment-unavailable-evaluate.service';
import { DecisionWorkspaceService } from '../workspace/decision-workspace.service';
import { RoadSegmentUnavailableRunnerService } from '../execution/road-segment-unavailable-runner.service';
import { Rfc001DecisionLedgerStoreService } from '../persistence/rfc001-decision-ledger.store';
import { Rfc001AuthorizationService } from '../authorization/authorization.service';
import { Rfc001PlanVersionApplyExecutor } from '../execution/plan-version-apply.executor';
import { Rfc001PlanVersionStoreService } from '../plan-version/plan-version.store';
import { Rfc001DecisionCenterReadModelService } from '../read-model/rfc001-decision-center-read-model.service';
import { Rfc001DecisionEngineRoutingService } from '../routing/decision-engine-routing.service';
import { RoadSegmentUnavailableShadowService } from '../shadow/road-segment-unavailable-shadow.service';
import type { RoadSegmentBindings } from '../detection/road-close-impact.types';
import {
  buildWeatherHazardChangedEvent,
  type WeatherHazardSourceProvider,
} from '../evidence/weather-hazard-changed.event';
import { WeatherActivityProhibitedPipelineService } from '../detection/weather-activity-prohibited-pipeline.service';
import { WeatherActivityProhibitedEvaluateService } from '../orchestration/weather-activity-prohibited-evaluate.service';
import { WeatherActivityProhibitedRunnerService } from '../execution/weather-activity-prohibited-runner.service';
import { ExcessiveDailyLoadPipelineService } from '../detection/excessive-daily-load-pipeline.service';
import { ExcessiveDailyLoadEvaluateService } from '../orchestration/excessive-daily-load-evaluate.service';
import { ExcessiveDailyLoadRunnerService } from '../execution/excessive-daily-load-runner.service';
import { buildDailyLoadChangedEvent } from '../evidence/daily-load-changed.event';
import { Rfc001InternalDeprecationInterceptor } from './rfc001-internal-deprecation.interceptor';
import type { Rfc001DecisionProblem } from '../contracts/decision-problem.types';

class SimulateRoadCloseDto {
  @IsString()
  roadId!: string;

  @IsIn(['CLOSED', 'LIMITED', 'OPEN', 'UNKNOWN'])
  status!: RoadStatusChangedStatus;

  @IsOptional()
  @IsString()
  segmentId?: string;

  @IsOptional()
  @IsIn(['CLOSED', 'LIMITED', 'OPEN', 'UNKNOWN'])
  previousStatus?: RoadStatusChangedStatus;

  @IsOptional()
  @IsString()
  sourceProvider?: RoadStatusSourceProvider;

  /** Optional F-road bindings when trip.metadata lacks rfc001IcelandRoadBindings */
  @IsOptional()
  @IsObject()
  roadBindings?: RoadSegmentBindings;

  /** PR-D: run evaluate + finalize after problem detection */
  @IsOptional()
  @IsBoolean()
  runFull?: boolean;
}


class SimulateWeatherHazardDto {
  windSpeedKmh!: number;
  dayIndex?: number;
  regionId?: string;
  windGustKmh?: number;
  activityType?: string;
  requiresGuide?: boolean;
  sourceProvider?: WeatherHazardSourceProvider;
  runEvaluate?: boolean;
  /** Slice 2 — evaluate + finalize (L2 PROPOSED) */
  runFull?: boolean;
}

class SimulateDailyLoadDto {
  dayIndex!: number;
  drivingHours!: number;
  thresholdHours?: number;
  runFull?: boolean;
}

@ApiTags('RFC-001 Iceland (internal, deprecated)')
@Controller('internal/rfc001/iceland')
@UseInterceptors(Rfc001InternalDeprecationInterceptor)
export class Rfc001IcelandInternalController {
  constructor(
    private readonly evidenceResolver: EvidenceResolverService,
    private readonly worldStateStore: WorldStateStoreService,
    private readonly pipeline: RoadSegmentUnavailablePipelineService,
    private readonly problemStore: Rfc001DecisionProblemStoreService,
    private readonly evaluateService: RoadSegmentUnavailableEvaluateService,
    private readonly workspaceService: DecisionWorkspaceService,
    private readonly runner: RoadSegmentUnavailableRunnerService,
    private readonly ledgerStore: Rfc001DecisionLedgerStoreService,
    private readonly authorization: Rfc001AuthorizationService,
    private readonly planExecutor: Rfc001PlanVersionApplyExecutor,
    private readonly planVersionStore: Rfc001PlanVersionStoreService,
    private readonly readModel: Rfc001DecisionCenterReadModelService,
    private readonly shadowService: RoadSegmentUnavailableShadowService,
    private readonly routingService: Rfc001DecisionEngineRoutingService,
    private readonly weatherPipeline: WeatherActivityProhibitedPipelineService,
    private readonly weatherEvaluate: WeatherActivityProhibitedEvaluateService,
    private readonly weatherRunner: WeatherActivityProhibitedRunnerService,
    private readonly loadPipeline: ExcessiveDailyLoadPipelineService,
    private readonly loadEvaluate: ExcessiveDailyLoadEvaluateService,
    private readonly loadRunner: ExcessiveDailyLoadRunnerService,
  ) {}

  private isWeatherProblem(problem: Rfc001DecisionProblem | null | undefined): boolean {
    return problem?.semanticCapability === 'WEATHER_ACTIVITY_PROHIBITED';
  }

  private isLoadProblem(problem: Rfc001DecisionProblem | null | undefined): boolean {
    return problem?.semanticCapability === 'EXCESSIVE_DAILY_LOAD';
  }

  private assertEnabled(): void {
    if (
      !isRfc001IcelandRoadCloseEnabled() &&
      !isRfc001IcelandWeatherActivityEnabled() &&
      !isRfc001IcelandExcessiveDailyLoadEnabled()
    ) {
      throw new ForbiddenException(
        'RFC001_ICELAND_ROAD_CLOSE, RFC001_ICELAND_WEATHER_ACTIVITY, or RFC001_ICELAND_EXCESSIVE_LOAD must be enabled',
      );
    }
  }

  private assertRoadEnabled(): void {
    if (!isRfc001IcelandRoadCloseEnabled()) {
      throw new ForbiddenException('RFC001_ICELAND_ROAD_CLOSE is not enabled');
    }
  }

  private assertWeatherEnabled(): void {
    if (!isRfc001IcelandWeatherActivityEnabled()) {
      throw new ForbiddenException('RFC001_ICELAND_WEATHER_ACTIVITY is not enabled');
    }
  }

  private assertLoadEnabled(): void {
    if (!isRfc001IcelandExcessiveDailyLoadEnabled()) {
      throw new ForbiddenException('RFC001_ICELAND_EXCESSIVE_LOAD is not enabled');
    }
  }

  @Post('trips/:tripId/road-close/simulate')
  @ApiOperation({
    summary: 'Simulate ROAD_STATUS_CHANGED → assertion → decision problem (PR-A+B)',
  })
  async simulateRoadClose(
    @Param('tripId') tripId: string,
    @Body() body: SimulateRoadCloseDto,
  ) {
    this.assertRoadEnabled();
    const event = buildRoadStatusChangedEvent({
      tripId,
      roadId: body.roadId,
      status: body.status,
      segmentId: body.segmentId,
      previousStatus: body.previousStatus,
      sourceProvider: body.sourceProvider ?? 'admin_injection',
    });

    if (body.runFull) {
      const run = await this.runner.runFullFromEvent(event, {
        bindings: body.roadBindings,
      });
      return { ok: true, runFull: true, ...run };
    }

    const result = await this.pipeline.runFromEvent(event, {
      bindings: body.roadBindings,
    });
    return {
      ok: true,
      event: result.evidence.event,
      assertion: result.evidence.assertion,
      snapshot: result.evidence.snapshot,
      resolverVersion: result.evidence.resolverVersion,
      hardClosure: result.evidence.hardClosure,
      supersededAssertionIds: result.evidence.supersededAssertionIds,
      impact: result.impact,
      problem: result.problem,
    };
  }

  @Post('trips/:tripId/road-close/poll')
  @ApiOperation({
    summary: 'Poll road.is and run pipeline if status changed',
  })
  async pollRoadClose(
    @Param('tripId') tripId: string,
    @Body() body: { roadId: string; segmentId?: string; roadBindings?: RoadSegmentBindings },
  ) {
    this.assertEnabled();
    const evidenceOnly = await this.evidenceResolver.fetchAndResolveIfChanged({
      tripId,
      roadId: body.roadId,
      segmentId: body.segmentId,
    });
    if (!evidenceOnly) {
      return { ok: true, changed: false, result: null };
    }
    const result = await this.pipeline.runFromResolvedEvidence(
      tripId,
      evidenceOnly,
      { bindings: body.roadBindings },
    );
    return { ok: true, changed: true, result };
  }

  @Post('trips/:tripId/road-close/shadow-compare')
  @ApiOperation({
    summary: 'WP1 — Legacy vs RFC-001 shadow comparison (RFC chain runs in shadow mode)',
  })
  async shadowCompare(
    @Param('tripId') tripId: string,
    @Body() body: SimulateRoadCloseDto,
  ) {
    this.assertEnabled();
    const event = buildRoadStatusChangedEvent({
      tripId,
      roadId: body.roadId,
      status: body.status,
      segmentId: body.segmentId,
      previousStatus: body.previousStatus,
      sourceProvider: body.sourceProvider ?? 'admin_injection',
    });
    const comparison = await this.shadowService.compareFromEvent(event, {
      bindings: body.roadBindings,
    });
    const aggregate = await this.shadowService.getStoredAggregate(tripId);
    return { ok: true, comparison, aggregate };
  }

  @Get('trips/:tripId/shadow-comparisons')
  @ApiOperation({ summary: 'List persisted shadow comparisons + aggregate metrics' })
  async listShadowComparisons(@Param('tripId') tripId: string) {
    this.assertEnabled();
    return this.shadowService.listStored(tripId);
  }

  @Get('trips/:tripId/world-state')
  @ApiOperation({ summary: 'Read persisted RFC-001 world state block' })
  async getWorldState(@Param('tripId') tripId: string) {
    this.assertEnabled();
    return this.worldStateStore.readStore(tripId);
  }

  @Get('trips/:tripId/decision-problems')
  @ApiOperation({ summary: 'List RFC-001 decision problems for trip' })
  async listProblems(@Param('tripId') tripId: string) {
    this.assertEnabled();
    const items = await this.problemStore.list(tripId);
    return { tripId, items };
  }

  @Get('trips/:tripId/decision-problems/:problemId')
  @ApiOperation({ summary: 'Get single RFC-001 decision problem' })
  async getProblem(
    @Param('tripId') tripId: string,
    @Param('problemId') problemId: string,
  ) {
    this.assertEnabled();
    const problem = await this.problemStore.get(tripId, problemId);
    if (!problem) {
      throw new NotFoundException(`Decision problem ${problemId} not found`);
    }
    return problem;
  }

  @Post('trips/:tripId/decision-problems/:problemId/evaluate')
  @ApiOperation({
    summary: 'Fill DecisionWorkspace with Guardian materials (PR-C)',
  })
  async evaluateProblem(
    @Param('tripId') tripId: string,
    @Param('problemId') problemId: string,
    @Body() body: { roadBindings?: RoadSegmentBindings },
  ) {
    this.assertEnabled();
    const problem = await this.problemStore.get(tripId, problemId);
    if (!problem) {
      throw new NotFoundException(`Decision problem ${problemId} not found`);
    }
    const workspace = this.isWeatherProblem(problem)
      ? await this.weatherEvaluate.evaluateByProblemId(tripId, problemId)
      : this.isLoadProblem(problem)
        ? await this.loadEvaluate.evaluateByProblemId(tripId, problemId)
        : await this.evaluateService.evaluateByProblemId(tripId, problemId, {
            bindings: body?.roadBindings,
          });
    return { ok: true, workspace };
  }

  @Post('trips/:tripId/decision-problems/:problemId/finalize')
  @ApiOperation({
    summary: 'Decision Core finalize on READY workspace (PR-D)',
  })
  async finalizeProblem(
    @Param('tripId') tripId: string,
    @Param('problemId') problemId: string,
  ) {
    this.assertEnabled();
    const problem = await this.problemStore.get(tripId, problemId);
    if (!problem) {
      throw new NotFoundException(`Decision problem ${problemId} not found`);
    }
    const run = this.isWeatherProblem(problem)
      ? await this.weatherRunner.finalizeByProblemId(tripId, problemId)
      : this.isLoadProblem(problem)
        ? await this.loadRunner.finalizeByProblemId(tripId, problemId)
        : await this.runner.finalizeByProblemId(tripId, problemId);
    return { ok: true, ...run };
  }

  @Post('trips/:tripId/decision-problems/:problemId/run')
  @ApiOperation({
    summary: 'Evaluate + finalize in one call (PR-C + PR-D)',
  })
  async runProblem(
    @Param('tripId') tripId: string,
    @Param('problemId') problemId: string,
    @Body() body: { roadBindings?: RoadSegmentBindings },
  ) {
    this.assertEnabled();
    const problem = await this.problemStore.get(tripId, problemId);
    if (!problem) {
      throw new NotFoundException(`Decision problem ${problemId} not found`);
    }
    const run = this.isWeatherProblem(problem)
      ? await this.weatherRunner.evaluateAndFinalizeByProblemId(tripId, problemId)
      : this.isLoadProblem(problem)
        ? await this.loadRunner.evaluateAndFinalizeByProblemId(tripId, problemId)
        : await this.runner.evaluateAndFinalizeByProblemId(
            tripId,
            problemId,
            { bindings: body?.roadBindings },
          );
    return { ok: true, ...run };
  }

  @Get('trips/:tripId/decision-runs/:runId')
  @ApiOperation({ summary: 'Get decision run with workspace + record (PR-D)' })
  async getDecisionRun(
    @Param('tripId') tripId: string,
    @Param('runId') runId: string,
  ) {
    this.assertEnabled();
    return this.runner.getRunDetail(tripId, runId);
  }

  @Get('trips/:tripId/decisions')
  @ApiOperation({ summary: 'List RFC-001 decision records for trip' })
  async listDecisions(@Param('tripId') tripId: string) {
    this.assertEnabled();
    const items = await this.ledgerStore.listDecisions(tripId);
    const decisionRef = await this.ledgerStore.getDecisionRef(tripId);
    return { tripId, items, decisionRef };
  }

  @Get('trips/:tripId/plan-versions')
  @ApiOperation({ summary: 'List RFC-001 plan versions + effective pointer' })
  async listPlanVersions(@Param('tripId') tripId: string) {
    this.assertEnabled();
    const block = await this.planVersionStore.readBlock(tripId);
    return { tripId, ...block };
  }

  @Get('trips/:tripId/decision-routing')
  @ApiOperation({
    summary:
      'Decision engine routing — which API surface handles each problem (avoid frontend hardcoding)',
  })
  async getDecisionRouting(@Param('tripId') tripId: string) {
    this.assertEnabled();
    return this.routingService.getTripRouting(tripId);
  }

  @Get('trips/:tripId/decision-center')
  @ApiOperation({
    summary: 'RFC-001 Decision Center read model (problem cards + candidates + lineage)',
  })
  async getDecisionCenter(@Param('tripId') tripId: string) {
    this.assertEnabled();
    return this.readModel.getTripView(tripId);
  }

  @Get('trips/:tripId/decision-center/problems/:problemId')
  @ApiOperation({ summary: 'Single RFC-001 problem read model for Decision Center UI' })
  async getDecisionCenterProblem(
    @Param('tripId') tripId: string,
    @Param('problemId') problemId: string,
  ) {
    this.assertEnabled();
    return this.readModel.getProblemView(tripId, problemId);
  }

  @Post('trips/:tripId/decisions/:decisionId/authorize')
  @ApiOperation({ summary: 'L2 authorize (internal/staging)' })
  async authorizeDecision(
    @Param('tripId') tripId: string,
    @Param('decisionId') decisionId: string,
    @Body() body: { choice?: string },
  ) {
    this.assertEnabled();
    const result = await this.authorization.authorize({
      tripId,
      decisionId,
      choice: body.choice,
    });
    return { ok: true, ...result };
  }

  @Post('trips/:tripId/decisions/:decisionId/execute')
  @ApiOperation({ summary: 'Execute PlanVersion (internal/staging)' })
  async executeDecision(
    @Param('tripId') tripId: string,
    @Param('decisionId') decisionId: string,
    @Body() body: { idempotencyKey?: string },
  ) {
    this.assertEnabled();
    const result = await this.planExecutor.execute({
      tripId,
      decisionId,
      idempotencyKey: body.idempotencyKey,
    });
    return { ok: true, ...result };
  }

  @Post('trips/:tripId/decisions/:decisionId/rollback')
  @ApiOperation({ summary: 'Rollback effective plan version' })
  async rollbackDecision(
    @Param('tripId') tripId: string,
    @Param('decisionId') decisionId: string,
  ) {
    this.assertEnabled();
    const result = await this.planExecutor.rollback({ tripId, decisionId });
    return { ok: true, ...result };
  }

  @Get('trips/:tripId/decision-workspaces')
  @ApiOperation({ summary: 'List RFC-001 decision workspaces for trip' })
  async listWorkspaces(@Param('tripId') tripId: string) {
    this.assertEnabled();
    const items = await this.workspaceService.list(tripId);
    return { tripId, items };
  }

  @Get('trips/:tripId/decision-workspaces/:workspaceId')
  @ApiOperation({ summary: 'Get single RFC-001 decision workspace' })
  async getWorkspace(
    @Param('tripId') tripId: string,
    @Param('workspaceId') workspaceId: string,
  ) {
    this.assertEnabled();
    const workspace = await this.workspaceService.get(tripId, workspaceId);
    if (!workspace) {
      throw new NotFoundException(`Workspace ${workspaceId} not found`);
    }
    return workspace;
  }

  @Post('trips/:tripId/weather-hazard/simulate')
  @ApiOperation({
    summary: 'Slice 2 — simulate WEATHER_HAZARD_CHANGED → problem → optional evaluate',
  })
  async simulateWeatherHazard(
    @Param('tripId') tripId: string,
    @Body() body: SimulateWeatherHazardDto,
  ) {
    this.assertWeatherEnabled();
    const event = buildWeatherHazardChangedEvent({
      tripId,
      windSpeedKmh: body.windSpeedKmh,
      dayIndex: body.dayIndex,
      regionId: body.regionId,
      windGustKmh: body.windGustKmh,
      activityType: body.activityType,
      requiresGuide: body.requiresGuide,
      sourceProvider: body.sourceProvider ?? 'admin_injection',
    });

    const result = await this.weatherPipeline.runFromEvent(event);
    if (body.runFull) {
      const run = await this.weatherRunner.runFullFromEvent(event);
      return { ok: true, runFull: true, ...run };
    }

    let workspace = null;
    if (body.runEvaluate && result.problem) {
      workspace = await this.weatherEvaluate.evaluate({
        tripId,
        problem: result.problem,
        evidence: result.evidence,
        impact: result.impact,
      });
    }

    return {
      ok: true,
      event: result.evidence.event,
      assertion: result.evidence.assertion,
      snapshot: result.evidence.snapshot,
      weatherProhibition: result.evidence.weatherProhibition,
      impact: result.impact,
      problem: result.problem,
      workspace,
    };
  }

  @Post('trips/:tripId/weather-hazard/poll')
  @ApiOperation({
    summary: 'Poll live weather for trip day; pipeline when wind changes',
  })
  async pollWeatherHazard(
    @Param('tripId') tripId: string,
    @Body() body: { dayIndex: number; runFull?: boolean },
  ) {
    this.assertWeatherEnabled();
    const evidenceOnly = await this.evidenceResolver.fetchAndResolveWeatherIfChanged({
      tripId,
      dayIndex: body.dayIndex,
    });
    if (!evidenceOnly) {
      return { ok: true, changed: false, result: null };
    }
    const result = await this.weatherPipeline.runFromResolvedEvidence(
      tripId,
      evidenceOnly,
    );
    if (body.runFull && result.problem) {
      const run = await this.weatherRunner.evaluateAndFinalizeByProblemId(
        tripId,
        result.problem.problemId,
      );
      return { ok: true, changed: true, runFull: true, ...run };
    }
    return { ok: true, changed: true, result };
  }

  @Post('trips/:tripId/daily-load/simulate')
  @ApiOperation({ summary: 'Slice 3 — simulate DAILY_LOAD_EXCEEDED → problem' })
  async simulateDailyLoad(
    @Param('tripId') tripId: string,
    @Body() body: SimulateDailyLoadDto,
  ) {
    this.assertLoadEnabled();
    const event = buildDailyLoadChangedEvent({
      tripId,
      dayIndex: body.dayIndex,
      drivingHours: body.drivingHours,
      thresholdHours: body.thresholdHours ?? 8,
    });

    if (body.runFull) {
      const run = await this.loadRunner.runFullFromEvent(event);
      return { ok: true, runFull: true, ...run };
    }

    const result = await this.loadPipeline.runFromEvent(event);
    return {
      ok: true,
      event: result.evidence.event,
      assertion: result.evidence.assertion,
      snapshot: result.evidence.snapshot,
      excessiveLoad: result.evidence.excessiveLoad,
      impact: result.impact,
      problem: result.problem,
    };
  }

  @Post('trips/:tripId/daily-load/scan')
  @ApiOperation({ summary: 'Slice 3 — scan plan for excessive daily driving load' })
  async scanDailyLoad(
    @Param('tripId') tripId: string,
    @Body() body: { runFull?: boolean },
  ) {
    this.assertLoadEnabled();
    if (body.runFull) {
      const run = await this.loadRunner.runFullFromPlanScan(tripId);
      return { ok: true, runFull: true, ...run };
    }
    const result = await this.loadPipeline.scanTrip(tripId);
    if (!result) {
      return { ok: true, overloaded: false, result: null };
    }
    return { ok: true, overloaded: true, ...result };
  }
}
