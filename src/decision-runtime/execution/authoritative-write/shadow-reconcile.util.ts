import type { AuthoritativeWriteOutcome } from './authoritative-write.types';
import type {
  LegacyWriteSnapshot,
  ShadowReconcileDiff,
  ShadowValidateReport,
} from './corridor-handler.types';

export function mapLegacyToOutcome(
  snapshot: LegacyWriteSnapshot,
): AuthoritativeWriteOutcome {
  if (snapshot.legacyOutcomeHint) return snapshot.legacyOutcomeHint;
  if (snapshot.legacyApplied) return 'APPLIED';
  const codes = snapshot.reasonCodes ?? [];
  if (codes.some((c) => /STALE|CONFLICT|VERSION/i.test(c))) return 'CONFLICT';
  if (codes.some((c) => /SIGNATURE|VERIFY|CONFIRM/i.test(c)))
    return 'VERIFICATION_REQUIRED';
  return 'REJECTED';
}

export function reconcileShadowWithLegacy(
  report: ShadowValidateReport,
  snapshot: LegacyWriteSnapshot,
): ShadowReconcileDiff {
  const legacyOutcome = mapLegacyToOutcome(snapshot);
  const divergences: string[] = [];

  if (report.writesPerformed !== false) {
    divergences.push('SHADOW_WROTE_UNEXPECTEDLY');
  }
  if (!report.sideEffectsForbidden) {
    divergences.push('SIDE_EFFECTS_NOT_MARKED_FORBIDDEN');
  }

  // Shadow predicts gate outcome; legacy may still apply when shadow would reject
  // (shadow is observational). Record mismatch without mutating legacy.
  if (
    report.predictedOutcome === 'APPLIED' &&
    legacyOutcome !== 'APPLIED' &&
    legacyOutcome !== 'IDEMPOTENT_REPLAY'
  ) {
    divergences.push(
      `PREDICTED_APPLIED_LEGACY_${legacyOutcome}`,
    );
  }
  if (
    report.predictedOutcome === 'REJECTED' &&
    (legacyOutcome === 'APPLIED' || legacyOutcome === 'IDEMPOTENT_REPLAY')
  ) {
    divergences.push('PREDICTED_REJECT_LEGACY_APPLIED');
  }

  return {
    schemaId: 'tripnara.uwc_shadow_reconcile_diff@v1',
    corridor: report.corridor,
    match: divergences.length === 0,
    predictedOutcome: report.predictedOutcome,
    legacyOutcome,
    divergences,
    writeTargets: report.resolvedWriteTargets,
    recordedAt: new Date().toISOString(),
  };
}
