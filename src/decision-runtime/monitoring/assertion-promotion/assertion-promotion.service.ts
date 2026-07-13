/**
 * Assertion Auto-Promotion — World State → Pipeline (Shadow Phase 1).
 * Does not modify frozen Weather/Road detection runtime.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorldStateStoreService } from '../../../trips/guardian-decision-core/evidence/world-state-store.service';
import { WeatherActivityProhibitedPipelineService } from '../../../trips/guardian-decision-core/detection/weather-activity-prohibited-pipeline.service';
import { Rfc001DecisionProblemStoreService } from '../../../trips/guardian-decision-core/persistence/rfc001-decision-problem.store';
import { VedurWeatherEvidenceStoreService } from '../../../trips/guardian-decision-core/evidence/vedur-weather-evidence.store';
import { synthesizeRoutePlanDraftFromTrip } from '../../../trips/trip-constraint-solver/utils/trip-route-plan-draft.util';
import { analyzeWeatherActivityImpact } from '../../../trips/guardian-decision-core/detection/weather-activity-impact-analyzer';
import type { WeatherHazardAssertionPayload } from '../../../trips/guardian-decision-core/adapters/weather-hazard-to-assertion.adapter';
import {
  findExistingWeatherProblemId,
  weatherAssertionImpliesHazard,
} from '../utils/find-weather-hazard-event.util';
import { maybeRecoverWeatherProblemAfterCalmPoll } from '../utils/weather-problem-recovery.util';
import {
  ASSERTION_PROMOTION_SCHEMA_ID,
  isAssertionPromotionEnabled,
  isAssertionPromotionRoadEnabled,
  isAssertionPromotionShadowMode,
  isAssertionPromotionWeatherEnabled,
  isTripEligibleForAssertionPromotion,
  resolveAssertionPromotionMaxAttempts,
  resolveAssertionPromotionRetryIntervalMs,
} from './assertion-promotion.config';
import { consumeAssertionPromotionTestFailOnce } from './assertion-promotion-test-failpoint.util';
import { AssertionPromotionLedgerStore } from './assertion-promotion-ledger.store';
import { resolvePromotionKey } from './assertion-promotion-key.util';
import { withTripAdvisoryLock } from './trip-advisory-lock.util';
import {
  buildWeatherResolvedFromStore,
  weatherPayloadImpliesHazardPromotion,
} from './resolved-evidence-from-world-state.util';
import type {
  AssertionPromotionLedgerEntry,
  AssertionPromotionRequest,
  AssertionPromotionResult,
} from './assertion-promotion.types';

@Injectable()
export class AssertionPromotionService {
  private readonly logger = new Logger(AssertionPromotionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly worldStore: WorldStateStoreService,
    private readonly ledgerStore: AssertionPromotionLedgerStore,
    private readonly problemStore: Rfc001DecisionProblemStoreService,
    private readonly vedurStore: VedurWeatherEvidenceStoreService,
    @Optional() private readonly weatherPipeline?: WeatherActivityProhibitedPipelineService,
  ) {}

  isEnabled(): boolean {
    return isAssertionPromotionEnabled();
  }

  async promote(input: AssertionPromotionRequest): Promise<AssertionPromotionResult> {
    if (!this.isEnabled()) {
      return this.skipped(input, 'ASSERTION_PROMOTION_DISABLED');
    }
    if (!isTripEligibleForAssertionPromotion(input.tripId)) {
      return this.skipped(input, 'trip_not_on_promotion_allowlist');
    }

    const promotionKey = resolvePromotionKey({
      signal: input.signal,
      predicate: input.predicate,
      dayIndex: input.dayIndex,
      roadId: input.roadId,
    });

    return withTripAdvisoryLock(this.prisma, input.tripId, async () => {
      const existing = await this.ledgerStore.getByKey(input.tripId, promotionKey);
      if (existing && this.isTerminalSuccess(existing.status)) {
        if (input.assertionId && existing.assertionId === input.assertionId) {
          return this.resultFromLedger(input, existing, true);
        }
        if (input.signal === 'ASSERTION_EMITTED' && existing.status === 'SHADOW_OBSERVED') {
          return this.resultFromLedger(input, existing, true);
        }
        if (input.signal === 'RECOVERY_OBSERVED' && existing.status === 'RECOVERY_SHADOW') {
          const hazardKey = resolvePromotionKey({
            signal: 'ASSERTION_EMITTED',
            predicate: 'weather.hazard',
            dayIndex: input.dayIndex,
          });
          const hazardEntry = await this.ledgerStore.getByKey(input.tripId, hazardKey);
          const hazardActive =
            hazardEntry?.status === 'SHADOW_OBSERVED' || hazardEntry?.status === 'PROMOTED';
          if (!hazardActive) {
            return this.resultFromLedger(input, existing, true);
          }
        }
      }

      try {
        if (input.predicate === 'weather.hazard') {
          return input.signal === 'RECOVERY_OBSERVED'
            ? await this.promoteWeatherRecovery(input, promotionKey)
            : await this.promoteWeatherHazard(input, promotionKey);
        }
        if (input.predicate === 'road.status' && isAssertionPromotionRoadEnabled()) {
          return this.skipped(input, 'road_promotion_not_implemented_phase1');
        }
        return this.skipped(input, 'predicate_not_enabled');
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return this.recordFailure(input, promotionKey, message);
      }
    });
  }

  async retryFailedForTrip(tripId: string): Promise<AssertionPromotionResult[]> {
    if (!this.isEnabled() || !isTripEligibleForAssertionPromotion(tripId)) {
      return [];
    }
    const nowMs = Date.now();
    const entries = await this.ledgerStore.listRetryable(tripId, nowMs);
    const results: AssertionPromotionResult[] = [];
    for (const entry of entries) {
      const req: AssertionPromotionRequest = {
        tripId,
        signal: entry.signal,
        predicate: entry.promotionKey.startsWith('road:') ? 'road.status' : 'weather.hazard',
        assertionId: entry.assertionId,
        eventId: entry.eventId,
        dayIndex: this.dayIndexFromPromotionKey(entry.promotionKey),
        ingestId: entry.ingestId,
        trigger: 'retry_worker',
      };
      results.push(await this.promote(req));
    }
    return results;
  }

  async reconcileTripAssertions(tripId: string): Promise<AssertionPromotionResult[]> {
    if (!this.isEnabled() || !isTripEligibleForAssertionPromotion(tripId)) {
      return [];
    }
    const store = await this.worldStore.readStore(tripId);
    const results: AssertionPromotionResult[] = [];

    for (const assertion of store.assertions) {
      if (assertion.status !== 'ACTIVE') continue;
      if (assertion.predicate === 'weather.hazard' && isAssertionPromotionWeatherEnabled()) {
        if (!weatherAssertionImpliesHazard(assertion)) continue;
        const payload = assertion.payload as WeatherHazardAssertionPayload;
        const promotionKey = resolvePromotionKey({
          signal: 'ASSERTION_EMITTED',
          predicate: 'weather.hazard',
          dayIndex: payload.dayIndex,
        });
        const existing = await this.ledgerStore.getByKey(tripId, promotionKey);
        if (existing && this.isTerminalSuccess(existing.status)) continue;

        results.push(
          await this.promote({
            tripId,
            signal: 'ASSERTION_EMITTED',
            predicate: 'weather.hazard',
            assertionId: assertion.assertionId,
            dayIndex: payload.dayIndex,
            trigger: 'monitoring_scan',
          }),
        );
      }
    }

    const retries = await this.retryFailedForTrip(tripId);
    return [...results, ...retries];
  }

  private async promoteWeatherHazard(
    input: AssertionPromotionRequest,
    promotionKey: string,
  ): Promise<AssertionPromotionResult> {
    if (!isAssertionPromotionWeatherEnabled()) {
      return this.skipped(input, 'weather_promotion_disabled');
    }

    const dayIndex = input.dayIndex ?? 0;
    const store = await this.worldStore.readStore(input.tripId);
    const assertionId =
      input.assertionId ??
      store.assertions
        .filter((a) => a.predicate === 'weather.hazard' && a.status === 'ACTIVE')
        .map((a) => a as { assertionId: string; payload: WeatherHazardAssertionPayload })
        .filter((a) => (a.payload.dayIndex ?? dayIndex) === dayIndex)
        .sort((a, b) => b.assertionId.localeCompare(a.assertionId))[0]?.assertionId;

    if (!assertionId) {
      return this.skipped(input, 'missing_weather_assertion');
    }

    const resolved = buildWeatherResolvedFromStore(
      store,
      input.tripId,
      assertionId,
      input.eventId,
    );
    if (!resolved) {
      return this.skipped(input, 'cannot_reconstruct_resolved_evidence');
    }

    const payload = resolved.assertion.payload;
    if (!weatherPayloadImpliesHazardPromotion(payload)) {
      return this.skipped(input, 'assertion_below_hazard_threshold');
    }

    const existingProblem = findExistingWeatherProblemId(
      await this.problemStore.list(input.tripId),
      dayIndex,
    );
    if (existingProblem) {
      const entry = this.ledgerStore.createEntry({
        promotionKey,
        signal: 'ASSERTION_EMITTED',
        status: 'SKIPPED',
        shadowMode: isAssertionPromotionShadowMode(),
        assertionId,
        eventId: resolved.event.eventId,
        ingestId: input.ingestId,
        detail: `existing_open_problem:${existingProblem}`,
        problemId: existingProblem,
      });
      await this.ledgerStore.upsert(input.tripId, entry);
      return this.resultFromLedger(input, entry, true);
    }

    const shadowMode = isAssertionPromotionShadowMode();
    if (consumeAssertionPromotionTestFailOnce(promotionKey)) {
      throw new Error('assertion_promotion_test_fail_once');
    }

    if (shadowMode) {
      const prevAttempt = await this.ledgerStore.getByKey(input.tripId, promotionKey);
      const attempts = this.nextSuccessAttempt(prevAttempt);

      const plan = await synthesizeRoutePlanDraftFromTrip(this.prisma, input.tripId);
      const impact = plan
        ? analyzeWeatherActivityImpact(plan, {
            tripId: input.tripId,
            dayIndex,
            regionId: payload.regionId,
          })
        : { affectedPlanItemIds: [], affectedEntityRefs: [] };

      const entry = this.ledgerStore.createEntry({
        promotionKey,
        signal: 'ASSERTION_EMITTED',
        status: 'SHADOW_OBSERVED',
        shadowMode: true,
        assertionId,
        eventId: resolved.event.eventId,
        ingestId: input.ingestId,
        detail: `shadow dry-run items=${impact.affectedPlanItemIds.length} wind=${payload.windSpeedKmh}`,
        attempts,
      });
      await this.ledgerStore.upsert(input.tripId, entry);
      await this.vedurStore.trackCalmRecoveryStreak(input.tripId, dayIndex, 'PROHIBITED', {
        fingerprint: input.ingestId,
      });
      this.logger.log(
        `[AssertionPromotion] SHADOW_OBSERVED trip=${input.tripId} key=${promotionKey} items=${impact.affectedPlanItemIds.length}`,
      );
      return this.resultFromLedger(input, entry);
    }

    if (!this.weatherPipeline) {
      return this.recordFailure(input, promotionKey, 'weather_pipeline_not_wired');
    }

    const pipelineResult = await this.weatherPipeline.runFromResolvedEvidence(
      input.tripId,
      resolved,
    );
    const problemId = pipelineResult.problem?.problemId;
    const entry = this.ledgerStore.createEntry({
      promotionKey,
      signal: 'ASSERTION_EMITTED',
      status: problemId ? 'PROMOTED' : 'SKIPPED',
      shadowMode: false,
      assertionId,
      eventId: resolved.event.eventId,
      ingestId: input.ingestId,
      problemId,
      detail: problemId ? 'pipeline_promoted' : 'no_plan_item_impact',
    });
    await this.ledgerStore.upsert(input.tripId, entry);
    return this.resultFromLedger(input, entry);
  }

  private async promoteWeatherRecovery(
    input: AssertionPromotionRequest,
    promotionKey: string,
  ): Promise<AssertionPromotionResult> {
    if (!isAssertionPromotionWeatherEnabled()) {
      return this.skipped(input, 'weather_promotion_disabled');
    }

    const dayIndex = input.dayIndex ?? 0;
    const riskTier = input.riskTier ?? 'CALM';
    const shadowMode = isAssertionPromotionShadowMode();

    if (shadowMode) {
      const calmStreak = await this.vedurStore.trackCalmRecoveryStreak(
        input.tripId,
        dayIndex,
        riskTier,
        { fingerprint: input.ingestId },
      );
      const entry = this.ledgerStore.createEntry({
        promotionKey,
        signal: 'RECOVERY_OBSERVED',
        status: 'RECOVERY_SHADOW',
        shadowMode: true,
        ingestId: input.ingestId,
        detail: `recovery_observed calmStreak=${calmStreak} tier=${riskTier}`,
      });
      await this.ledgerStore.upsert(input.tripId, entry);
      this.logger.log(
        `[AssertionPromotion] RECOVERY_SHADOW trip=${input.tripId} day=${dayIndex} streak=${calmStreak}`,
      );
      return this.resultFromLedger(input, entry);
    }

    const recovery = await maybeRecoverWeatherProblemAfterCalmPoll({
      tripId: input.tripId,
      dayIndex,
      riskTier,
      ingestOutcome: 'SILENT',
      sourceProvider: 'iceland_met',
      problemStore: this.problemStore,
      vedurStore: this.vedurStore,
      jobRunId: input.ingestId,
    });

    const entry = this.ledgerStore.createEntry({
      promotionKey,
      signal: 'RECOVERY_OBSERVED',
      status: recovery.recovered ? 'RECOVERED' : 'SKIPPED',
      shadowMode: false,
      ingestId: input.ingestId,
      recoveredProblemId: recovery.problemId,
      detail: recovery.recovered
        ? `recovered streak=${recovery.calmStreak}`
        : `not_recovered streak=${recovery.calmStreak}`,
    });
    await this.ledgerStore.upsert(input.tripId, entry);
    return this.resultFromLedger(input, entry);
  }

  private async recordFailure(
    input: AssertionPromotionRequest,
    promotionKey: string,
    message: string,
  ): Promise<AssertionPromotionResult> {
    const prev = await this.ledgerStore.getByKey(input.tripId, promotionKey);
    const attempts = (prev?.attempts ?? 0) + 1;
    const maxAttempts = resolveAssertionPromotionMaxAttempts();
    const retryMs = resolveAssertionPromotionRetryIntervalMs();
    const entry = this.ledgerStore.createEntry({
      promotionKey,
      signal: input.signal,
      status: 'FAILED',
      shadowMode: isAssertionPromotionShadowMode(),
      assertionId: input.assertionId,
      eventId: input.eventId,
      ingestId: input.ingestId,
      attempts,
      lastError: message,
      nextRetryAt:
        attempts < maxAttempts
          ? new Date(Date.now() + retryMs).toISOString()
          : undefined,
      detail: message,
    });
    await this.ledgerStore.upsert(input.tripId, entry);
    this.logger.warn(
      `[AssertionPromotion] FAILED trip=${input.tripId} key=${promotionKey} attempt=${attempts}: ${message}`,
    );
    return this.resultFromLedger(input, entry);
  }

  private async skipped(
    input: AssertionPromotionRequest,
    detail: string,
  ): Promise<AssertionPromotionResult> {
    const promotionKey = resolvePromotionKey({
      signal: input.signal,
      predicate: input.predicate,
      dayIndex: input.dayIndex,
      roadId: input.roadId,
    });
    return {
      schemaId: ASSERTION_PROMOTION_SCHEMA_ID,
      tripId: input.tripId,
      promotionKey,
      signal: input.signal,
      status: 'SKIPPED',
      shadowMode: isAssertionPromotionShadowMode(),
      skipped: true,
      detail,
    };
  }

  private resultFromLedger(
    input: AssertionPromotionRequest,
    entry: AssertionPromotionLedgerEntry,
    skipped = false,
  ): AssertionPromotionResult {
    return {
      schemaId: ASSERTION_PROMOTION_SCHEMA_ID,
      tripId: input.tripId,
      promotionKey: entry.promotionKey,
      signal: entry.signal,
      status: entry.status,
      shadowMode: entry.shadowMode,
      skipped,
      detail: entry.detail,
      problemId: entry.problemId,
      recoveredProblemId: entry.recoveredProblemId,
      ledgerId: entry.ledgerId,
    };
  }

  private isTerminalSuccess(status: AssertionPromotionLedgerEntry['status']): boolean {
    return (
      status === 'SHADOW_OBSERVED' ||
      status === 'PROMOTED' ||
      status === 'RECOVERY_SHADOW' ||
      status === 'RECOVERED'
    );
  }

  private dayIndexFromPromotionKey(key: string): number | undefined {
    const m = key.match(/:day:(\d+):/);
    return m ? Number(m[1]) : undefined;
  }

  private nextSuccessAttempt(prev?: AssertionPromotionLedgerEntry): number {
    if (!prev) return 1;
    return (prev.attempts ?? 0) + 1;
  }
}
