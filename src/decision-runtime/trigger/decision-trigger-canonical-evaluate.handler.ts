/**
 * Canonical L2 evaluate dispatch — delegates to guardian runners (same semantics as adapter).
 */

import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Rfc001DecisionProblemStoreService } from '../../trips/guardian-decision-core/persistence/rfc001-decision-problem.store';
import { RoadSegmentUnavailableRunnerService } from '../../trips/guardian-decision-core/execution/road-segment-unavailable-runner.service';
import { WeatherActivityProhibitedRunnerService } from '../../trips/guardian-decision-core/execution/weather-activity-prohibited-runner.service';
import { ExcessiveDailyLoadRunnerService } from '../../trips/guardian-decision-core/execution/excessive-daily-load-runner.service';
import { Rfc001DecisionCenterReadModelService } from '../../trips/guardian-decision-core/read-model/rfc001-decision-center-read-model.service';
import { buildCandidateComparisonView } from '../../trips/guardian-decision-core/adapters/candidate-comparison-view.util';
import type { DecisionRunRequest } from '../contracts/decision-run-request';
import {
  isContextSnapshotRequired,
  readContextSnapshotFromMetadata,
} from './intent/attach-context-snapshot.util';

interface CanonicalEvaluateRunResult {
  runId: string;
  tripId: string;
  workspace: { workspaceId?: string } | null;
  record?: { selectedCandidateId?: string; decisionId?: string } | null;
}

@Injectable()
export class DecisionTriggerCanonicalEvaluateHandler {
  private readonly logger = new Logger(DecisionTriggerCanonicalEvaluateHandler.name);

  constructor(
    private readonly problemStore: Rfc001DecisionProblemStoreService,
    private readonly roadRunner: RoadSegmentUnavailableRunnerService,
    private readonly weatherRunner: WeatherActivityProhibitedRunnerService,
    private readonly loadRunner: ExcessiveDailyLoadRunnerService,
    private readonly readModel: Rfc001DecisionCenterReadModelService,
    private readonly prisma: PrismaService,
  ) {}

  async evaluate(request: DecisionRunRequest): Promise<unknown> {
    const { tripId, problemId } = request;
    if (!problemId) {
      throw new Error('CANONICAL_L2_EVALUATE requires problemId');
    }

    const contextSnapshot = readContextSnapshotFromMetadata(request.metadata);
    if (isContextSnapshotRequired() && !contextSnapshot) {
      throw new BadRequestException(
        'CANONICAL_L2_EVALUATE requires contextSnapshotId (set TRIP_CONTEXT_SNAPSHOT_REQUIRED=0 to disable)',
      );
    }

    const problem = await this.problemStore.get(tripId, problemId);
    if (!problem) {
      throw new NotFoundException(`Canonical problem ${problemId} not found`);
    }

    let run: CanonicalEvaluateRunResult;
    if (problem.semanticCapability === 'WEATHER_ACTIVITY_PROHIBITED') {
      run = await this.weatherRunner.evaluateAndFinalizeByProblemId(tripId, problemId);
    } else if (problem.semanticCapability === 'EXCESSIVE_DAILY_LOAD') {
      run = await this.loadRunner.evaluateAndFinalizeByProblemId(tripId, problemId);
    } else {
      run = await this.roadRunner.evaluateAndFinalizeByProblemId(tripId, problemId);
    }

    if (!run.workspace) {
      return {
        ...run,
        options: [],
        candidates: [],
        comparisonView: undefined,
        impactScopeView: undefined,
        generatedAt: new Date().toISOString(),
        contextSnapshot,
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
      contextSnapshot,
    };
  }
}
