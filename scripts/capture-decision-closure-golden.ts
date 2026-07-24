#!/usr/bin/env npx ts-node
/**
 * Capture frozen optimizationHints → decision-closure golden JSON.
 *
 *   npm run capture:decision-closure -- --case-id iceland-decision-closure-storm-f208-001
 *   npm run capture:decision-closure:storm
 *   npm run capture:decision-closure -- --case-id iceland-storm-icecave-failure-001 --export-dpo
 *   npm run capture:decision-closure -- --case-id iceland-storm-icecave-failure-001 --check
 *
 * Env: KERNEL_CGUS_RAG_EVIDENCE=true (set by npm scripts), MONTE_CARLO_SAMPLES optional.
 */
import fs from 'fs';
import path from 'path';
import { Test } from '@nestjs/testing';
import { OptimizationEngineAdapterService } from '../src/decision/kernel/optimization-engine-adapter.service';
import { CgusReplayModule } from '../src/trips/decision/evaluation/cgus-replay.module';
import {
  buildDsoFromE2ECase,
  buildStormStrategyRagChunks,
  enrichStormDsoForCapture,
  loadCountryRagSeedChunks,
  mergeRagMaterializationIntoHints,
  sanitizeHintsForGolden,
  type StormStrategyDoc,
} from '../src/trips/decision/evaluation/decision-closure-capture.util';
import {
  findTdReplayFixtureById,
  COUNTRY_DECISION_CLOSURE_FIXTURES,
  ICELAND_DECISION_CLOSURE_FIXTURES,
} from '../src/trips/decision/evaluation/e2e-cases/registry';
import { icelandStormIcecaveFailureCase } from '../src/trips/decision/evaluation/e2e-cases/iceland-storm-icecave-failure.example';
import { runDecisionClosureGate } from './lib/decision-closure-gate';
import type { E2ECase } from '../src/trips/decision/evaluation/e2e-case.types';
import {
  buildGoldenPathDpoRecordsWithCgus,
  defaultGoldenPathDpoOutPath,
  goldenPathDpoJsonlContent,
  GOLDEN_PATH_STORM_CASE_ID,
  runGoldenPathCgusSearch,
} from '../src/e2e/golden-path/golden-path-dpo-export.util';
import { validateGoldenPathExperienceRoutingAudit } from '../src/e2e/golden-path/golden-path-cgus.util';

function parseArgs(argv: string[]): {
  caseId: string;
  outPath?: string;
  dpoOutPath?: string;
  checkOnly: boolean;
  write: boolean;
  exportDpo: boolean;
} {
  let caseId = process.env.CAPTURE_CASE_ID?.trim() ?? '';
  let outPath: string | undefined;
  let dpoOutPath: string | undefined;
  let checkOnly = false;
  let write = true;
  let exportDpo = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--case-id' && argv[i + 1]) {
      caseId = argv[++i];
    } else if (a === '--out' && argv[i + 1]) {
      outPath = argv[++i];
    } else if (a === '--dpo-out' && argv[i + 1]) {
      dpoOutPath = argv[++i];
    } else if (a === '--check') {
      checkOnly = true;
    } else if (a === '--no-write') {
      write = false;
    } else if (a === '--export-dpo') {
      exportDpo = true;
    }
  }
  if (!caseId) {
    throw new Error('Missing --case-id (or CAPTURE_CASE_ID)');
  }
  return { caseId, outPath, dpoOutPath, checkOnly, write, exportDpo };
}

function isGoldenPathStormCase(caseId: string): boolean {
  return caseId === icelandStormIcecaveFailureCase.id || caseId === GOLDEN_PATH_STORM_CASE_ID;
}

async function exportGoldenPathDpoJsonl(dpoOutPath: string): Promise<number> {
  const cgus = await runGoldenPathCgusSearch();
  validateGoldenPathExperienceRoutingAudit(cgus);
  const records = buildGoldenPathDpoRecordsWithCgus(cgus);
  const content = goldenPathDpoJsonlContent(records);
  if (!content.trim()) {
    throw new Error('Golden Path DPO export produced zero records');
  }
  fs.mkdirSync(path.dirname(dpoOutPath), { recursive: true });
  fs.writeFileSync(dpoOutPath, content, 'utf8');
  return records.length;
}

function validateGoldenPathDpoFile(dpoOutPath: string): void {
  if (!fs.existsSync(dpoOutPath)) {
    throw new Error(`Missing Golden Path DPO file: ${dpoOutPath}`);
  }
  const lines = fs.readFileSync(dpoOutPath, 'utf8').trim().split('\n').filter(Boolean);
  if (lines.length < 1) {
    throw new Error(`Golden Path DPO file empty: ${dpoOutPath}`);
  }
  const row = JSON.parse(lines[0]!) as { pair_type?: string; chosen?: string; rejected?: string };
  if (row.pair_type !== 'experience_flow_routing' || !row.chosen || !row.rejected) {
    throw new Error(`Invalid Golden Path DPO record in ${dpoOutPath}`);
  }
}

