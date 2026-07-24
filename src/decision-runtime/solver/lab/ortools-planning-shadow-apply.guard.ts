/**
 * ADR-008 S4 / P2 — apply path must never write ortoolsShadow.shadowChanges.
 * Stale planning shadow is observationally dropped (still never authoritative).
 */

import type { PlanProposal } from '../../../trips/arrange-itinerary/types/plan-proposal.types';
import type { PlanProposalChange } from '../../../trips/arrange-itinerary/types/plan-proposal.types';
import { selectUsableOrtToolsEvaluateShadow } from './ortools-shadow-evidence-freshness.util';

/** Only authoritative `proposal.changes` are executable. */
export function selectAuthoritativePlanProposalChanges(
  proposal: PlanProposal,
): PlanProposalChange[] {
  // P4.d: never apply unconfirmed MOVE_DAY shadow projections
  return (proposal.changes ?? []).filter(
    (c) =>
      !(
        c.note?.includes('[ortools-shadow]') &&
        c.note?.includes('MOVE_DAY')
      ),
  );
}

/**
 * Planning shadow usable for lab/compare only — never for apply.
 * `currentContextVersion` when provided must match attachment.contextVersion.
 */
export function selectUsableOrtToolsPlanningShadow(input: {
  proposal: PlanProposal;
  currentContextVersion?: number;
}) {
  const att = input.proposal.ortoolsShadow;
  if (!att) return undefined;
  if (
    input.currentContextVersion != null &&
    att.contextVersion !== input.currentContextVersion
  ) {
    return undefined;
  }
  const expectedEv =
    att.evidenceVersionId ??
    (att.contextVersion != null ? `ctx:${att.contextVersion}` : undefined);
  return selectUsableOrtToolsEvaluateShadow({
    attachment: att,
    currentEvidenceVersionId: expectedEv,
    currentSnapshotId: att.snapshotId ?? expectedEv,
  });
}

/** Defense: MOVE_DAY shadowChanges must never appear in applied changes. */
export function isOrtToolsMoveDayShadowApplyLeak(input: {
  appliedChanges: PlanProposalChange[];
}): boolean {
  return input.appliedChanges.some(
    (c) =>
      Boolean(c.note?.includes('MOVE_DAY')) &&
      Boolean(c.note?.includes('ortools-shadow')),
  );
}

/** True if a caller incorrectly tried to apply shadow MOVE list. */
export function isOrtToolsPlanningShadowApplyLeak(input: {
  appliedChanges: PlanProposalChange[];
  proposal: PlanProposal;
}): boolean {
  const shadow = input.proposal.ortoolsShadow?.shadowChanges ?? [];
  if (!shadow.length) return false;
  const authIds = new Set(
    selectAuthoritativePlanProposalChanges(input.proposal)
      .map((c) => c.itemId)
      .filter(Boolean),
  );
  const shadowOnly = shadow.filter(
    (c) => c.itemId && !authIds.has(c.itemId) && c.note?.includes('ortools-shadow'),
  );
  // Leak if every applied change is identically a shadow-only note set and auth was empty
  // or applied notes come only from ortools-shadow while auth differs.
  if (!input.appliedChanges.length) return false;
  const allAppliedAreShadowNotes = input.appliedChanges.every((c) =>
    Boolean(c.note?.includes('ortools-shadow')),
  );
  const authHasShadowNotes = selectAuthoritativePlanProposalChanges(
    input.proposal,
  ).some((c) => c.note?.includes('ortools-shadow'));
  return allAppliedAreShadowNotes && !authHasShadowNotes && shadowOnly.length > 0;
}
