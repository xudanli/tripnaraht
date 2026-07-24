import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

export interface RunFingerprint {
  caseId?: string | null;
  fixtureVersion?: string | null;
  fixtureVersionsDistinct?: string[] | null;
  corpus?: string | null;
  caseCount: number;
  generatedAt: string;
  runId?: string | null;
  configHash: string;
  mappingVersion: string | null;
  seed: string | null;
  gitSha: string | null;
  schemaVersions: Record<string, string>;
}

export interface BuildRunFingerprintInput {
  caseId?: string | null;
  fixtureVersion?: string | null;
  fixtureVersionsDistinct?: string[] | null;
  corpus?: string | null;
  caseCount: number;
  configForHash: unknown;
  mappingVersion?: string | null;
  seed?: string | number | null;
  gitSha?: string | null;
  runId?: string | null;
  schemaVersions?: Record<string, string>;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortRecursively(value));
}

function sortRecursively(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortRecursively);
  }
  if (value && typeof value === 'object') {
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(input).sort()) {
      const v = input[key];
      if (v !== undefined) {
        output[key] = sortRecursively(v);
      }
    }
    return output;
  }
  return value;
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function buildConfigHash(configForHash: unknown): string {
  return sha256Hex(stableStringify(configForHash));
}

export function resolveGitSha(): string | null {
  const envSha =
    process.env.GITHUB_SHA ||
    process.env.GIT_COMMIT ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    null;
  if (envSha?.trim()) return envSha.trim();
  try {
    const sha = execSync('git rev-parse HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();
    return sha || null;
  } catch {
    return null;
  }
}

function mappingBaseLabel(): string {
  const explicit =
    process.env.DECISION_PARAMS_MAPPING_VERSION?.trim() ||
    process.env.DECISION_PARAMS_PROFILE?.trim() ||
    '';
  if (explicit) return explicit;
  const legacyEnv =
    process.env.DECISION_PARAMS_MAPPING_LEGACY ?? process.env.DECISION_PARAMS_LEGACY_MODE ?? '';
  const legacyOn = legacyEnv === '1' || String(legacyEnv).toLowerCase() === 'true';
  return legacyOn ? 'legacy' : 'v2';
}

export function resolveMappingVersionFromEnv(): string | null {
  const base = mappingBaseLabel();
  const shadowRaw = process.env.DECISION_PARAMS_SHADOW_MODE ?? '';
  const shadowOn = shadowRaw === '1' || String(shadowRaw).toLowerCase() === 'true';
  if (shadowOn) return `${base}|shadow=1`;
  return base;
}

export type CgusReplayReportKind = 'cgus-suite' | 'td-replay-fixtures';

export interface FingerprintCompleteness {
  ok: boolean;
  warnings: string[];
  errors: string[];
  mode: CgusReplayReportKind;
}

export function validateRunFingerprintCompleteness(opts: {
  reportKind: CgusReplayReportKind;
  caseCount: number;
  fp: RunFingerprint | null | undefined;
}): FingerprintCompleteness {
  const warnings: string[] = [];
  const errors: string[] = [];
  const mode = opts.reportKind;
  const fp = opts.fp;

  if (!fp) {
    if (opts.caseCount > 0) {
      errors.push('runFingerprint missing while caseCount > 0');
    }
    return { mode, ok: errors.length === 0, warnings, errors };
  }

  if (opts.caseCount > 0 && (!fp.configHash || fp.configHash.length < 32)) {
    errors.push('configHash missing or too short while caseCount > 0');
  }

  if (opts.reportKind === 'td-replay-fixtures' && opts.caseCount > 0) {
    const d = fp.fixtureVersionsDistinct;
    if (!Array.isArray(d) || d.length === 0) {
      errors.push(
        'td-replay-fixtures: fixtureVersionsDistinct must be non-empty',
      );
    }
  }

  if (opts.caseCount > 0 && (!fp.runId || !String(fp.runId).trim())) {
    warnings.push('runFingerprint.runId missing — trace correlation unavailable');
  }

  return { mode, ok: errors.length === 0, warnings, errors };
}

export function buildRunFingerprint(input: BuildRunFingerprintInput): RunFingerprint {
  return {
    caseId: input.caseId ?? null,
    fixtureVersion: input.fixtureVersion ?? null,
    fixtureVersionsDistinct: input.fixtureVersionsDistinct ?? null,
    corpus: input.corpus ?? null,
    caseCount: input.caseCount,
    generatedAt: new Date().toISOString(),
    runId:
      input.runId === undefined || input.runId === null || input.runId === ''
        ? null
        : String(input.runId),
    configHash: buildConfigHash(input.configForHash),
    mappingVersion: input.mappingVersion ?? resolveMappingVersionFromEnv() ?? null,
    seed: input.seed === undefined || input.seed === null ? null : String(input.seed),
    gitSha: input.gitSha ?? resolveGitSha(),
    schemaVersions: {
      replayReport: 'v1',
      runFingerprint: 'v1',
      ...(input.schemaVersions ?? {}),
    },
  };
}
