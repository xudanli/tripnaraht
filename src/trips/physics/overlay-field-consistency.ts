import type { ExecutionOverlayFrame } from '../execution-overlay/execution-overlay-frame.types';
import type { UnifiedPhysicsField } from './unified-physics-field.types';

export type OverlayFieldConsistencyIssueKind =
  | 'OVERLAY_BLOCKED_NOT_IMPASSABLE'
  | 'FIELD_IMPASSABLE_NOT_OVERLAY_BLOCKED'
  | 'OVERLAY_HIGH_RISK_BUT_FIELD_STABLE';

export interface OverlayFieldConsistencyIssue {
  legId: string;
  kind: OverlayFieldConsistencyIssueKind;
  overlayFinalState: ExecutionOverlayFrame['finalExecutionState'];
  derived: UnifiedPhysicsField['derived'];
}

/**
 * P-Next 1.3 — Detect overlay ↔ unified-field semantic drift (debug / CI).
 *
 * Strong invariant (per contract): `BLOCKED` ⇔ `IMPASSABLE`.
 * Soft invariant: overlay `HIGH_RISK` must not pair with physics `STABLE` (field should reflect stress).
 */
export function checkOverlayFieldConsistency(
  frames: ExecutionOverlayFrame[],
  fields: UnifiedPhysicsField[],
): OverlayFieldConsistencyIssue[] {
  const byLeg = new Map(fields.map(f => [f.legId, f]));
  const issues: OverlayFieldConsistencyIssue[] = [];

  for (const frame of frames) {
    const field = byLeg.get(frame.legId);
    if (!field) {
      continue;
    }

    if (frame.finalExecutionState === 'BLOCKED' && field.derived !== 'IMPASSABLE') {
      issues.push({
        legId: frame.legId,
        kind: 'OVERLAY_BLOCKED_NOT_IMPASSABLE',
        overlayFinalState: frame.finalExecutionState,
        derived: field.derived,
      });
    }

    if (field.derived === 'IMPASSABLE' && frame.finalExecutionState !== 'BLOCKED') {
      issues.push({
        legId: frame.legId,
        kind: 'FIELD_IMPASSABLE_NOT_OVERLAY_BLOCKED',
        overlayFinalState: frame.finalExecutionState,
        derived: field.derived,
      });
    }

    if (frame.finalExecutionState === 'HIGH_RISK' && field.derived === 'STABLE') {
      issues.push({
        legId: frame.legId,
        kind: 'OVERLAY_HIGH_RISK_BUT_FIELD_STABLE',
        overlayFinalState: frame.finalExecutionState,
        derived: field.derived,
      });
    }
  }

  return issues;
}

export function assertOverlayFieldConsistency(
  frames: ExecutionOverlayFrame[],
  fields: UnifiedPhysicsField[],
  context = 'assertOverlayFieldConsistency',
): void {
  const issues = checkOverlayFieldConsistency(frames, fields);
  if (!issues.length) {
    return;
  }
  const msg = issues.map(i => `${i.legId}:${i.kind}`).join('; ');
  throw new Error(`${context}: overlay/physics field drift — ${msg}`);
}
