#!/usr/bin/env npx tsx
/**
 * ONT-P2-02B — human approve Internal Temporal Advisory Pilot
 * status → APPROVED_INTERNAL_ADVISORY_ONLY + freeze observation report
 */

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  approveInternalTemporalAdvisoryPilot,
  runInternalAdvisoryObservationPilot,
} from '../src/travel-ontology/p2-temporal';

async function main() {
  delete process.env.ONTOLOGY_P2_INTERNAL_ADVISORY_KILL_SWITCH;
  delete process.env.ONTOLOGY_P2_WEATHER_SHADOW_KILL_SWITCH;

  const authorization = approveInternalTemporalAdvisoryPilot({
    submittedAt: '2026-07-23T18:30:00.000Z',
    nowMs: Date.parse('2026-07-23T19:00:00.000Z'),
    approver: 'ontology-product-authority',
  });

  const observation = await runInternalAdvisoryObservationPilot({
    nowMs: Date.parse('2026-07-23T08:00:00.000Z'),
  });

  const outDir = join(process.cwd(), 'artifacts/ontology-p2/internal-advisory');
  mkdirSync(outDir, { recursive: true });

  const authPath = join(
    outDir,
    'internal-temporal-advisory-authorization.json',
  );
  writeFileSync(authPath, JSON.stringify(authorization, null, 2));

  const obsPath = join(outDir, 'internal-advisory-observation.latest.json');
  writeFileSync(obsPath, JSON.stringify(observation, null, 2));

  const faultsPath = join(outDir, 'fault-injection.latest.json');
  writeFileSync(
    faultsPath,
    JSON.stringify(observation.faultInjections, null, 2),
  );

  console.log(
    JSON.stringify(
      {
        ok: observation.verdict === 'PASS',
        workItem: 'ONT-P2-02B',
        decision: authorization.decision,
        status: authorization.status,
        authorityMode: authorization.scope.authorityMode,
        audience: authorization.scope.audience,
        canonicalControl: authorization.canonicalControl,
        externalUserEmission: authorization.externalUserEmission,
        killSwitchEnv: authorization.killSwitchEnv,
        observationVerdict: observation.verdict,
        faultInjections: observation.faultInjections,
        metrics: {
          advisory_emitted_count: observation.metrics.advisory_emitted_count,
          advisory_reconciled_count:
            observation.metrics.advisory_reconciled_count,
          multiple_active_advisories_same_scope:
            observation.metrics.multiple_active_advisories_same_scope,
          canonical_apply_invocation:
            observation.metrics.canonical_apply_invocation,
          external_user_emission: observation.metrics.external_user_emission,
        },
        nextAllowed: observation.nextAllowed,
        nextForbidden: observation.nextForbidden,
        artifacts: {
          authorization: authPath,
          observation: obsPath,
          faults: faultsPath,
        },
      },
      null,
      2,
    ),
  );

  if (authorization.status !== 'APPROVED_INTERNAL_ADVISORY_ONLY') process.exit(1);
  if (observation.verdict !== 'PASS') process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
