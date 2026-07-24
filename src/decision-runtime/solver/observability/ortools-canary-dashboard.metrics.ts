/**
 * M4 canary dashboard — authorization chain audit (not solver score).
 */

import { Injectable } from '@nestjs/common';

export interface CanaryDecisionTrace {
  decisionId: string;
  tripId?: string;
  operation?: string;
  at: string;
  canaryStage?: string;
  whitelistMatched?: boolean;
  authorityArtifactId?: string;
  authorityTokenId?: string;
  candidateProvider: 'ortools-repair' | 'neptune-repair' | string;
  decisionAuthority: string;
  writeAuthorizer: string;
  fallbackProvider: 'neptune-repair' | string;
  gatewayResult?: 'PASS' | 'BLOCK' | 'SKIP' | string;
  decisionResult?: 'ACCEPT' | 'REJECT' | 'FALLBACK' | string;
  evidenceVersionAtSolve?: string;
  evidenceVersionAtExecute?: string;
  planVersionId?: string;
  rollbackReason?: string;
  elapsedMs?: number;
  outcomes: {
    gatewayBypass: boolean;
    unauthorizedPlanVersionWrite: boolean;
    evidenceStaleContinued: boolean;
    bookedContentMutated: boolean;
    autoFallbackFailed: boolean;
    duplicatePlanVersion?: boolean;
    userRejected?: boolean;
    fellBackToNeptune?: boolean;
    executabilityWorsened?: boolean;
    revalidatedAfterWrite?: boolean;
    localityOk?: boolean;
    candidateAccepted?: boolean;
    travelDeltaMin?: number;
    timeWindowImproved?: boolean;
  };
}

export interface CanaryDashboardSnapshot {
  schemaId: 'tripnara.ortools_canary_dashboard@v1';
  decisionsTotal: number;
  views: {
    safety: {
      gatewayBypass: number;
      unauthorizedPlanVersionWrite: number;
      bookedContentMutated: number;
      evidenceStaleContinued: number;
      duplicatePlanVersion: number;
      autoFallbackFailed: number;
      executabilityWorsened: number;
    };
    quality: {
      candidatePassRate: number | null;
      neptuneFallbackRate: number | null;
      localityPassRate: number | null;
      userRejectRate: number | null;
      meanTravelDeltaMin: number | null;
      timeWindowImprovedRate: number | null;
    };
    release: {
      whitelistMatchedTotal: number;
      triggeredTotal: number;
      successfulWrites: number;
      rollbacks: number;
      distinctTrips: number;
      canaryStagesSeen: string[];
    };
  };
  /** @deprecated prefer views.safety */
  zeros: CanaryDashboardSnapshot['views']['safety'];
  observed: {
    userRejectRate: number | null;
    neptuneFallbackRate: number | null;
    revalidatedAfterWriteRate: number | null;
    localityPassRate: number | null;
  };
  recent: CanaryDecisionTrace[];
}

@Injectable()
export class OrToolsCanaryDashboardCollector {
  private readonly traces: CanaryDecisionTrace[] = [];
  private readonly maxKeep: number;

  constructor() {
    this.maxKeep = 500;
  }

  record(trace: CanaryDecisionTrace): void {
    this.traces.push(trace);
    if (this.traces.length > this.maxKeep) {
      this.traces.splice(0, this.traces.length - this.maxKeep);
    }
  }

  snapshot(): CanaryDashboardSnapshot {
    const n = this.traces.length;
    const count = (fn: (t: CanaryDecisionTrace) => boolean) =>
      this.traces.filter(fn).length;
    const rate = (
      num: number,
      den: number,
    ): number | null => (den === 0 ? null : num / den);

    const userDecided = this.traces.filter(
      (t) => t.outcomes.userRejected !== undefined,
    );
    const revalKnown = this.traces.filter(
      (t) => t.outcomes.revalidatedAfterWrite !== undefined,
    );
    const localityKnown = this.traces.filter(
      (t) => t.outcomes.localityOk !== undefined,
    );
    const candidateKnown = this.traces.filter(
      (t) => t.outcomes.candidateAccepted !== undefined,
    );
    const twKnown = this.traces.filter(
      (t) => t.outcomes.timeWindowImproved !== undefined,
    );
    const travel = this.traces
      .map((t) => t.outcomes.travelDeltaMin)
      .filter((x): x is number => typeof x === 'number');

    const safety = {
      gatewayBypass: count((t) => t.outcomes.gatewayBypass),
      unauthorizedPlanVersionWrite: count(
        (t) => t.outcomes.unauthorizedPlanVersionWrite,
      ),
      bookedContentMutated: count((t) => t.outcomes.bookedContentMutated),
      evidenceStaleContinued: count((t) => t.outcomes.evidenceStaleContinued),
      duplicatePlanVersion: count((t) => t.outcomes.duplicatePlanVersion === true),
      autoFallbackFailed: count((t) => t.outcomes.autoFallbackFailed),
      executabilityWorsened: count(
        (t) => t.outcomes.executabilityWorsened === true,
      ),
    };

    const stages = [
      ...new Set(
        this.traces
          .map((t) => t.canaryStage)
          .filter((s): s is string => Boolean(s)),
      ),
    ];

    return {
      schemaId: 'tripnara.ortools_canary_dashboard@v1',
      decisionsTotal: n,
      views: {
        safety,
        quality: {
          candidatePassRate: rate(
            count((t) => t.outcomes.candidateAccepted === true),
            candidateKnown.length,
          ),
          neptuneFallbackRate: rate(
            count((t) => t.outcomes.fellBackToNeptune === true),
            n,
          ),
          localityPassRate: rate(
            count((t) => t.outcomes.localityOk === true),
            localityKnown.length,
          ),
          userRejectRate: rate(
            count((t) => t.outcomes.userRejected === true),
            userDecided.length,
          ),
          meanTravelDeltaMin:
            travel.length === 0
              ? null
              : travel.reduce((a, b) => a + b, 0) / travel.length,
          timeWindowImprovedRate: rate(
            count((t) => t.outcomes.timeWindowImproved === true),
            twKnown.length,
          ),
        },
        release: {
          whitelistMatchedTotal: count((t) => t.whitelistMatched === true),
          triggeredTotal: n,
          successfulWrites: count(
            (t) =>
              Boolean(t.planVersionId) &&
              t.outcomes.unauthorizedPlanVersionWrite === false,
          ),
          rollbacks: count((t) => Boolean(t.rollbackReason)),
          distinctTrips: new Set(
            this.traces.map((t) => t.tripId).filter(Boolean),
          ).size,
          canaryStagesSeen: stages,
        },
      },
      zeros: safety,
      observed: {
        userRejectRate: rate(
          count((t) => t.outcomes.userRejected === true),
          userDecided.length,
        ),
        neptuneFallbackRate: rate(
          count((t) => t.outcomes.fellBackToNeptune === true),
          n,
        ),
        revalidatedAfterWriteRate: rate(
          count((t) => t.outcomes.revalidatedAfterWrite === true),
          revalKnown.length,
        ),
        localityPassRate: rate(
          count((t) => t.outcomes.localityOk === true),
          localityKnown.length,
        ),
      },
      recent: this.traces.slice(-20),
    };
  }

  hasSafetyIncident(snap?: CanaryDashboardSnapshot): boolean {
    const s = snap ?? this.snapshot();
    return Object.values(s.views.safety).some((v) => v > 0);
  }
}
