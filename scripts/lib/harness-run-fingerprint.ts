import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

export interface RunFingerprint {
  caseId?: string | null;
  fixtureVersion?: string | null;
  fixtureVersionsDistinct?: string[] | null;
  corpus?: string | null;
  caseCount: number;
  generatedAt: string;
  /** Evaluation Harness：单次 replay/compare 运行 id；与 `meta.run_id`、Kernel `HarnessTrace.meta.evaluationRunId` 对齐 */
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

  /**
   * 传入「真正影响 replay / optimizer 数值结果」的稳定配置子集（见 `cgus-replay-config-hash.ts` 顶部团队规则）。
   * 审计可读、但不改变 CGUS 行为的字段 **不得** 放入，否则 `configHash` 会随展示需求漂移失真。
   */
  configForHash: unknown;

  /**
   * 如：
   * - legacy
   * - v2
   * - legacy|shadow
   * - v2|DECISION_PARAMS_PROFILE=alpine
   */
  mappingVersion?: string | null;

  /**
   * 建议统一转成字符串；如果没有 seed，传 null。
   */
  seed?: string | number | null;

  /**
   * 可选覆盖。通常不传，自动取 env 或 git rev-parse。
   */
  gitSha?: string | null;

  /**
   * Evaluation Harness 运行 id（建议 `randomUUID()`）；写入报告 `runFingerprint.runId`。
   */
  runId?: string | null;

  /**
   * schema 版本号，便于以后演进 observability v2 / report v2。
   */
  schemaVersions?: Record<string, string>;
}

/**
 * 对对象做“稳定序列化”：
 * - key 排序
 * - 递归处理对象/数组
 * - 忽略 undefined
 */
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

/**
 * 对 `configForHash` 做稳定序列化后 SHA-256。
 * 输入须遵守 `scripts/lib/cgus-replay-config-hash.ts` 中的 **configHash 克制规则**（仅影响结果的字段）。
 */
export function buildConfigHash(configForHash: unknown): string {
  return sha256Hex(stableStringify(configForHash));
}

export function resolveGitSha(): string | null {
  const envSha =
    process.env.GITHUB_SHA ||
    process.env.GIT_COMMIT ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    null;

  if (envSha && envSha.trim()) {
    return envSha.trim();
  }

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

  if (explicit) {
    return explicit;
  }

  const legacyEnv =
    process.env.DECISION_PARAMS_MAPPING_LEGACY ?? process.env.DECISION_PARAMS_LEGACY_MODE ?? '';
  const legacyOn =
    legacyEnv === '1' || String(legacyEnv).toLowerCase() === 'true';

  return legacyOn ? 'legacy' : 'v2';
}

/**
 * 与 `DecisionParamsInjectorService` 使用的环境变量对齐，并兼容草案中的别名。
 */
export function resolveMappingVersionFromEnv(): string | null {
  const base = mappingBaseLabel();
  const shadowRaw = process.env.DECISION_PARAMS_SHADOW_MODE ?? '';
  const shadowOn = shadowRaw === '1' || String(shadowRaw).toLowerCase() === 'true';

  if (shadowOn) {
    return `${base}|shadow=1`;
  }

  return base;
}

export type CgusReplayReportKind = 'cgus-suite' | 'td-replay-fixtures';

/**
 * 固定 schema（四字段）：`report.fingerprintCompleteness` 与
 * `compare.fingerprintComparison.completeness.{baseline,current}` 必须与此一致，避免各脚本各自长 shape。
 * 版本信封放在 compare 的 `completeness.schemaVersion`（pair 层），不进入本对象。
 */
export interface FingerprintCompleteness {
  ok: boolean;
  warnings: string[];
  errors: string[];
  mode: CgusReplayReportKind;
}

/**
 * @deprecated 使用 {@link FingerprintCompleteness}。
 */
export type RunFingerprintCompletenessResult = FingerprintCompleteness;

function finalizeCompleteness(
  partial: Pick<FingerprintCompleteness, 'ok' | 'warnings' | 'errors'>,
  mode: CgusReplayReportKind,
): FingerprintCompleteness {
  return {
    mode,
    ok: partial.ok,
    warnings: partial.warnings,
    errors: partial.errors,
  };
}

/**
 * P2 指纹完整性：报告落盘前 / compare 前调用。
 * 写报告：`CGUS_FP_STRICT=1` 时 errors 应导致进程非零退出。
 * 对比：`CGUS_COMPARE_FP_STRICT=1` 时 errors 应导致 compare 非零退出。
 */
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
    return finalizeCompleteness({ ok: errors.length === 0, warnings, errors }, mode);
  }

  if (opts.caseCount > 0 && (!fp.configHash || fp.configHash.length < 32)) {
    errors.push('configHash missing or too short while caseCount > 0');
  }

  if (opts.reportKind === 'td-replay-fixtures' && opts.caseCount > 0) {
    const d = fp.fixtureVersionsDistinct;
    if (!Array.isArray(d) || d.length === 0) {
      errors.push(
        'td-replay-fixtures: fixtureVersionsDistinct must be non-empty (set metadata.cgusDsoFixtureVersion on fixtures or CGUS_TD_FIXTURE_VERSION for inline cases)',
      );
    }
  }

  if (opts.reportKind === 'cgus-suite' && opts.caseCount > 0) {
    const d = fp.fixtureVersionsDistinct;
    if (!d || d.length === 0) {
      warnings.push(
        'cgus-suite: no fixtureVersionsDistinct (synthetic lab suite — OK; identicalFingerprintBundle is weaker vs td-replay-fixtures)',
      );
    }
  }

  if (opts.caseCount > 0 && (!fp.runId || !String(fp.runId).trim())) {
    warnings.push(
      'runFingerprint.runId missing — Evaluation Harness ↔ Kernel trace correlation unavailable for this report',
    );
  }

  return finalizeCompleteness({ ok: errors.length === 0, warnings, errors }, mode);
}

export function buildRunFingerprint(input: BuildRunFingerprintInput): RunFingerprint {
  const generatedAt = new Date().toISOString();

  return {
    caseId: input.caseId ?? null,
    fixtureVersion: input.fixtureVersion ?? null,
    fixtureVersionsDistinct: input.fixtureVersionsDistinct ?? null,
    corpus: input.corpus ?? null,
    caseCount: input.caseCount,
    generatedAt,
    runId: input.runId === undefined || input.runId === null || input.runId === '' ? null : String(input.runId),
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
