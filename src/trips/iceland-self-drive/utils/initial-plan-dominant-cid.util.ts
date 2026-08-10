/**
 * Audit utils for Independent VERIFY — deterministic, replayable.
 */

import type {
  ConstraintAssessmentEvidence,
  InitialPlanDriftVector,
  InitialPlanVerificationAudit,
  AuthoritativeAggregateOutcome,
} from '../types/iceland-initial-plan-verification.types';
import type { InitialPlanArrangeInput } from '../types/iceland-initial-plan-seed.types';
import type { InitialPlanProposal } from '../types/iceland-initial-plan-proposal.types';

const OUTCOME_RANK: Record<AuthoritativeAggregateOutcome, number> = {
  EXECUTION_BLOCK: 100,
  BLOCK: 80,
  REPAIR: 60,
  NEED_CONFIRM: 40,
  WARN: 20,
  PASS: 0,
};

/** Severity rank for dominant_cid selection */
function statusRank(s: ConstraintAssessmentEvidence['status']): number {
  switch (s) {
    case 'EXECUTION_BLOCK':
      return 100;
    case 'BLOCK':
      return 80;
    case 'REPAIR':
      return 60;
    case 'NEED_CONFIRM':
      return 40;
    case 'WARN':
      return 20;
    default:
      return 0;
  }
}

/**
 * Pick dominant_cid deterministically:
 * EXECUTION_BLOCK > BLOCK > most-negative slack > NEED_CONFIRM > WARN > stable cid sort
 */
export function selectDominantCid(
  assessments: ConstraintAssessmentEvidence[],
): string | undefined {
  const candidates = assessments.filter((a) => a.status !== 'PASS');
  if (!candidates.length) return undefined;

  const sorted = [...candidates].sort((a, b) => {
    const sr = statusRank(b.status) - statusRank(a.status);
    if (sr !== 0) return sr;
    const sa = a.slack ?? 0;
    const sb = b.slack ?? 0;
    if (sa !== sb) return sa - sb; // more negative first
    return a.cid.localeCompare(b.cid);
  });
  return sorted[0]?.cid;
}

export function computeDriftVector(input: {
  arrange: InitialPlanArrangeInput;
  proposal: InitialPlanProposal;
  priorProposal?: InitialPlanProposal;
}): InitialPlanDriftVector {
  const arrangedIds = new Set(
    input.arrange.attractionCandidates.map((a) => a.canonicalPlaceId),
  );
  const proposalIds = new Set(
    input.proposal.days.flatMap((d) =>
      d.items.map((i) => i.placeId).filter((x): x is number => x != null),
    ),
  );
  const selectedCandidateChanged = [...proposalIds].filter((id) => !arrangedIds.has(id))
    .length;
  const excludedCandidateChanged = [...arrangedIds].filter((id) => !proposalIds.has(id))
    .length;

  let dayAssignmentChanged = 0;
  let durationChangedMin = 0;
  let drivingChangedMin = 0;
  let subregionScopeChanged = 0;

  if (input.priorProposal) {
    const priorByDay = new Map(
      input.priorProposal.days.map((d) => [
        d.dayIndex,
        d.items.map((i) => i.placeId ?? i.itemId).sort().join(','),
      ]),
    );
    for (const d of input.proposal.days) {
      const prev = priorByDay.get(d.dayIndex);
      const cur = d.items.map((i) => i.placeId ?? i.itemId).sort().join(',');
      if (prev != null && prev !== cur) dayAssignmentChanged += 1;
      const prevDay = input.priorProposal.days.find((x) => x.dayIndex === d.dayIndex);
      if (prevDay) {
        durationChangedMin += Math.abs(d.activityMinutes - prevDay.activityMinutes);
        drivingChangedMin += Math.abs(d.drivingMinutes - prevDay.drivingMinutes);
        if ((prevDay.subregionId ?? '') !== (d.subregionId ?? '')) {
          subregionScopeChanged += 1;
        }
      }
    }
  } else {
    // Arrange → Proposal: count days that have items vs candidate pool pressure
    dayAssignmentChanged = input.proposal.days.filter((d) => d.items.length > 0).length;
    durationChangedMin = input.proposal.days.reduce((s, d) => s + d.activityMinutes, 0);
    drivingChangedMin = input.proposal.days.reduce((s, d) => s + d.drivingMinutes, 0);
    subregionScopeChanged = input.proposal.days.filter((d) => d.subregionId).length;
  }

  return {
    dayAssignmentChanged,
    selectedCandidateChanged,
    excludedCandidateChanged,
    durationChangedMin,
    drivingChangedMin,
    subregionScopeChanged,
  };
}

