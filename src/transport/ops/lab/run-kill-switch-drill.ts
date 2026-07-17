#!/usr/bin/env npx tsx
/**
 * ETA-L2-CANARY-01 — Kill Switch rollback drill (process-local; does not leave kill on).
 *
 *   npm run lab:eta-l2-kill-switch-drill
 *
 * Proves: AUTHORITATIVE → KILL → SHADOW, then restores prior env for the process exit.
 */

import {
  evaluateTravelEtaL2AuthorityGate,
  resolveTravelEtaAuthorityForTrip,
} from '../travel-eta-l2-authority.gate';

function snapshotEnv(keys: string[]): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const k of keys) out[k] = process.env[k];
  return out;
}

function restoreEnv(prev: Record<string, string | undefined>): void {
  for (const [k, v] of Object.entries(prev)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

function main(): number {
  const keys = [
    'TRAVEL_ETA_L2_CANARY_STAGE',
    'TRAVEL_ETA_L2_AUTHORITY_APPROVED',
    'TRAVEL_ETA_L2_SELECTED_TRIP_IDS',
    'TRAVEL_ETA_L2_KILL_SWITCH',
  ];
  const prev = snapshotEnv(keys);

  const tripId = process.env.TRAVEL_ETA_L2_SELECTED_TRIP_IDS?.split(',')[0]?.trim() || 'canary-trip-is-01';

  // Phase A: authoritative selected trip
  process.env.TRAVEL_ETA_L2_CANARY_STAGE = 'selected_trips';
  process.env.TRAVEL_ETA_L2_AUTHORITY_APPROVED = '1';
  process.env.TRAVEL_ETA_L2_SELECTED_TRIP_IDS = tripId;
  delete process.env.TRAVEL_ETA_L2_KILL_SWITCH;

  const beforeGate = evaluateTravelEtaL2AuthorityGate({ goldMatrixPresent: true });
  const beforeAuth = resolveTravelEtaAuthorityForTrip({ tripId, gate: beforeGate });

  // Phase B: kill switch
  process.env.TRAVEL_ETA_L2_KILL_SWITCH = '1';
  const killGate = evaluateTravelEtaL2AuthorityGate({ goldMatrixPresent: true });
  const killAuth = resolveTravelEtaAuthorityForTrip({ tripId, gate: killGate });

  // Phase C: clear kill — authority returns
  delete process.env.TRAVEL_ETA_L2_KILL_SWITCH;
  const afterGate = evaluateTravelEtaL2AuthorityGate({ goldMatrixPresent: true });
  const afterAuth = resolveTravelEtaAuthorityForTrip({ tripId, gate: afterGate });

  const pass =
    beforeAuth === 'AUTHORITATIVE' &&
    beforeGate.authoritativePromotion === true &&
    killAuth === 'SHADOW' &&
    killGate.killSwitch === true &&
    killGate.authoritativePromotion === false &&
    afterAuth === 'AUTHORITATIVE' &&
    afterGate.killSwitch === false;

  const report = {
    schemaId: 'tripnara.travel_eta_l2_kill_switch_drill@v1',
    ok: pass,
    tripId,
    steps: {
      before: { authority: beforeAuth, promotion: beforeGate.authoritativePromotion },
      kill: {
        authority: killAuth,
        killSwitch: killGate.killSwitch,
        promotion: killGate.authoritativePromotion,
        blockedReasons: killGate.blockedReasons,
      },
      afterClear: { authority: afterAuth, killSwitch: afterGate.killSwitch },
    },
    rollbackHint: beforeGate.rollbackHint,
    assert: 'schedulableDurationMin must fall back to baseDurationMin under SHADOW',
  };

  console.log(JSON.stringify(report, null, 2));
  restoreEnv(prev);
  return pass ? 0 : 1;
}

process.exit(main());
