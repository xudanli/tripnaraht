/**
 * Fault-injection gate file — prevents vacuous pass when integration tests skip.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { getBenchmarkArtifactRoot } from './benchmark-artifact.util';
import { resolveGitCommit } from './benchmark-config.util';

export const FAULT_INJECTION_SUITE = 'benchmark-fault-injection';
export const FAULT_INJECTION_EXPECTED = 29;
export const E1_BENCHMARK_MIGRATION = '20260701170000_benchmark_batch_runner';
export const GATE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface FaultInjectionGateFile {
  suite: typeof FAULT_INJECTION_SUITE;
  expected: number;
  passed: number;
  failed: number;
  skipped: number;
  migrationVersion: string;
  gitCommit: string;
  databaseFingerprint: string;
  executedAt: string;
}

export function gateFilePath(): string {
  return path.join(getBenchmarkArtifactRoot(), '.fault-injection-gate.json');
}

export function computeDatabaseFingerprint(databaseUrl?: string): string {
  const raw = databaseUrl ?? process.env.DATABASE_URL ?? 'unknown';
  return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

export async function writeFaultInjectionGate(input: {
  passed: number;
  failed: number;
  skipped: number;
  migrationVersion?: string;
  gitCommit?: string;
  databaseFingerprint?: string;
}): Promise<FaultInjectionGateFile> {
  if (input.skipped > 0 || input.failed > 0 || input.passed < FAULT_INJECTION_EXPECTED) {
    throw new Error(
      `Refusing to write gate: passed=${input.passed} failed=${input.failed} skipped=${input.skipped} (expected ${FAULT_INJECTION_EXPECTED}/0/0)`,
    );
  }

  const gate: FaultInjectionGateFile = {
    suite: FAULT_INJECTION_SUITE,
    expected: FAULT_INJECTION_EXPECTED,
    passed: input.passed,
    failed: input.failed,
    skipped: input.skipped,
    migrationVersion: input.migrationVersion ?? E1_BENCHMARK_MIGRATION,
    gitCommit: input.gitCommit ?? resolveGitCommit(),
    databaseFingerprint: input.databaseFingerprint ?? computeDatabaseFingerprint(),
    executedAt: new Date().toISOString(),
  };

  const filePath = gateFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(gate, null, 2));
  return gate;
}

export interface GateValidationResult {
  valid: boolean;
  errors: string[];
  gate?: FaultInjectionGateFile;
}

export function validateFaultInjectionGate(input: {
  gate: FaultInjectionGateFile;
  currentGitCommit?: string;
  currentDatabaseFingerprint?: string;
  currentMigrationVersion?: string;
  maxAgeMs?: number;
}): GateValidationResult {
  const errors: string[] = [];
  const gate = input.gate;
  const now = Date.now();
  const executedAt = new Date(gate.executedAt).getTime();

  if (gate.suite !== FAULT_INJECTION_SUITE) {
    errors.push(`gate suite mismatch: ${gate.suite}`);
  }
  if (gate.expected !== FAULT_INJECTION_EXPECTED) {
    errors.push(`gate expected ${gate.expected} not ${FAULT_INJECTION_EXPECTED}`);
  }
  if (gate.passed !== FAULT_INJECTION_EXPECTED) {
    errors.push(`gate passed ${gate.passed} not ${FAULT_INJECTION_EXPECTED}`);
  }
  if (gate.failed !== 0) {
    errors.push(`gate failed ${gate.failed} not 0`);
  }
  if (gate.skipped !== 0) {
    errors.push(`gate skipped ${gate.skipped} not 0 — vacuous pass rejected`);
  }

  const gitCommit = input.currentGitCommit ?? resolveGitCommit();
  if (gate.gitCommit !== gitCommit) {
    errors.push(`gate gitCommit ${gate.gitCommit} != current ${gitCommit}`);
  }

  const dbFp = input.currentDatabaseFingerprint ?? computeDatabaseFingerprint();
  if (gate.databaseFingerprint !== dbFp) {
    errors.push('gate databaseFingerprint != current database');
  }

  const migration = input.currentMigrationVersion ?? E1_BENCHMARK_MIGRATION;
  if (gate.migrationVersion !== migration) {
    errors.push(`gate migrationVersion ${gate.migrationVersion} != ${migration}`);
  }

  const maxAge = input.maxAgeMs ?? GATE_MAX_AGE_MS;
  if (Number.isFinite(executedAt) && now - executedAt > maxAge) {
    errors.push(`gate expired (age ${Math.round((now - executedAt) / 3600000)}h > ${maxAge / 3600000}h)`);
  }

  return { valid: errors.length === 0, errors, gate };
}

export async function readFaultInjectionGate(): Promise<FaultInjectionGateFile | undefined> {
  try {
    const raw = await fs.readFile(gateFilePath(), 'utf8');
    return JSON.parse(raw) as FaultInjectionGateFile;
  } catch {
    return undefined;
  }
}
