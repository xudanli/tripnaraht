#!/usr/bin/env npx tsx
/**
 * ONT-P2-01 — Submit & Approve Weather Production Shadow Pilot
 * Runs Shadow Gate, writes SUBMITTED → APPROVED authorization + pilot/replay artifacts.
 * Does NOT enable user-facing temporal advice.
 */

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  approveWeatherShadowPilotAuthorization,
  evaluateP2WeatherShadowGate,
  runWeatherShadowProductionPilot,
  submitWeatherShadowPilotAuthorization,
} from '../src/travel-ontology/p2-temporal';

async function main() {
  delete process.env.ONTOLOGY_P2_WEATHER_SHADOW_KILL_SWITCH;
  const nowMs = Date.parse('2026-07-23T18:00:00.000Z');

  const gate = await evaluateP2WeatherShadowGate({ nowMs });
  if (gate.verdict !== 'PASS') {
    console.error(JSON.stringify({ ok: false, gate }, null, 2));
    process.exit(1);
  }

  const { report, replay } = await runWeatherShadowProductionPilot({ nowMs });

  const submitted = submitWeatherShadowPilotAuthorization(
    Date.parse('2026-07-23T18:05:00.000Z'),
  );
  const approved = approveWeatherShadowPilotAuthorization({
    submitted,
    approver: 'ontology-product-authority',
    nowMs: Date.parse('2026-07-23T18:10:00.000Z'),
  });

  const outDir = join(process.cwd(), 'artifacts/ontology-p2/weather-shadow-pilot');
  mkdirSync(outDir, { recursive: true });

  const write = (name: string, data: unknown) => {
    const stamped = join(
      outDir,
      `${name}-${new Date(nowMs).toISOString().replace(/[:.]/g, '-')}.json`,
    );
    const latest = join(outDir, `${name}.latest.json`);
    const body = JSON.stringify(data, null, 2);
    writeFileSync(stamped, body);
    writeFileSync(latest, body);
    return latest;
  };

  const authSubmittedPath = write(
    'authorization-submitted',
    submitted,
  );
  const authApprovedPath = write('authorization-approved', approved);
  // Canonical authorization pointer used by gate consumers
  const authCanonical = join(
    outDir,
    'weather-shadow-pilot-authorization.json',
  );
  writeFileSync(authCanonical, JSON.stringify(approved, null, 2));

  const gatePath = write('shadow-gate', gate);
  const pilotPath = write('production-pilot-report', report);
  const replayPath = write('production-replay', replay);

  console.log(
    JSON.stringify(
      {
        ok: true,
        workItem: 'ONT-P2-01',
        authorizationStatus: approved.status,
        shadowGate: gate.verdict,
        gate0: gate.gate0Verdict,
        replayFingerprint: report.replayFingerprint,
        controlBoundary: report.controlBoundaryTotals,
        nextAllowed: gate.nextAllowed,
        nextForbidden: gate.nextForbidden,
        artifacts: {
          authorization: authCanonical,
          submitted: authSubmittedPath,
          approved: authApprovedPath,
          shadowGate: gatePath,
          pilot: pilotPath,
          replay: replayPath,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
