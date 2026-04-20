#!/usr/bin/env node
/**
 * CGUS CLI (internal)
 *
 * Goals:
 * - One command to run CGUS replay/regression.
 * - Stable, script-friendly flags.
 *
 * Examples:
 *   npm run cgus:replay
 *   npx ts-node --transpile-only scripts/cgus-cli.ts replay --mode lite --n 50 --out artifacts/cgus.json
 *   npx ts-node --transpile-only scripts/cgus-cli.ts smoke --mode app --n 8
 */
import { spawnSync } from 'child_process';

type Command = 'replay' | 'smoke' | 'help';

function getArg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function printHelp(): void {
  // Keep it short; this is an internal tool.
  // eslint-disable-next-line no-console
  console.log(`
cgus-cli

Usage:
  cgus-cli replay [--mode lite|app] [--n <num>] [--out <path>] [--samples <num>] [--maxCandidates <num>]
                 [--gateAltP50Min <num>] [--gateUniqueDivP50Min <num>] [--gateCgusRateMin <num>] [--gateEmptyRateMax <num>]

  cgus-cli smoke  [--mode lite|app] [--out <path>]

Defaults:
  mode=lite, n=30, out=artifacts/cgus-report.json
`);
}

function main(): void {
  const cmd = (process.argv[2] as Command | undefined) ?? 'help';
  if (cmd === 'help' || hasFlag('--help') || hasFlag('-h')) {
    printHelp();
    return;
  }

  const mode = (getArg('--mode') ?? process.env.CGUS_SUITE_MODE ?? 'lite').toLowerCase();
  const n =
    cmd === 'smoke'
      ? parseInt(getArg('--n') ?? '8', 10)
      : parseInt(getArg('--n') ?? process.env.CGUS_SUITE_N ?? '30', 10);
  const out = getArg('--out') ?? process.env.CGUS_SUITE_OUT ?? 'artifacts/cgus-report.json';
  const samples = getArg('--samples') ?? process.env.MONTE_CARLO_SAMPLES;
  const maxCandidates = getArg('--maxCandidates') ?? process.env.CGUS_MAX_CANDIDATES;

  const gateAltP50Min = getArg('--gateAltP50Min') ?? process.env.CGUS_GATE_ALT_P50_MIN;
  const gateUniqueDivP50Min = getArg('--gateUniqueDivP50Min') ?? process.env.CGUS_GATE_UNIQUE_DIV_P50_MIN;
  const gateCgusRateMin = getArg('--gateCgusRateMin') ?? process.env.CGUS_GATE_CGUS_RATE_MIN;
  const gateEmptyRateMax = getArg('--gateEmptyRateMax') ?? process.env.CGUS_GATE_EMPTY_RATE_MAX;

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CGUS_SUITE_MODE: mode,
    CGUS_SUITE_N: String(n),
    CGUS_SUITE_OUT: out,
  };
  if (samples) env.MONTE_CARLO_SAMPLES = String(samples);
  if (maxCandidates) env.CGUS_MAX_CANDIDATES = String(maxCandidates);
  if (gateAltP50Min) env.CGUS_GATE_ALT_P50_MIN = String(gateAltP50Min);
  if (gateUniqueDivP50Min) env.CGUS_GATE_UNIQUE_DIV_P50_MIN = String(gateUniqueDivP50Min);
  if (gateCgusRateMin) env.CGUS_GATE_CGUS_RATE_MIN = String(gateCgusRateMin);
  if (gateEmptyRateMax) env.CGUS_GATE_EMPTY_RATE_MAX = String(gateEmptyRateMax);

  const nodeArgs = [
    'ts-node',
    '--transpile-only',
    'scripts/replay-cgus-suite.ts',
  ];

  const res = spawnSync('npx', ['-s', ...nodeArgs], {
    env,
    stdio: 'inherit',
  });

  process.exitCode = res.status ?? 1;
}

main();

