/**
 * Slice 3 — Iceland excessive daily load: evidence → impact → decision problem.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { Rfc001DecisionProblem } from '../contracts/decision-problem.types';
import {
  EvidenceResolverService,
  type ResolveDailyLoadChangedResult,
} from '../evidence/evidence-resolver.service';
import type { DailyLoadChangedEvent } from '../evidence/daily-load-changed.event';
import { synthesizeRoutePlanDraftFromTrip } from '../../trip-constraint-solver/utils/trip-route-plan-draft.util';
import { DecisionProblemDetectorService } from './decision-problem-detector.service';
import {
  analyzeExcessiveDailyLoadImpact,
  scanPlanForExcessiveDailyLoad,
} from './excessive-daily-load-impact-analyzer';
import { buildDailyLoadChangedEvent } from '../evidence/daily-load-changed.event';
import {
  resolveDrivingEnvironmentForCountry,
  resolveEffectiveDailyLoadThresholdForCountry,
} from '../../../decision-runtime/packs/modifiers/pack-modifier-bundle.loader';
import { resolveTripDestinationCountry } from '../../../decision-runtime/packs/loader/country-pack-registry.util';

export interface ExcessiveDailyLoadPipelineResult {
  evidence: ResolveDailyLoadChangedResult;
  impact: ReturnType<typeof analyzeExcessiveDailyLoadImpact>;
  problem: Rfc001DecisionProblem | null;
}

@Injectable()
export class ExcessiveDailyLoadPipelineService {
  private readonly logger = new Logger(ExcessiveDailyLoadPipelineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evidenceResolver: EvidenceResolverService,
    private readonly problemDetector: DecisionProblemDetectorService,
  ) {}

  async runFromEvent(
    event: DailyLoadChangedEvent,
  ): Promise<ExcessiveDailyLoadPipelineResult> {
    const tripId = event.aggregateId;
    const evidence = await this.evidenceResolver.resolveDailyLoadChanged(event);
    return this.runFromResolvedEvidence(tripId, evidence);
  }

  async scanTrip(tripId: string): Promise<ExcessiveDailyLoadPipelineResult | null> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { destination: true },
    });
    const destinationCountry = resolveTripDestinationCountry(trip?.destination);
    const drivingEnv = resolveDrivingEnvironmentForCountry(destinationCountry);

    const plan = await synthesizeRoutePlanDraftFromTrip(this.prisma, tripId);
    if (!plan) return null;

    const scan = scanPlanForExcessiveDailyLoad(
      plan,
      destinationCountry
        ? resolveEffectiveDailyLoadThresholdForCountry(destinationCountry)
        : undefined,
      drivingEnv.defaultSpeedKmH,
    );
    if (!scan) return null;

    const event = buildDailyLoadChangedEvent({
      tripId,
      dayIndex: scan.dayIndex,
      drivingHours: scan.drivingHours,
      thresholdHours: scan.thresholdHours,
      sourceProvider: 'plan_scan',
    });
    return this.runFromEvent(event);
  }

  async runFromResolvedEvidence(
    tripId: string,
    evidence: ResolveDailyLoadChangedResult,
  ): Promise<ExcessiveDailyLoadPipelineResult> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { destination: true },
    });
    const drivingEnv = resolveDrivingEnvironmentForCountry(
      resolveTripDestinationCountry(trip?.destination),
    );

    const plan = await synthesizeRoutePlanDraftFromTrip(this.prisma, tripId);
    if (!plan) {
      throw new Error(`Cannot synthesize plan for trip ${tripId}`);
    }

    const impact = analyzeExcessiveDailyLoadImpact(
      plan,
      {
        tripId,
        dayIndex: evidence.event.payload.dayIndex,
        thresholdHours: evidence.event.payload.thresholdHours,
      },
      drivingEnv.defaultSpeedKmH,
    );

    const problem = await this.problemDetector.detectExcessiveDailyLoadProblem({
      tripId,
      event: evidence.event,
      assertion: evidence.assertion,
      snapshot: evidence.snapshot,
      impact,
    });

    this.logger.debug(
      `daily load pipeline trip=${tripId} day=${impact.dayIndex} hours=${impact.drivingHours} problem=${problem?.problemId ?? 'none'}`,
    );

    return { evidence, impact, problem };
  }
}
