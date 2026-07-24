/**
 * M4 authority readiness — full Release Gate checklist (does NOT promote).
 *
 *   npm run lab:authority-readiness
 *   npm run lab:authority-readiness -- --json
 */

import { evaluateOrtToolsAuthorityCanaryGate } from '../ortools-authority-canary.gate';

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : `${s}${' '.repeat(n - s.length)}`;
}

async function main(): Promise<number> {
  const report = evaluateOrtToolsAuthorityCanaryGate();
  const jsonOnly = process.argv.includes('--json');

  const finalStatus = report.authoritativePromotion
    ? 'AUTHORIZED_CANARY'
    : report.engineeringReady
      ? 'BLOCKED (release governance)'
      : 'BLOCKED (engineering)';

  const payload = {
    schemaId: report.schemaId,
    framing: 'M4 = Release Authorization Gate (not Engineering Gate)',
    engineeringReady: report.engineeringReady,
    releaseAuthorized: report.releaseAuthorized,
    mode: report.mode,
    authoritativePromotion: report.authoritativePromotion,
    final: finalStatus,
    signoffBundleDate: report.signoffBundleDate,
    blockedReasons: report.blockedReasons,
    checks: report.checks.map((c) => ({
      id: c.id,
      label: c.label,
      layer: c.layer,
      status: c.status,
      pass: c.pass,
      actual: c.actual,
      source: c.source,
      detail: c.detail,
    })),
    canaryRolloutHint: report.canaryRolloutHint,
    rollbackHint: report.rollbackHint,
        nextSteps: report.authoritativePromotion
          ? [
              'M4-RA-01 green — observe selected_trips; do NOT jump to 5% yet',
              'Watch GET .../ortools-shadow/canary/dashboard hard zeros',
              'Keep rollback to neptune-repair',
            ]
          : [
              ...(!report.engineeringReady
                ? [
                    'npm run lab:seal-planning-signoff',
                    'Confirm engineering checks PASS',
                  ]
                : []),
              ...report.blockedReasons
                .filter((id) =>
                  [
                    'product_signoff',
                    'signoff_token',
                    'canary_flag',
                  ].includes(id),
                )
                .map((id) => {
                  if (id === 'product_signoff') {
                    return 'npm run lab:prepare-product-approval → product APPROVES authority.json scope';
                  }
                  if (id === 'signoff_token') {
                    return 'OR_TOOLS_AUTHORITY_TOKEN_SECRET=... npm run lab:mint-authority-token';
                  }
                  return 'OR_TOOLS_CANARY_STAGE=selected_trips OR_TOOLS_AUTHORITATIVE_CANARY=1 (after rollback drill)';
                }),
              'npm run lab:rollback-drill -- --checklist',
              'Fill selected-trips.whitelist.json (10–20 IS trips)',
            ],
  };

  if (jsonOnly) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log('Authority Readiness — M4 Release Gate');
    console.log('=====================================');
    console.log(`Framing:     ${payload.framing}`);
    console.log(`Engineering: ${report.engineeringReady ? 'READY' : 'NOT READY'}`);
    console.log(`Release:     ${report.releaseAuthorized ? 'AUTHORIZED' : 'BLOCKED'}`);
    console.log(`Mode:        ${report.mode}`);
    console.log(`Sign-off:    ${report.signoffBundleDate ?? '(none)'}`);
    console.log(`Final:       ${finalStatus}`);
    console.log('');
    console.log(
      `${pad('Check', 22)} ${pad('Layer', 12)} ${pad('Status', 8)} Detail`,
    );
    console.log('-'.repeat(72));
    for (const c of report.checks) {
      console.log(
        `${pad(c.label, 22)} ${pad(c.layer, 12)} ${pad(c.status, 8)} ${c.detail ?? ''}`,
      );
    }
    console.log('');
    console.log(`Canary:   ${report.canaryRolloutHint}`);
    console.log(`Rollback: ${report.rollbackHint}`);
    if (payload.nextSteps.length) {
      console.log('');
      console.log('Next:');
      for (const s of payload.nextSteps) console.log(`  - ${s}`);
    }
    console.log('');
    console.log('(machine JSON: npm run lab:authority-readiness -- --json)');
  }

  if (process.argv.includes('--strict') && !report.authoritativePromotion) {
    return 1;
  }
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
