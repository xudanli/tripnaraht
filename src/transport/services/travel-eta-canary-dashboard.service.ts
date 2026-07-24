/**
 * ETA-L2-CANARY-01 — Canary dashboard (VALID-only MAE) + adjustment rule adjudication.
 */

import { Injectable, Optional } from '@nestjs/common';
import type { TravelEtaAdjustmentReason } from '../contracts/travel-eta.contract';
import type { TravelEtaSampleQuality } from '../contracts/travel-eta-actual.contract';
import type { TravelEtaReconciliationEventV1 } from '../contracts/travel-eta-reconciliation.contract';
import {
  buildCanaryMetricsFromEvents,
  evaluateIcelandDefaultGateReview,
  type TravelEtaAdjustmentRuleVerdict,
  type TravelEtaCanaryDashboardSnapshotV1,
  type TravelEtaCanarySafetyCounters,
  type TravelEtaDefaultGateReviewV1,
  type TravelEtaL2RolloutStage,
  ICELAND_DEFAULT_SUGGESTED_THRESHOLDS,
} from '../ops/travel-eta-l2-canary.gate';
import {
  evaluateTravelEtaL2AuthorityGate,
  resolveTravelEtaL2CanaryStage,
} from '../ops/travel-eta-l2-authority.gate';
import { TravelEtaReconciliationService } from './travel-eta-reconciliation.service';
import { TravelEtaActualCaptureService } from './travel-eta-actual-capture.service';

/** Forbid single-sample parameter changes — need at least this many VALID per reason. */
export const MIN_VALID_SAMPLES_FOR_RULE_VERDICT = 5;

export interface AdjustmentRuleAdjudicationRow {
  reason: TravelEtaAdjustmentReason;
  validSampleCount: number;
  meanPlanningErrorMin: number | null;
  severeUnderestimateCount: number;
  overBufferCount: number;
  verdict: TravelEtaAdjustmentRuleVerdict;
  evidenceNote: string;
}

export interface AdjustmentRuleAdjudicationReportV1 {
  schemaId: 'tripnara.travel_eta_l2_rule_adjudication@v1';
  generatedAt: string;
  minValidSamples: number;
  rows: AdjustmentRuleAdjudicationRow[];
  notes: string;
}

@Injectable()
export class TravelEtaCanaryDashboardService {
  constructor(
    @Optional() private readonly reconciliation?: TravelEtaReconciliationService,
    @Optional() private readonly actualCapture?: TravelEtaActualCaptureService,
  ) {}

  buildSnapshot(input?: {
    events?: Array<TravelEtaReconciliationEventV1 & { sampleQuality?: TravelEtaSampleQuality }>;
    authoritativeTripCount?: number;
    authoritativeSegmentCount?: number;
    dem20mHitRate?: number | null;
    requiredTerrainCoverage?: number | null;
    safety?: Partial<TravelEtaCanarySafetyCounters>;
    stage?: TravelEtaL2RolloutStage;
  }): TravelEtaCanaryDashboardSnapshotV1 {
    const events =
      input?.events ??
      (this.reconciliation?.listEvents(2_000) as Array<
        TravelEtaReconciliationEventV1 & { sampleQuality?: TravelEtaSampleQuality }
      >) ??
      [];

    const metrics = buildCanaryMetricsFromEvents(events);
    const gate = evaluateTravelEtaL2AuthorityGate();
    const stage = (input?.stage ?? resolveTravelEtaL2CanaryStage()) as TravelEtaL2RolloutStage;

    const safety: TravelEtaCanarySafetyCounters = {
      closedScheduledCount: input?.safety?.closedScheduledCount ?? 0,
      twoWdOnForced4WdCount: input?.safety?.twoWdOnForced4WdCount ?? 0,
      requiredTerrainSkippedCount: input?.safety?.requiredTerrainSkippedCount ?? 0,
      unknownProviderAuthoritativeCount:
        input?.safety?.unknownProviderAuthoritativeCount ?? 0,
      killSwitchRollbackFailures: input?.safety?.killSwitchRollbackFailures ?? 0,
    };

    return {
      schemaId: 'tripnara.travel_eta_l2_canary_dashboard@v1',
      stage,
      generatedAt: new Date().toISOString(),
      authoritativeTripCount: input?.authoritativeTripCount ?? 0,
      authoritativeSegmentCount: input?.authoritativeSegmentCount ?? 0,
      ...metrics,
      dem20mHitRate: input?.dem20mHitRate ?? null,
      requiredTerrainCoverage: input?.requiredTerrainCoverage ?? null,
      safety,
      killSwitchActive: gate.killSwitch,
    };
  }

