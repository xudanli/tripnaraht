#!/usr/bin/env npx tsx
/**
 * ONT-P2-03A — Pre-Activation Live Readiness Gate
 * ALLOW_WAVE_1_ACTIVATION ≠ PILOT_PASS / PRODUCT_GATE_PASS
 */

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  evaluateSelectedUserLiveReadiness,
  buildFrozenConsentLedger,
  approveSelectedUserTemporalAdvisoryPilot,
} from '../src/travel-ontology/p2-temporal';

function main() {
  // Pre-activation requires Kill Switch ON
  if (!process.env.ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH) {
    process.env.ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH = '1';
  }

  const repoRoot = process.cwd();
  const report = evaluateSelectedUserLiveReadiness({
    repoRoot,
    nowMs: Date.now(),
    requireCleanWorktree: true,
  });

  const auth = approveSelectedUserTemporalAdvisoryPilot({
    submittedAt: '2026-07-23T19:40:00.000Z',
    nowMs: Date.parse('2026-07-23T22:00:00.000Z'),
    approvedBy: 'ontology-product-authority',
    frozenObservationFingerprint: 'frz_02b_a68b243d5d5e9052ea144d11',
  });

  const consentLedger = buildFrozenConsentLedger(
    Date.parse('2026-07-23T22:00:00.000Z'),
  );

  const outDir = join(
    repoRoot,
    'artifacts/ontology-p2/selected-user-advisory',
  );
  mkdirSync(outDir, { recursive: true });

  writeFileSync(
    join(outDir, 'selected-user-temporal-advisory-authorization.json'),
    JSON.stringify(auth, null, 2),
  );
  writeFileSync(
    join(outDir, 'selected-user-live-readiness.latest.json'),
    JSON.stringify(report, null, 2),
  );
  writeFileSync(
    join(outDir, 'selected-user-activation-provenance.latest.json'),
    JSON.stringify(report.provenance, null, 2),
  );
  writeFileSync(
    join(outDir, 'selected-user-consent-ledger.latest.json'),
    JSON.stringify(consentLedger, null, 2),
  );

  const failed = report.checks.filter((c) => !c.ok);
  console.log(
    JSON.stringify(
      {
        ok: report.verdict === 'ALLOW_WAVE_1_ACTIVATION',
        projectStatus: report.projectStatus,
        verdict: report.verdict,
        notClaimed: report.notClaimed,
        authorizationHash: report.authorization.authorizationHash,
        provenance: {
          gitCommitSha: report.provenance.gitCommitSha,
          gitBranch: report.provenance.gitBranch,
          buildArtifactHash: report.provenance.buildArtifactHash,
        },
        consent: report.consent,
        dryRunPass: report.dryRun.pass,
        killSwitchOn: report.runtime.userAdvisoryKillSwitch,
        observationStatus: report.runtime.observationStatus,
        wave1SuggestedScope: report.wave1SuggestedScope,
        failedChecks: failed,
        nextForbidden: report.nextForbidden,
        artifacts: {
          readiness: join(outDir, 'selected-user-live-readiness.latest.json'),
          provenance: join(
            outDir,
            'selected-user-activation-provenance.latest.json',
          ),
          consent: join(outDir, 'selected-user-consent-ledger.latest.json'),
          authorization: join(
            outDir,
            'selected-user-temporal-advisory-authorization.json',
          ),
        },
      },
      null,
      2,
    ),
  );

  if (report.verdict !== 'ALLOW_WAVE_1_ACTIVATION') process.exit(1);
}

main();
