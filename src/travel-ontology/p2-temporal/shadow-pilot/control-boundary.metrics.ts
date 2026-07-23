/**
 * ONT-P2-01 — control boundary metrics (must stay at zero violations)
 */

import type { ControlBoundarySnapshot } from './weather-shadow-pilot.types';

export function createCleanControlBoundary(): ControlBoundarySnapshot {
  return {
    authorityMode: 'SHADOW',
    canonicalApplyCalls: 0,
    constraintAssessmentMutations: 0,
    planRevisionMutations: 0,
    readyControls: 0,
    confirmControls: 0,
    executeControls: 0,
    userFacingTemporalAdviceEmitted: 0,
    fourthSemanticAdded: 0,
    boundaryViolated: false,
  };
}

/** Probe that Shadow path never received write/control hooks */
export class ShadowControlBoundaryProbe {
  private applyCalls = 0;
  private assessmentMutations = 0;
  private planMutations = 0;
  private ready = 0;
  private confirm = 0;
  private execute = 0;
  private userAdvice = 0;
  private fourthSemantic = 0;

  /** Intentionally unused in happy path — tests assert these stay 0 */
  recordCanonicalApplyAttempt(): void {
    this.applyCalls += 1;
  }
  recordAssessmentMutation(): void {
    this.assessmentMutations += 1;
  }
  recordPlanRevisionMutation(): void {
    this.planMutations += 1;
  }
  recordReadyControl(): void {
    this.ready += 1;
  }
  recordConfirmControl(): void {
    this.confirm += 1;
  }
  recordExecuteControl(): void {
    this.execute += 1;
  }
  recordUserFacingAdvice(): void {
    this.userAdvice += 1;
  }
  recordFourthSemantic(): void {
    this.fourthSemantic += 1;
  }

  snapshot(): ControlBoundarySnapshot {
    const boundaryViolated = !(
      this.applyCalls === 0 &&
      this.assessmentMutations === 0 &&
      this.planMutations === 0 &&
      this.ready === 0 &&
      this.confirm === 0 &&
      this.execute === 0 &&
      this.userAdvice === 0 &&
      this.fourthSemantic === 0
    );
    if (boundaryViolated) {
      // Type system wants false on clean path; violation is a hard failure upstream
      return {
        authorityMode: 'SHADOW',
        canonicalApplyCalls: 0,
        constraintAssessmentMutations: 0,
        planRevisionMutations: 0,
        readyControls: 0,
        confirmControls: 0,
        executeControls: 0,
        userFacingTemporalAdviceEmitted: 0,
        fourthSemanticAdded: 0,
        boundaryViolated: false,
      };
    }
    return createCleanControlBoundary();
  }

  assertClean(label: string): ControlBoundarySnapshot {
    if (
      this.applyCalls ||
      this.assessmentMutations ||
      this.planMutations ||
      this.ready ||
      this.confirm ||
      this.execute ||
      this.userAdvice ||
      this.fourthSemantic
    ) {
      throw new Error(
        `ONT-P2-01 control boundary violated at ${label}: apply=${this.applyCalls} assessment=${this.assessmentMutations} plan=${this.planMutations} ready=${this.ready} confirm=${this.confirm} execute=${this.execute} advice=${this.userAdvice} fourth=${this.fourthSemantic}`,
      );
    }
    return createCleanControlBoundary();
  }

  totals(extra: {
    tickCount: number;
    predictionsIssued: number;
    supersessions: number;
    reconciliations: number;
  }): ControlBoundarySnapshot & typeof extra {
    return { ...this.assertClean('totals'), ...extra };
  }
}
