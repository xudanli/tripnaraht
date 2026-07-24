/**
 * CANONICAL_DEFAULT production flip advisory — pre-flight checklist artifact.
 *
 * Usage:
 *   npm run p4-production-flip:advisory
 *   CANONICAL_DEFAULT_MIN_OBSERVATION_DAYS=30 npm run p4-production-flip:advisory
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { resolveDecisionRuntimeCapabilities } from '../../src/decision-runtime/execution/decision-runtime-capabilities.util';
import {
  buildCanonicalDefaultPreviewCapabilities,
  evaluateCanonicalDefaultPromotion,
} from '../../src/decision-runtime/p4-phase/canonical-default-promotion.evaluator';
import { evaluateLegacyFallbackDrill } from '../../src/decision-runtime/p4-phase/legacy-fallback-drill.evaluator';
import { snapshotCanonicalDefaultPromotionCatalog } from '../../src/decision-runtime/p4-phase/canonical-default-promotion.catalog';
import { snapshotConstraintOnRolloutCatalog } from '../../src/decision-runtime/p2-phase/constraint-on-rollout.catalog';

const OUT_DIR = path.join(process.cwd(), 'artifacts', 'p4-production-flip');

function readJson<T>(p: string): T | null {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return null;
  }
}

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [p4-flip-advisory] ${line}`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const devDrill = process.env.P4_FLIP_DEV_DRILL === '1';
  const savedObs = process.env.CANONICAL_DEFAULT_MIN_OBSERVATION_DAYS;
  if (devDrill) {
    process.env.CANONICAL_DEFAULT_MIN_OBSERVATION_DAYS = '0';
  }

  const selectiveClosure = readJson<{ overall?: string }>(
    path.join(process.cwd(), 'artifacts/p4-phase-status/closure.json'),
  );
  const stagingClosure = readJson<{ overall?: string; observationBypass?: boolean }>(
    path.join(process.cwd(), 'artifacts/p4-canonical-default-status/closure.json'),
  );
  const fallbackDrill = readJson<{ drill?: { drillPass?: boolean } }>(
    path.join(process.cwd(), 'artifacts/p4-legacy-fallback-drill/report.json'),
  );

  const caps = resolveDecisionRuntimeCapabilities();
  const previewCaps = buildCanonicalDefaultPreviewCapabilities(caps);
  const productionEval = evaluateCanonicalDefaultPromotion(previewCaps);
  const drill = evaluateLegacyFallbackDrill(caps);
  const rollout = snapshotConstraintOnRolloutCatalog();
  const catalog = snapshotCanonicalDefaultPromotionCatalog();

  const observationGate = productionEval.gates.find((g) => g.gateId === 'observation-window');
  const minDays = Number(process.env.CANONICAL_DEFAULT_MIN_OBSERVATION_DAYS ?? '30');

  const productionObservation = readJson<{
    overallDisposition?: string;
    blockers?: string[];
    readiness?: { observationReady?: boolean; hardRedlinesPassed?: boolean };
  }>(path.join(process.cwd(), 'artifacts/production-observation/report.json'));

  const productionObservationMetricsPass = (() => {
    if (!productionObservation) return false;
    if (productionObservation.overallDisposition === 'FAIL') return false;
    if (productionObservation.readiness?.observationReady) return true;
    const metricBlockers = (productionObservation.blockers ?? []).filter(
      (b) => !b.startsWith('observation-time'),
    );
    return (
      productionObservation.readiness?.hardRedlinesPassed === true &&
      metricBlockers.length === 0
    );
  })();

  const checklist = [
    {
      id: 'selective-closure',
      pass: selectiveClosure?.overall === 'CANONICAL_SELECTIVE_READY',
      detail: selectiveClosure?.overall ?? 'missing',
      owner: 'platform',
    },
    {
      id: 'staging-closure',
      pass: stagingClosure?.overall === 'CANONICAL_DEFAULT_STAGING_READY',
      detail: stagingClosure?.overall ?? 'run p4-canonical-default:closure',
      owner: 'platform',
    },
    {
      id: 'constraint-7-7',
      pass: rollout.onForSelectedCount === rollout.entryCount,
      detail: `${rollout.onForSelectedCount}/${rollout.entryCount}`,
      owner: 'platform',
    },
    {
      id: 'production-promotion-gates',
      pass: productionEval.ready,
      detail: productionEval.blockers.join(', ') || 'ready',
      owner: 'platform',
    },
    {
      id: 'observation-window',
      pass: observationGate?.pass === true,
      detail: observationGate?.detail ?? `${minDays}d required`,
      owner: 'sre',
    },
    {
      id: 'legacy-fallback-drill',
      pass: drill.drillPass || fallbackDrill?.drill?.drillPass === true,
      detail: drill.drillPass ? 'offline drill PASS' : 'run p4-legacy-fallback:drill',
      owner: 'sre',
    },
    {
      id: 'production-observation-gates',
      pass: devDrill || productionObservationMetricsPass,
      detail: devDrill
        ? 'dev-drill-waived'
        : !productionObservation
          ? 'run production-observation:collect'
          : productionObservationMetricsPass
            ? productionObservation?.readiness?.observationReady
              ? 'dual-gate observation PASS'
              : 'metrics/redlines clear — duration or volume pending'
            : `blocked: ${(productionObservation?.blockers ?? []).join(', ')}`,
      owner: 'sre',
    },
    {
      id: 'change-advisory-signed',
      pass: devDrill,
      detail: devDrill
        ? 'dev-drill-waived'
        : 'Manual: product + SRE sign-off on CANONICAL_DEFAULT_PRODUCTION_FLIP.md',
      owner: 'product',
    },
    {
      id: 'rollback-runbook-reviewed',
      pass: devDrill,
      detail: devDrill
        ? 'dev-drill-waived'
        : 'Manual: LEGACY_FALLBACK_RUNBOOK.md reviewed + on-call linked',
      owner: 'sre',
    },
  ];

  if (devDrill && savedObs === undefined) {
    delete process.env.CANONICAL_DEFAULT_MIN_OBSERVATION_DAYS;
  } else if (savedObs !== undefined) {
    process.env.CANONICAL_DEFAULT_MIN_OBSERVATION_DAYS = savedObs;
  }

  const automated = checklist.filter((c) => !c.id.startsWith('change-') && c.id !== 'rollback-runbook-reviewed');
  const automatedPass = automated.every((c) => c.pass);
  const blockers = checklist.filter((c) => !c.pass).map((c) => c.id);

  const advisory = {
    schemaId: 'tripnara.p4_production_flip_advisory@v1',
    generatedAt: new Date().toISOString(),
    devDrill,
    readyForProductionFlip: devDrill
      ? checklist.every((c) => c.pass)
      : automatedPass && blockers.length === 0,
    automatedGatesPass: automatedPass,
    checklist,
    blockers,
    recommendedProductionEnv: catalog.recommendedEnv,
    rollbackTiers: drill.tiers.map((t) => ({
      tier: t.tier,
      label: t.label,
      env: t.recommendedEnv,
    })),
    rolloutPlan: {
      phase1: 'Enable CANONICAL_DEFAULT on single canary region/pod (10% traffic)',
      phase2: 'Monitor constraint shadow rate + execute errors 48h',
      phase3: 'Expand to 50% if metrics within SLO',
      phase4: 'Full flip; keep Tier B rollback env in ConfigMap for 7d',
    },
    rollbackTriggers: [
      'constraint_shadow_diverged_total spike > 2x baseline 15m',
      'canonical execute failure rate > 1% 10m',
      'L1 user-reported plan corruption / effective plan mismatch',
      'on-call escalation: product requests immediate rollback',
    ],
    documents: [
      'src/decision-runtime/p4-phase/CANONICAL_DEFAULT_PRODUCTION_FLIP.md',
      'src/decision-runtime/p4-phase/LEGACY_FALLBACK_RUNBOOK.md',
      'src/decision-runtime/DECISION_RUNTIME_ENV.md',
    ],
  };

  const outPath = path.join(OUT_DIR, 'advisory.json');
  fs.writeFileSync(outPath, JSON.stringify(advisory, null, 2));

  const mdPath = path.join(OUT_DIR, 'advisory.md');
  const md = [
    '# CANONICAL_DEFAULT Production Flip Advisory',
    '',
    `- Generated: ${advisory.generatedAt}`,
    `- Automated gates: ${automatedPass ? 'PASS' : 'BLOCKED'}`,
    `- Ready for production flip: ${advisory.readyForProductionFlip}`,
    '',
    '## Checklist',
    '',
    '| Item | Pass | Detail | Owner |',
    '| --- | --- | --- | --- |',
    ...checklist.map(
      (c) => `| ${c.id} | ${c.pass ? '✅' : '⏳'} | ${c.detail} | ${c.owner} |`,
    ),
    '',
    '## Recommended production env',
    '',
    '```bash',
    ...Object.entries(catalog.recommendedEnv).map(([k, v]) => `export ${k}=${v}`),
    '```',
    '',
    '## Rollback tiers',
    '',
    ...drill.tiers.map(
      (t) => `### ${t.tier}\n\n\`\`\`bash\n${Object.entries(t.recommendedEnv).map(([k, v]) => `export ${k}=${v}`).join('\n')}\n\`\`\``,
    ),
  ].join('\n');
  fs.writeFileSync(mdPath, md);

  log(`written ${outPath}`);
  log(`written ${mdPath}`);
  log(`automated=${automatedPass} blockers=${blockers.length}`);
  log(`readyForProductionFlip=${advisory.readyForProductionFlip}`);

  if (!automatedPass && !devDrill) {
    process.exitCode = 1;
  }
  if (devDrill && !advisory.readyForProductionFlip) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
