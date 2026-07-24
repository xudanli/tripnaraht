/**
 * Aggregate dev full flip drill artifacts into a single pass/fail report.
 */

import * as fs from 'fs';
import * as path from 'path';

const OUT_DIR = path.join(process.cwd(), 'artifacts', 'p4-flip-full-drill');

function readJson<T>(p: string): T | null {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return null;
  }
}

function capsStage(capsFile: string): string {
  const raw = readJson<{ success?: boolean; data?: Record<string, unknown> }>(
    path.join(OUT_DIR, capsFile),
  );
  const data = raw?.data;
  if (!data) return 'unknown';
  const legacy = data.legacyConvergence as { currentStage?: string } | undefined;
  if (legacy?.currentStage) return legacy.currentStage;
  if (data.mode === 'CANONICAL' && data.constraintGatewayMode === 'ON') {
    return 'CANONICAL_DEFAULT (inferred)';
  }
  if (data.constraintGatewayOnForSelected) return 'CANONICAL_SELECTIVE (inferred)';
  return String(data.mode ?? 'unknown');
}

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [p4-flip-drill-report] ${line}`);
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const selectiveStaging = readJson<{ pass?: boolean }>(
    path.join(process.cwd(), 'artifacts/p4-selective-staging/report.json'),
  );
  const p4Closure = readJson<{ overall?: string }>(
    path.join(process.cwd(), 'artifacts/p4-phase-status/closure.json'),
  );
  const canonicalPreview = readJson<{ pass?: boolean }>(
    path.join(process.cwd(), 'artifacts/p4-canonical-default-preview/report.json'),
  );
  const canonicalClosure = readJson<{ overall?: string }>(
    path.join(process.cwd(), 'artifacts/p4-canonical-default-status/closure.json'),
  );
  const rollbackStaging = readJson<{ pass?: boolean; baseUrl?: string }>(
    path.join(process.cwd(), 'artifacts/p4-selective-staging/report.json'),
  );
  const fallbackDrill = readJson<{ pass?: boolean }>(
    path.join(process.cwd(), 'artifacts/p4-legacy-fallback-drill/report.json'),
  );
  const advisory = readJson<{ readyForProductionFlip?: boolean; devDrill?: boolean }>(
    path.join(process.cwd(), 'artifacts/p4-production-flip/advisory.json'),
  );

  const phases = [
    {
      id: 'phase1-selective',
      label: 'CANONICAL_SELECTIVE (:3000)',
      pass:
        selectiveStaging?.pass === true &&
        p4Closure?.overall === 'CANONICAL_SELECTIVE_READY',
      detail: `${p4Closure?.overall ?? 'missing'} · staging=${selectiveStaging?.pass}`,
      stage: capsStage('phase1-caps.json'),
    },
    {
      id: 'phase2-canonical-preview',
      label: 'CANONICAL_DEFAULT preview (:3001)',
      pass:
        canonicalPreview?.pass === true &&
        canonicalClosure?.overall === 'CANONICAL_DEFAULT_STAGING_READY',
      detail: `${canonicalClosure?.overall ?? 'missing'} · preview=${canonicalPreview?.pass}`,
      stage: capsStage('phase2-caps.json'),
    },
    {
      id: 'phase3-canary-flip',
      label: 'Canary flip (:3002)',
      pass: capsStage('phase3-caps.json').includes('CANONICAL'),
      detail: capsStage('phase3-caps.json'),
      stage: capsStage('phase3-caps.json'),
    },
    {
      id: 'phase4-tier-b-rollback',
      label: 'Tier B rollback (:3002)',
      pass: rollbackStaging?.pass === true && rollbackStaging?.baseUrl?.includes('3002'),
      detail: `staging=${rollbackStaging?.pass} @ ${rollbackStaging?.baseUrl ?? 'n/a'}`,
      stage: capsStage('phase4-caps.json'),
    },
    {
      id: 'phase5-legacy-fallback-drill',
      label: 'Legacy fallback offline drill',
      pass: fallbackDrill?.pass === true,
      detail: String(fallbackDrill?.pass),
      stage: 'n/a',
    },
    {
      id: 'phase5-dev-advisory',
      label: 'Production flip advisory (dev drill)',
      pass: advisory?.readyForProductionFlip === true && advisory?.devDrill === true,
      detail: `ready=${advisory?.readyForProductionFlip}`,
      stage: 'n/a',
    },
  ];

  const failed = phases.filter((p) => !p.pass);
  const pass = failed.length === 0;

  const report = {
    schemaId: 'tripnara.p4_flip_full_drill_report@v1',
    generatedAt: new Date().toISOString(),
    pass,
    phases,
    blockers: failed.map((f) => f.id),
    ports: {
      selective: 'http://localhost:3000/api',
      canonicalPreview: 'http://localhost:3001/api',
      canaryThenRollback: 'http://localhost:3002/api (tier-B after phase 4)',
    },
    documents: [
      'src/decision-runtime/p4-phase/CANONICAL_DEFAULT_PRODUCTION_FLIP.md',
      'src/decision-runtime/p4-phase/LEGACY_FALLBACK_RUNBOOK.md',
    ],
  };

  const outPath = path.join(OUT_DIR, 'report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  log(`written ${outPath}`);
  log(`pass=${pass} phases=${phases.filter((p) => p.pass).length}/${phases.length}`);

  if (!pass) {
    log(`blockers: ${failed.map((f) => f.id).join(', ')}`);
    process.exitCode = 1;
  }
}

main();