export interface ConsistencyFingerprint {
  aggregateOutcome: AuthoritativeAggregateOutcome;
  dominant_cid?: string;
  blockingCids: string[];
  confirmCids: string[];
  affectedDayIndexes: number[];
  criticalSlacks: Array<{ cid: string; slack: number }>;
}

export function buildConsistencyFingerprint(
  outcome: AuthoritativeAggregateOutcome,
  assessments: ConstraintAssessmentEvidence[],
  dominant_cid?: string,
): ConsistencyFingerprint {
  const blockingCids = assessments
    .filter((a) => a.status === 'BLOCK' || a.status === 'EXECUTION_BLOCK')
    .map((a) => a.cid)
    .sort();
  const confirmCids = assessments
    .filter((a) => a.status === 'NEED_CONFIRM')
    .map((a) => a.cid)
    .sort();
  const affectedDayIndexes = [
    ...new Set(
      assessments
        .map((a) => a.affectedDayIndex)
        .filter((x): x is number => typeof x === 'number'),
    ),
  ].sort((a, b) => a - b);
  const criticalSlacks = assessments
    .filter((a) => a.slack != null && a.slack < 0)
    .map((a) => ({ cid: a.cid, slack: a.slack! }))
    .sort((a, b) => a.cid.localeCompare(b.cid));

  return {
    aggregateOutcome: outcome,
    dominant_cid,
    blockingCids,
    confirmCids,
    affectedDayIndexes,
    criticalSlacks,
  };
}

/**
 * Compare two fingerprints → session_consistency_score in [0,1].
 * Deterministic; identical inputs → 1.0.
 */
export function computeSessionConsistencyScore(
  a: ConsistencyFingerprint,
  b: ConsistencyFingerprint,
): number {
  const checks: boolean[] = [
    a.aggregateOutcome === b.aggregateOutcome,
    a.dominant_cid === b.dominant_cid,
    JSON.stringify(a.blockingCids) === JSON.stringify(b.blockingCids),
    JSON.stringify(a.confirmCids) === JSON.stringify(b.confirmCids),
    JSON.stringify(a.affectedDayIndexes) === JSON.stringify(b.affectedDayIndexes),
    JSON.stringify(a.criticalSlacks) === JSON.stringify(b.criticalSlacks),
  ];
  const pass = checks.filter(Boolean).length;
  return pass / checks.length;
}

export function consistencyBand(
  score: number,
): InitialPlanVerificationAudit['consistencyBand'] {
  if (score >= 0.99) return 'CONSISTENT';
  if (score >= 0.95) return 'MINOR_DRIFT';
  return 'INCONSISTENT';
}

export function buildAudit(input: {
  outcome: AuthoritativeAggregateOutcome;
  assessments: ConstraintAssessmentEvidence[];
  drift_vector: InitialPlanDriftVector;
  /** Prior fingerprint for consistency; if omitted, score = 1.0 against self */
  priorFingerprint?: ConsistencyFingerprint;
}): InitialPlanVerificationAudit {
  const dominant_cid = selectDominantCid(input.assessments);
  const fp = buildConsistencyFingerprint(
    input.outcome,
    input.assessments,
    dominant_cid,
  );
  const prior = input.priorFingerprint ?? fp;
  const session_consistency_score = computeSessionConsistencyScore(fp, prior);

  const delta_reason: string[] = [];
  if (fp.aggregateOutcome !== prior.aggregateOutcome) {
    delta_reason.push(`outcome:${prior.aggregateOutcome}->${fp.aggregateOutcome}`);
  }
  if (fp.dominant_cid !== prior.dominant_cid) {
    delta_reason.push(`dominant_cid:${prior.dominant_cid}->${fp.dominant_cid}`);
  }
  for (const c of fp.blockingCids) {
    if (!prior.blockingCids.includes(c)) delta_reason.push(`new_block:${c}`);
  }

  const delta_utility =
    OUTCOME_RANK[prior.aggregateOutcome] - OUTCOME_RANK[fp.aggregateOutcome];

  return {
    dominant_cid,
    drift_vector: input.drift_vector,
    session_consistency_score,
    consistencyBand: consistencyBand(session_consistency_score),
    delta_reason,
    delta_utility,
    blockingCids: fp.blockingCids,
    confirmCids: fp.confirmCids,
    affectedDayIndexes: fp.affectedDayIndexes,
    criticalSlacks: fp.criticalSlacks,
  };
}

export { OUTCOME_RANK };
