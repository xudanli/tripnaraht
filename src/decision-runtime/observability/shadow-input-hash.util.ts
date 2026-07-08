/**
 * Stable input fingerprints for shadow comparison validity.
 */

import { createHash } from 'crypto';
import type { CanonicalConstraintReport } from '../constraints/contracts/canonical-constraint-report';
import type { DecisionCandidate } from '../candidates/contracts/decision-candidate';
import type { ObjectiveProfile } from '../contracts/objective-definition';
import type { CanonicalWorldStateSnapshot } from '../contracts/world-state-snapshot';
import type { ShadowInputFingerprint } from './shadow-divergence.types';

export const CONSTRAINT_REPORT_VERSION = 'canonical_constraint_report@v1';

export function stableHash(value: unknown): string {
  const json = stableStringify(value);
  return createHash('sha256').update(json).digest('hex').slice(0, 16);
}

export function hashSnapshot(snapshot: CanonicalWorldStateSnapshot): string {
  return stableHash({
    snapshotId: snapshot.snapshotId,
    revision: snapshot.revision,
    completeness: snapshot.completeness,
    poiCount: snapshot.poiStates?.length ?? 0,
  });
}

export function hashCandidateSet(candidates: DecisionCandidate[]): string {
  const payload = candidates
    .map((c) => ({
      candidateId: c.candidateId,
      source: c.source,
      utilityHint: c.utilityHint ?? null,
      label: c.label,
      planVersion: c.plan.version,
      dayCount: c.plan.days?.length ?? 0,
      slotCount: (c.plan.days ?? []).reduce(
        (n, d) => n + (d.timeSlots?.length ?? 0),
        0,
      ),
    }))
    .sort((a, b) => a.candidateId.localeCompare(b.candidateId));
  return stableHash(payload);
}

export function hashConstraintReports(
  reports: Record<string, CanonicalConstraintReport>,
): string {
  const payload = Object.keys(reports)
    .sort()
    .map((id) => ({
      candidateId: id,
      overallStatus: reports[id]?.overallStatus,
      degraded: reports[id]?.degraded,
      assertionCount: reports[id]?.assertions?.length ?? 0,
      assertionCodes: (reports[id]?.assertions ?? [])
        .map((a) => `${a.reasonCode}:${a.status}`)
        .sort(),
    }));
  return stableHash({ version: CONSTRAINT_REPORT_VERSION, payload });
}

export function hashObjectiveConfig(profile: ObjectiveProfile): string {
  const enabled = [...profile.enabledObjectives].sort();
  return stableHash({
    registryVersion: profile.registryVersion,
    enabledObjectives: enabled,
    weights: profile.weights ?? {},
  });
}

export function buildShadowInputFingerprint(input: {
  snapshotId: string;
  snapshot?: CanonicalWorldStateSnapshot;
  candidates: DecisionCandidate[];
  constraintReports: Record<string, CanonicalConstraintReport>;
  objectiveRegistryVersion: string;
  objectiveProfile: ObjectiveProfile;
  authorityStrategyVersion?: string;
  shadowStrategyVersion?: string;
}): ShadowInputFingerprint {
  const snapshotHash = input.snapshot
    ? hashSnapshot(input.snapshot)
    : stableHash({ snapshotId: input.snapshotId });

  return {
    snapshotId: input.snapshotId,
    snapshotHash,
    candidateSetHash: hashCandidateSet(input.candidates),
    candidateCount: input.candidates.length,
    constraintReportHash: hashConstraintReports(input.constraintReports),
    constraintReportVersion: CONSTRAINT_REPORT_VERSION,
    objectiveRegistryVersion: input.objectiveRegistryVersion,
    objectiveConfigHash: hashObjectiveConfig(input.objectiveProfile),
    authorityStrategyVersion: input.authorityStrategyVersion,
    shadowStrategyVersion: input.shadowStrategyVersion,
  };
}

/** All four hashes must match for algorithm comparison eligibility. */
export function isEligibleForStrategyComparison(
  fingerprint: ShadowInputFingerprint,
  expected?: Partial<ShadowInputFingerprint>,
): boolean {
  if (expected?.snapshotHash && fingerprint.snapshotHash !== expected.snapshotHash) {
    return false;
  }
  if (
    expected?.candidateSetHash &&
    fingerprint.candidateSetHash !== expected.candidateSetHash
  ) {
    return false;
  }
  if (
    expected?.constraintReportHash &&
    fingerprint.constraintReportHash !== expected.constraintReportHash
  ) {
    return false;
  }
  if (
    expected?.objectiveConfigHash &&
    fingerprint.objectiveConfigHash !== expected.objectiveConfigHash
  ) {
    return false;
  }
  return (
    fingerprint.snapshotHash.length > 0 &&
    fingerprint.candidateSetHash.length > 0 &&
    fingerprint.constraintReportHash.length > 0 &&
    fingerprint.objectiveConfigHash.length > 0 &&
    fingerprint.objectiveRegistryVersion.length > 0
  );
}

export function fingerprintsMatch(
  a: ShadowInputFingerprint,
  b: ShadowInputFingerprint,
): boolean {
  return (
    a.snapshotHash === b.snapshotHash &&
    a.candidateSetHash === b.candidateSetHash &&
    a.objectiveRegistryVersion === b.objectiveRegistryVersion &&
    a.objectiveConfigHash === b.objectiveConfigHash &&
    a.constraintReportHash === b.constraintReportHash
  );
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortKeys(obj[key]);
  }
  return sorted;
}
