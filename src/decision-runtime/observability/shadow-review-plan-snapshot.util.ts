/**
 * Build blinded plan snapshots for manual review (no strategy labels).
 */

import type { DecisionCandidate } from '../candidates/contracts/decision-candidate';
import type { CanonicalConstraintReport } from '../constraints/contracts/canonical-constraint-report';
import type { ReviewPlanSnapshot, FrozenReviewPlanSnapshot } from './shadow-review.types';
import { stableHash } from './shadow-input-hash.util';

export function buildFrozenReviewPlanSnapshot(input: {
  candidate: DecisionCandidate;
  constraintReport?: CanonicalConstraintReport;
  snapshotId?: string;
  objectiveVersion?: string;
  strategyVersionHidden?: string;
}): FrozenReviewPlanSnapshot {
  const publicView = buildReviewPlanSnapshot(input);
  return {
    ...publicView,
    candidateId: input.candidate.candidateId,
    candidateHash: stableHash({
      candidateId: input.candidate.candidateId,
      plan: input.candidate.plan,
      utilityHint: input.candidate.utilityHint ?? null,
    }),
    planJson: input.candidate.plan,
    constraintSummaryJson: input.constraintReport
      ? {
          overallStatus: input.constraintReport.overallStatus,
          degraded: input.constraintReport.degraded,
          assertionCount: input.constraintReport.assertions?.length ?? 0,
        }
      : undefined,
    snapshotId: input.snapshotId,
    objectiveVersion: input.objectiveVersion,
    strategyVersionHidden: input.strategyVersionHidden,
    createdAt: new Date().toISOString(),
  };
}

export function buildReviewPlanSnapshot(input: {
  candidate: DecisionCandidate;
  constraintReport?: CanonicalConstraintReport;
}): ReviewPlanSnapshot {
  const plan = input.candidate.plan;
  if (!plan?.days?.length) {
    return {
      schemaId: 'tripnara.review_plan_snapshot@v1',
      dayCount: 0,
      slotCount: 0,
      totalDriveMinutes: 0,
      days: [],
      utilityHint: input.candidate.utilityHint,
      feasibilityLabel: 'UNKNOWN',
    };
  }
  let totalDrive = 0;
  let slotCount = 0;

  const days = (plan.days ?? []).map((day) => {
    let dayDrive = 0;
    const slots = (day.timeSlots ?? []).map((slot) => {
      slotCount += 1;
      const drive = slot.travelLegFromPrev?.durationMin ?? 0;
      dayDrive += drive;
      totalDrive += drive;
      return {
        title: slot.title,
        startTime: slot.time,
        endTime: slot.endTime,
        driveMinutesFromPrev: drive > 0 ? drive : undefined,
      };
    });
    return {
      day: day.day,
      date: day.date,
      slots,
      totalDriveMinutes: dayDrive > 0 ? dayDrive : undefined,
    };
  });

  const status = input.constraintReport?.overallStatus;

  return {
    schemaId: 'tripnara.review_plan_snapshot@v1',
    dayCount: days.length,
    slotCount,
    totalDriveMinutes: totalDrive,
    days,
    utilityHint: input.candidate.utilityHint,
    feasibilityLabel:
      status === 'FEASIBLE' ||
      status === 'UNVERIFIED' ||
      status === 'INFEASIBLE'
        ? status
        : 'UNKNOWN',
  };
}

export function reviewPlanContentHash(snapshot: ReviewPlanSnapshot): string {
  return stableHash({
    dayCount: snapshot.dayCount,
    slotCount: snapshot.slotCount,
    totalDriveMinutes: snapshot.totalDriveMinutes,
    days: snapshot.days,
    utilityHint: snapshot.utilityHint ?? null,
  });
}

export function candidatesHaveEquivalentPlans(
  a: ReviewPlanSnapshot | FrozenReviewPlanSnapshot,
  b: ReviewPlanSnapshot | FrozenReviewPlanSnapshot,
): boolean {
  const hashA = 'candidateHash' in a ? a.candidateHash : reviewPlanContentHash(a);
  const hashB = 'candidateHash' in b ? b.candidateHash : reviewPlanContentHash(b);
  return hashA === hashB || reviewPlanContentHash(a) === reviewPlanContentHash(b);
}
