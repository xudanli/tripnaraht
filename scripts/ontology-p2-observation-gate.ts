#!/usr/bin/env npx tsx
/**
 * ONT-P2-02B freeze → ONT-P2-02C Observation Gate → ONT-P2-03A submit (if PASS)
 */

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { runP202CObservationGateAndSubmit03A } from '../src/travel-ontology/p2-temporal';

async function main() {
  delete process.env.ONTOLOGY_P2_INTERNAL_ADVISORY_KILL_SWITCH;
  delete process.env.ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH;
  delete process.env.ONTOLOGY_P2_WEATHER_SHADOW_KILL_SWITCH;

  const { frozen, gate, authorization03a } =
    await runP202CObservationGateAndSubmit03A({
      nowMs: Date.parse('2026-07-23T19:40:00.000Z'),
    });

  const internalDir = join(
    process.cwd(),
    'artifacts/ontology-p2/internal-advisory',
  );
  mkdirSync(internalDir, { recursive: true });
  writeFileSync(
    join(internalDir, 'internal-advisory-observation.frozen.json'),
    JSON.stringify(frozen, null, 2),
  );
  writeFileSync(
    join(internalDir, 'observation-gate.latest.json'),
    JSON.stringify(gate, null, 2),
  );

  const userDir = join(process.cwd(), 'artifacts/ontology-p2/selected-user-advisory');
  mkdirSync(userDir, { recursive: true });
  const auth03aPath = join(
    userDir,
    'selected-user-temporal-advisory-authorization.json',
  );
  writeFileSync(auth03aPath, JSON.stringify(authorization03a, null, 2));

  console.log(
    JSON.stringify(
      {
        ok: gate.verdict === 'PASS' && authorization03a.status === 'SUBMITTED',
        frozen02b: {
          status: frozen.status,
          freezeFingerprint: frozen.freezeFingerprint,
          observationVerdict: frozen.observationVerdict,
        },
        gate02c: {
          verdict: gate.verdict,
          checks: gate.checks,
          nextAllowed: gate.nextAllowed,
        },
        auth03a: {
          status: authorization03a.status,
          workItem: authorization03a.workItem,
          audience: authorization03a.scope.audience,
          authorityMode: authorization03a.scope.authorityMode,
          mode: authorization03a.scope.mode,
          requiresExplicitOptIn: authorization03a.scope.requiresExplicitOptIn,
          killSwitchEnv: authorization03a.killSwitchEnv,
          prohibitions: {
            modifyPlanDirectly: authorization03a.prohibitions.modifyPlanDirectly,
            triggerBlockFromAdvisory:
              authorization03a.prohibitions.triggerBlockFromAdvisory,
            callCanonicalApply: authorization03a.prohibitions.callCanonicalApply,
          },
        },
        artifacts: {
          frozen: join(internalDir, 'internal-advisory-observation.frozen.json'),
          gate: join(internalDir, 'observation-gate.latest.json'),
          auth03a: auth03aPath,
        },
      },
      null,
      2,
    ),
  );

  if (gate.verdict !== 'PASS') process.exit(1);
  if (authorization03a.status !== 'SUBMITTED') process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
