/**
 * ONT-P2-02C Observation Gate + ONT-P2-03A Selected User Auth submit
 */

import {
  freezeInternalAdvisoryObservationReport,
  evaluateP202CObservationGate,
  submit03ASelectedUserTemporalAdvisoryAuthorization,
  runP202CObservationGateAndSubmit03A,
  isOntologyP2UserAdvisoryKillSwitchEngaged,
  SELECTED_USER_OPT_IN_TRIP_IDS,
} from '../../../travel-ontology/p2-temporal';

describe('ONT-P2-02C Observation Gate → 03A Selected User Auth', () => {
  it('freezes 02B observation report', async () => {
    const frozen = await freezeInternalAdvisoryObservationReport({
      nowMs: Date.parse('2026-07-23T19:30:00.000Z'),
    });
    expect(frozen.status).toBe('FROZEN');
    expect(frozen.observationVerdict).toBe('PASS');
    expect(frozen.freezeFingerprint).toMatch(/^frz_02b_/);
    expect(frozen.faultInjectionAllOk).toBe(true);
  });

  it('02C PASSes on version consistency, control zeros, understanding, feedback/recon', async () => {
    const { frozen, gate, authorization03a } =
      await runP202CObservationGateAndSubmit03A({
        nowMs: Date.parse('2026-07-23T19:40:00.000Z'),
      });

    expect(gate.workItem).toBe('ONT-P2-02C');
    expect(gate.verdict).toBe('PASS');
    expect(gate.checks.every((c) => c.ok)).toBe(true);
    expect(gate.frozenObservation.freezeFingerprint).toBe(
      frozen.freezeFingerprint,
    );
    expect(gate.nextAllowed).toBe(
      'SUBMIT_ONT_P2_03A_SELECTED_USER_TEMPORAL_ADVISORY',
    );

    expect(authorization03a.workItem).toBe('ONT-P2-03A');
    expect(authorization03a.status).toBe('SUBMITTED');
    expect(authorization03a.scope.requiresExplicitOptIn).toBe(true);
    expect(authorization03a.scope.authorityMode).toBe('SHADOW');
    expect(authorization03a.scope.mode).toBe('ADVISORY_ONLY');
    expect(authorization03a.scope.destination).toBe('IS');
    expect(authorization03a.prohibitions.modifyPlanDirectly).toBe(true);
    expect(authorization03a.prohibitions.triggerBlockFromAdvisory).toBe(true);
    expect(authorization03a.prohibitions.callCanonicalApply).toBe(true);
    expect(authorization03a.killSwitchEnv).toBe(
      'ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH',
    );
    expect(authorization03a.scope.tripIds).toEqual([
      ...SELECTED_USER_OPT_IN_TRIP_IDS,
    ]);
  });

  it('blocks 03A submit when observation gate fails', async () => {
    const frozen = await freezeInternalAdvisoryObservationReport();
    const failGate = evaluateP202CObservationGate({
      frozen: {
        ...frozen,
        observationVerdict: 'FAIL',
        metrics: {
          ...frozen.metrics,
          canonical_apply_invocation: 1 as 0,
        },
      },
    });
    // Force fail via observationVerdict
    const gate = evaluateP202CObservationGate({
      frozen: { ...frozen, observationVerdict: 'FAIL' },
    });
    expect(gate.verdict).toBe('FAIL');
    const blocked = submit03ASelectedUserTemporalAdvisoryAuthorization({
      observationGate: gate,
    });
    expect(blocked.status).toBe('BLOCKED_PENDING_02C');
    void failGate;
  });

  it('user advisory kill switch is independent', () => {
    const prev = process.env.ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH;
    process.env.ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH = '1';
    expect(isOntologyP2UserAdvisoryKillSwitchEngaged()).toBe(true);
    if (prev === undefined) delete process.env.ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH;
    else process.env.ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH = prev;
  });
});