function resolveCase(caseId: string): {
  testCase: E2ECase;
  stormDoc?: StormStrategyDoc;
  ragSeedCountry?: string;
} {
  if (caseId === icelandStormIcecaveFailureCase.id) {
    const stormPath = path.join(
      __dirname,
      '../src/trips/decision/evaluation/e2e-cases/iceland-storm-icecave-failure.json',
    );
    const stormDoc = JSON.parse(fs.readFileSync(stormPath, 'utf8')) as StormStrategyDoc;
    return { testCase: icelandStormIcecaveFailureCase, stormDoc };
  }
  const allClosure = [...ICELAND_DECISION_CLOSURE_FIXTURES, ...COUNTRY_DECISION_CLOSURE_FIXTURES];
  const closure = allClosure.find((c) => c.id === caseId);
  if (closure) {
    return { testCase: closure, ragSeedCountry: closure.input.countryCode };
  }
  const td = findTdReplayFixtureById(caseId);
  if (td) return { testCase: td };
  throw new Error(`Unknown case id: ${caseId}`);
}

function defaultOutPath(caseId: string): string {
  const base = path.join(__dirname, '../src/trips/decision/evaluation/e2e-cases');
  if (caseId.includes('storm-icecave')) {
    return path.join(base, 'iceland-storm-icecave-failure.decision-closure.golden.json');
  }
  const closure = [...ICELAND_DECISION_CLOSURE_FIXTURES, ...COUNTRY_DECISION_CLOSURE_FIXTURES].find(
    (c) => c.id === caseId,
  );
  if (closure?.metadata?.source) {
    return path.join(base, `${closure.metadata.source}.golden.json`);
  }
  const slug = caseId.replace(/-001$/, '');
  return path.join(base, `${slug}.golden.json`);
}

async function captureHints(
  testCase: E2ECase,
  stormDoc?: StormStrategyDoc,
  ragSeedCountry?: string,
) {
  const stubChunks = stormDoc
    ? buildStormStrategyRagChunks(stormDoc)
    : ragSeedCountry
      ? loadCountryRagSeedChunks(ragSeedCountry)
      : [];
  const moduleRef = await Test.createTestingModule({ imports: [CgusReplayModule] }).compile();
  try {
    const adapter = moduleRef.get(OptimizationEngineAdapterService);
    let dso = buildDsoFromE2ECase(testCase);
    if (stormDoc) {
      dso = enrichStormDsoForCapture(dso, stormDoc);
    }
    let hints = await adapter.getHintsAsync(dso);
    if (!hints) {
      throw new Error('getHintsAsync returned empty hints');
    }
    if (stubChunks.length > 0) {
      hints = mergeRagMaterializationIntoHints(hints, dso, stubChunks);
    }
    const chosen =
      hints?.decisionVerdict?.chosen_plan_id ?? hints?.recommendedAlternativeId;
    if (!chosen) {
      throw new Error('getHintsAsync returned no verdict / recommendation');
    }
    return hints;
  } finally {
    await moduleRef.close();
  }
}

async function main(): Promise<void> {
  process.env.KERNEL_CGUS_RAG_EVIDENCE = process.env.KERNEL_CGUS_RAG_EVIDENCE ?? 'true';
  process.env.DECISION_OS_RAG_EVIDENCE_ENABLED = process.env.DECISION_OS_RAG_EVIDENCE_ENABLED ?? 'true';
  /** Offline capture: allow stub RAG without bound DecisionContextV0 */
  process.env.RAG_REALITY_POLICY_ENFORCE =
    process.env.RAG_REALITY_POLICY_ENFORCE ?? '0';

  const { caseId, outPath: outArg, dpoOutPath: dpoOutArg, checkOnly, write, exportDpo } =
    parseArgs(process.argv.slice(2));
  const { testCase, stormDoc, ragSeedCountry } = resolveCase(caseId);
  const outPath = outArg ?? defaultOutPath(caseId);
  const shouldExportDpo = exportDpo || isGoldenPathStormCase(caseId);
  const dpoOutPath =
    dpoOutArg ??
    path.join(process.cwd(), defaultGoldenPathDpoOutPath(caseId));

  if (checkOnly) {
    const raw = JSON.parse(fs.readFileSync(outPath, 'utf8')) as Record<string, unknown>;
    const gate = runDecisionClosureGate([
      {
        ...testCase,
        metadata: { ...testCase.metadata, decisionClosureGolden: raw },
      },
    ]);
    if (gate.failed > 0) {
      console.error(gate.results);
      process.exit(1);
    }
    console.log(`[OK] check ${caseId} against ${outPath}`);
    if (shouldExportDpo) {
      validateGoldenPathDpoFile(dpoOutPath);
      console.log(`[OK] check Golden Path DPO ${dpoOutPath}`);
    }
    return;
  }

  const hints = await captureHints(testCase, stormDoc, ragSeedCountry);
  const doc = {
    fixtureVersion: 'decision-closure-golden/v1',
    caseId,
    description: `Captured ${new Date().toISOString()} via capture-decision-closure-golden.ts`,
    optimizationHints: sanitizeHintsForGolden(hints),
  };

  if (write) {
    fs.writeFileSync(outPath, JSON.stringify(doc, null, 2) + '\n', 'utf8');
    console.log(`Wrote ${outPath}`);
  } else {
    process.stdout.write(JSON.stringify(doc, null, 2) + '\n');
  }

  if (shouldExportDpo) {
    const count = await exportGoldenPathDpoJsonl(dpoOutPath);
    console.log(`Wrote ${dpoOutPath} (${count} DPO record(s), pair_type=experience_flow_routing)`);
  }
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