  /**
   * Adjudicate each adjustment reason. Single VALID sample → INSUFFICIENT_EVIDENCE (never TUNE).
   */
  adjudicateAdjustmentRules(
    events?: Array<TravelEtaReconciliationEventV1 & { sampleQuality?: TravelEtaSampleQuality }>,
  ): AdjustmentRuleAdjudicationReportV1 {
    const list =
      events ??
      (this.reconciliation?.listEvents(2_000) as Array<
        TravelEtaReconciliationEventV1 & { sampleQuality?: TravelEtaSampleQuality }
      >) ??
      [];

    const valid = list.filter(
      (e) => e.sampleQuality === 'VALID' && e.actualDurationMin != null && e.phase === 'ACTUAL',
    );

    const byReason = new Map<TravelEtaAdjustmentReason, typeof valid>();
    for (const e of valid) {
      for (const r of e.adjustmentReasons ?? []) {
        const arr = byReason.get(r) ?? [];
        arr.push(e);
        byReason.set(r, arr);
      }
    }

    const severeMin = ICELAND_DEFAULT_SUGGESTED_THRESHOLDS.severeUnderestimateMinMin;
    const rows: AdjustmentRuleAdjudicationRow[] = [];

    for (const [reason, samples] of byReason) {
      const n = samples.length;
      const errors = samples.map((s) => (s.actualDurationMin as number) - s.planningDurationMin);
      const mean =
        errors.length === 0 ? null : errors.reduce((a, b) => a + b, 0) / errors.length;
      const severeUnderestimateCount = samples.filter(
        (s) => (s.actualDurationMin as number) - s.planningDurationMin > severeMin,
      ).length;
      const overBufferCount = samples.filter(
        (s) => (s.actualDurationMin as number) < s.planningDurationMin,
      ).length;

      let verdict: TravelEtaAdjustmentRuleVerdict;
      let evidenceNote: string;

      if (n < MIN_VALID_SAMPLES_FOR_RULE_VERDICT) {
        verdict = 'INSUFFICIENT_EVIDENCE';
        evidenceNote = `Need ≥${MIN_VALID_SAMPLES_FOR_RULE_VERDICT} VALID samples; have ${n}. Do not change coefficients.`;
      } else if (severeUnderestimateCount / n > 0.25) {
        verdict = 'TUNE';
        evidenceNote = `Severe underestimate rate ${(severeUnderestimateCount / n).toFixed(2)} — consider increasing buffer (multi-sample).`;
      } else if (overBufferCount / n > 0.7 && mean != null && mean < -20) {
        verdict = 'TUNE';
        evidenceNote = `Chronic over-buffer (mean error ${mean.toFixed(1)} min) — consider reducing buffer.`;
      } else if (Math.abs(mean ?? 0) < 8 && severeUnderestimateCount / n <= 0.1) {
        verdict = 'KEEP';
        evidenceNote = 'Error profile acceptable under current canary thresholds.';
      } else if (mean != null && mean > 25 && severeUnderestimateCount / n > 0.4) {
        verdict = 'DISABLE';
        evidenceNote = 'Rule correlates with large residual underestimates — review for disable.';
      } else {
        verdict = 'KEEP';
        evidenceNote = 'No strong signal to change; continue collecting VALID samples.';
      }

      // Hard rule: never TUNE/DISABLE on a single sample path (already covered by min, reinforce)
      if (n === 1 && verdict !== 'INSUFFICIENT_EVIDENCE') {
        verdict = 'INSUFFICIENT_EVIDENCE';
        evidenceNote = 'Single-sample change forbidden.';
      }

      rows.push({
        reason,
        validSampleCount: n,
        meanPlanningErrorMin: mean,
        severeUnderestimateCount,
        overBufferCount,
        verdict,
        evidenceNote,
      });
    }

    rows.sort((a, b) => a.reason.localeCompare(b.reason));

    return {
      schemaId: 'tripnara.travel_eta_l2_rule_adjudication@v1',
      generatedAt: new Date().toISOString(),
      minValidSamples: MIN_VALID_SAMPLES_FOR_RULE_VERDICT,
      rows,
      notes:
        'Never change L2 coefficients from a single VALID sample. Weather is observation-only.',
    };
  }

  /**
   * Review whether to promote selected_trips → iceland_canary_5%.
   * Uses same integrity/effect/safety checks; target stage recorded in notes.
   */
  reviewPromotionToCanary5pct(input?: {
    snapshot?: TravelEtaCanaryDashboardSnapshotV1;
  }): TravelEtaDefaultGateReviewV1 & { recommendNextStage: TravelEtaL2RolloutStage | 'hold' } {
    const snapshot = input?.snapshot ?? this.buildSnapshot({ stage: 'selected_trips' });
    const review = evaluateIcelandDefaultGateReview({ snapshot });

    // For 5% promote, relax valid sample floor slightly vs iceland_default (still suggested)
    const validOk = snapshot.validActualSampleCount >= 15;
    const safetyOk =
      snapshot.safety.closedScheduledCount === 0 &&
      snapshot.safety.twoWdOnForced4WdCount === 0 &&
      snapshot.safety.requiredTerrainSkippedCount === 0 &&
      snapshot.safety.unknownProviderAuthoritativeCount === 0 &&
      snapshot.safety.killSwitchRollbackFailures === 0;

    let recommendNextStage: TravelEtaL2RolloutStage | 'hold' = 'hold';
    if (review.decision === 'GO' && validOk && safetyOk) {
      recommendNextStage = 'iceland_canary_5%';
    } else if (review.decision === 'CONDITIONAL_GO' && safetyOk && validOk) {
      recommendNextStage = 'hold';
    }

    return {
      ...review,
      notes: `${review.notes} Promotion target: iceland_canary_5%. validSamples=${snapshot.validActualSampleCount} (5% suggest ≥15).`,
      recommendNextStage,
    };
  }
}
