/**
 * P5 engineering prep closure — lint + agentic + DEFAULT_ON promotion plan.
 *
 * Usage:
 *   npm run p5-phase:closure
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { resolveDecisionRuntimeCapabilities } from '../../src/decision-runtime/execution/decision-runtime-capabilities.util';
import { evaluateConstraintDefaultOnPromotion } from '../../src/decision-runtime/p5-phase/constraint-default-on-promotion.evaluator';
import { evaluateLegacyDeprecatedReadiness } from '../../src/decision-runtime/p5-phase/legacy-deprecated-readiness.evaluator';
import { buildCanonicalDefaultPreviewCapabilities } from '../../src/decision-runtime/p4-phase/canonical-default-promotion.evaluator';

const OUT_DIR = path.join(process.cwd(), 'artifacts', 'p5-phase-status');

function readJson<T>(p: string): T | null {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return null;
  }
}

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [p5-closure] ${line}`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const p4Final = readJson<{ engineeringComplete?: boolean }>(
    'artifacts/p4-phase-status/final-closure.json',
  );
  const archLint = readJson<{ pass?: boolean }>('artifacts/p5-architecture-lint/report.json');
  const agentic = readJson<{ pass?: boolean }>(
    'artifacts/p5-agentic-providers-staging/report.json',
  );
  const fallbackDrill = readJson<{ pass?: boolean }>(
    'artifacts/p4-legacy-fallback-drill/report.json',
  );
  const defaultOnStaging = readJson<{ pass?: boolean }>(
    'artifacts/p5-constraint-default-on-staging/report.json',
  );

  const caps = resolveDecisionRuntimeCapabilities();
  const defaultOnPromo = evaluateConstraintDefaultOnPromotion(
    buildCanonicalDefaultPreviewCapabilities(caps),
  );
  const deprecated = evaluateLegacyDeprecatedReadiness(caps);

  const items = [
    {
      id: 'p4-engineering-complete',
      pass: p4Final?.engineeringComplete === true,
      detail: String(p4Final?.engineeringComplete),
    },
    {
      id: 'architecture-lint',
      pass: archLint?.pass === true,
      detail: String(archLint?.pass),
    },
    {
      id: 'agentic-providers-staging',
      pass: agentic?.pass === true,
      detail: String(agentic?.pass),
    },
    {
      id: 'legacy-fallback-drill',
      pass: fallbackDrill?.pass === true,
      detail: String(fallbackDrill?.pass),
    },
    {
      id: 'constraint-default-on-promotion-plan',
      pass: defaultOnPromo.scenarios.every((s) => s.currentPhase === 'ON_FOR_SELECTED'),
      detail: `${defaultOnPromo.scenarios.filter((s) => s.readyForDefaultOn).length}/${defaultOnPromo.scenarios.length} ready (preview caps)`,
    },
    {
      id: 'constraint-default-on-staging',
      pass: defaultOnStaging?.pass === true,
      detail: defaultOnStaging?.pass ? 'ok' : 'run p5-constraint-default-on:staging @ :3001',
    },
    {
      id: 'legacy-deprecated-ready',
      pass: deprecated.ready,
      requiredForProduction: true,
      detail: deprecated.blockers.join(', ') || 'ready',
    },
  ];

  const engineeringItems = items.filter((i) => i.id !== 'legacy-deprecated-ready');
  const engineeringPass = engineeringItems.every((i) => i.pass);
  const overall = engineeringPass ? 'P5_ENGINEERING_PREP_COMPLETE' : 'IN_PROGRESS';

  const closure = {
    schemaId: 'tripnara.p5_phase_closure@v1',
    generatedAt: new Date().toISOString(),
    overall,
    engineeringPrepComplete: engineeringPass,
    legacyDeprecatedReady: deprecated.ready,
    items,
    blockers: items.filter((i) => !i.pass).map((i) => i.id),
    nextMilestone: 'Production CANONICAL_DEFAULT flip → promote catalog DEFAULT_ON → LEGACY_DEPRECATED',
  };

  const outPath = path.join(OUT_DIR, 'closure.json');
  fs.writeFileSync(outPath, JSON.stringify(closure, null, 2));
  log(`written ${outPath}`);
  log(`overall=${overall} engineering=${engineeringPass}`);

  if (!engineeringPass) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
