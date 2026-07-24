import {
  AuthoritativeWriteHandlerRegistryService,
  setHandlerRegistryForTests,
} from './corridor-handler.registry';
import {
  AuthoritativeWriteShadowProbeService,
  clearShadowProbeAuditEntries,
  getShadowProbeAuditEntries,
  setAuthoritativeWriteShadowProbeForTests,
} from './authoritative-write-shadow-probe.service';
import {
  UWC_1B_WIRE_ORDER,
  UWC_AUTHORITATIVE_HARD_BLOCK_REASON,
  resolveCorridorWriteMode,
} from './corridor-write-mode.config';
import { reconcileShadowWithLegacy } from './shadow-reconcile.util';

describe('UWC-1b corridor handlers + shadow probe', () => {
  const registry = new AuthoritativeWriteHandlerRegistryService();
  const probe = new AuthoritativeWriteShadowProbeService(registry);

  beforeEach(() => {
    clearShadowProbeAuditEntries();
    setHandlerRegistryForTests(registry);
    setAuthoritativeWriteShadowProbeForTests(probe);
  });

  afterEach(() => {
    setAuthoritativeWriteShadowProbeForTests(null);
  });

  it('binds all three handlers in wire order', () => {
    expect(registry.listBound()).toEqual([...UWC_1B_WIRE_ORDER]);
    for (const corridor of UWC_1B_WIRE_ORDER) {
      const h = registry.get(corridor);
      expect(h.corridor).toBe(corridor);
      expect(h.delegatePath.length).toBeGreaterThan(0);
      expect(h.delegateSymbol.length).toBeGreaterThan(0);
    }
  });

  it('ACTIONS_COMMIT shadow: writesPerformed=false and audit entry recorded', () => {
    const entry = probe.probeActionsCommit(
      {
        trip_id: 'trip_a',
        request_id: 'req_a',
        idempotency_key: 'idem_a',
        context_signature: 'sig_a',
      },
      {
        legacyApplied: true,
        legacyOutcomeHint: 'APPLIED',
      },
    );
    expect(entry.report?.writesPerformed).toBe(false);
    expect(entry.report?.sideEffectsForbidden).toBe(true);
    expect(entry.report?.resolvedWriteTargets.length).toBeGreaterThan(0);
    expect(entry.diff).not.toBeNull();
    expect(getShadowProbeAuditEntries().length).toBeGreaterThanOrEqual(1);
  });

  it('ITINERARY_ADJUST + UNIFIED_EXECUTE shadow zero-write', () => {
    const ia = probe.probeItineraryAdjust(
      { tripId: 't1', requestId: 'r1', hasPendingDraft: true },
      { legacyApplied: true },
    );
    const ue = probe.probeUnifiedExecute(
      { tripId: 't1', decisionId: 'd1', idempotencyKey: 'k1' },
      { legacyApplied: true },
    );
    expect(ia.report?.writesPerformed).toBe(false);
    expect(ue.report?.writesPerformed).toBe(false);
  });

  it('DISABLED kill switch skips shadow work', () => {
    const entry = probe.probeActionsCommit(
      { trip_id: 't', request_id: 'r', context_signature: 's' },
      { legacyApplied: true },
    );
    // force DISABLED by resolving with env override via direct mode check
    const disabled = resolveCorridorWriteMode('ACTIONS_COMMIT', {
      UWC_CORRIDOR_MODE_ACTIONS_COMMIT: 'DISABLED',
    });
    expect(disabled.effective).toBe('DISABLED');

    // Probe uses process.env — temporarily set
    const prev = process.env.UWC_CORRIDOR_MODE_ACTIONS_COMMIT;
    process.env.UWC_CORRIDOR_MODE_ACTIONS_COMMIT = 'DISABLED';
    clearShadowProbeAuditEntries();
    const skipped = probe.probeActionsCommit(
      { trip_id: 't', request_id: 'r', context_signature: 's' },
      { legacyApplied: true },
    );
    expect(skipped.skipped).toBe('DISABLED');
    expect(skipped.report).toBeNull();
    if (prev === undefined) delete process.env.UWC_CORRIDOR_MODE_ACTIONS_COMMIT;
    else process.env.UWC_CORRIDOR_MODE_ACTIONS_COMMIT = prev;
  });

  it('AUTHORITATIVE request records hard-block skip (no write)', () => {
    const prev = process.env.UWC_CORRIDOR_MODE_UNIFIED_EXECUTE;
    process.env.UWC_CORRIDOR_MODE_UNIFIED_EXECUTE = 'AUTHORITATIVE';
    clearShadowProbeAuditEntries();
    const entry = probe.probeUnifiedExecute(
      { tripId: 't', decisionId: 'd' },
      { legacyApplied: true },
    );
    expect(entry.skipped).toBe(UWC_AUTHORITATIVE_HARD_BLOCK_REASON);
    expect(entry.report).toBeNull();
    if (prev === undefined) delete process.env.UWC_CORRIDOR_MODE_UNIFIED_EXECUTE;
    else process.env.UWC_CORRIDOR_MODE_UNIFIED_EXECUTE = prev;
  });

  it('reconcile diffs are auditable when prediction diverges', () => {
    const report = registry.get('ACTIONS_COMMIT').shadowValidate(
      registry.get('ACTIONS_COMMIT').buildCommand({
        trip_id: 't',
        request_id: 'r',
        context_signature: 'sig',
      }),
    );
    // Force a synthetic reject prediction mismatch
    const forced = { ...report, predictedOutcome: 'REJECTED' as const };
    const diff = reconcileShadowWithLegacy(forced, {
      legacyApplied: true,
      legacyOutcomeHint: 'APPLIED',
    });
    expect(diff.match).toBe(false);
    expect(diff.divergences).toContain('PREDICTED_REJECT_LEGACY_APPLIED');
  });

  it('safeProbe never throws', () => {
    expect(() =>
      probe.safeProbe('ACTIONS_COMMIT', { trip_id: 't', request_id: 'r' }),
    ).not.toThrow();
  });
});
