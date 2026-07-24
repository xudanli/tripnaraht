/**
 * ONT-P2-03A — Live Readiness Gate (ALLOW_WAVE_1_ACTIVATION only)
 */

import {
  evaluateSelectedUserLiveReadiness,
  buildFrozenConsentLedger,
  SELECTED_USER_APPROVED_TRIP_IDS,
  SELECTED_USER_APPROVED_USER_IDS,
} from '../../../travel-ontology/p2-temporal';

describe('ONT-P2-03A Selected User Live Readiness', () => {
  const prev = { ...process.env };

  afterEach(() => {
    if (prev.ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH === undefined) {
      delete process.env.ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH;
    } else {
      process.env.ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH =
        prev.ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH;
    }
  });

  it('never claims PILOT_PASSED or PRODUCT_GATE_PASSED', () => {
    process.env.ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH = '1';
    const report = evaluateSelectedUserLiveReadiness({
      requireCleanWorktree: false,
      nowMs: Date.parse('2026-07-23T22:15:00.000Z'),
    });
    expect(report.notClaimed).toEqual([
      'PILOT_PASSED',
      'PRODUCT_GATE_PASSED',
    ]);
    expect(report.runtime.observationStatus).toBe('IN_PROGRESS');
    expect(report.verdict).not.toBe('PILOT_PASS' as never);
  });

  it('freezes consent ledger 12/12 and 7 trips with AND mode', () => {
    const ledger = buildFrozenConsentLedger(
      Date.parse('2026-07-23T22:00:00.000Z'),
    );
    expect(ledger.records).toHaveLength(12);
    expect(ledger.revokedConsent).toBe(0);
    expect(SELECTED_USER_APPROVED_TRIP_IDS).toHaveLength(7);
    expect(SELECTED_USER_APPROVED_USER_IDS).toHaveLength(12);
  });

  it('blocks when Kill Switch is OFF before Wave 1', () => {
    process.env.ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH = '0';
    const report = evaluateSelectedUserLiveReadiness({
      requireCleanWorktree: false,
    });
    expect(
      report.checks.find((c) => c.id === 'USER_ADVISORY_KILL_SWITCH_ON')?.ok,
    ).toBe(false);
    expect(report.verdict).not.toBe('ALLOW_WAVE_1_ACTIVATION');
  });

  it('suggests Wave 1 subset without expanding authorization totals', () => {
    process.env.ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH = '1';
    const report = evaluateSelectedUserLiveReadiness({
      requireCleanWorktree: false,
    });
    expect(report.wave1SuggestedScope.tripIds).toHaveLength(2);
    expect(report.wave1SuggestedScope.userIds.length).toBeGreaterThanOrEqual(3);
    expect(report.consent.selectedTripCount).toBe(7);
    expect(report.consent.selectedUserCount).toBe(12);
  });
});
