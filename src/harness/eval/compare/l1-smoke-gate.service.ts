import { Injectable, Logger } from '@nestjs/common';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EvalFingerprintService } from '../fingerprint/eval-fingerprint.service';
import { EvalSuiteLoader } from '../suite/eval-suite.loader';
import type { EvalCaseRunResult, EvalSuiteDefinition, EvalSuiteRunResult } from '../suite/eval-case.types';

export const LITE_SMOKE_EVAL_ENV: Record<string, string> = {
  ORCHESTRATOR_CONTEXT_LINT_ENABLED: '1',
  ORCHESTRATOR_CONTEXT_LINT_STRICT: '1',
  HARNESS_TRACE_MODE: 'on-failure',
};

export interface SmokeAssertion {
  caseId: string;
  expectedFingerprint: string;
  allowedDiffPaths?: string[];
}

@Injectable()
export class L1SmokeGateService {
  private readonly logger = new Logger(L1SmokeGateService.name);

  constructor(
    private readonly suiteLoader: EvalSuiteLoader,
    private readonly fingerprint: EvalFingerprintService,
  ) {}

  applyEvalEnvironment(extra?: Record<string, string>): void {
    for (const [k, v] of Object.entries({ ...LITE_SMOKE_EVAL_ENV, ...(extra ?? {}) })) {
      process.env[k] = v;
    }
  }

  async runSuite(suiteId: string): Promise<EvalSuiteRunResult> {
    const suite = this.suiteLoader.loadSuite(suiteId);
    this.applyEvalEnvironment(suite.env);

    const errors: string[] = [];
    const warnings: string[] = [];
    const caseResults: EvalCaseRunResult[] = [];

    for (const c of suite.cases) {
      const result = await this.runCase(c, suite);
      caseResults.push(result);
      if (!result.passed) {
        errors.push(`[${c.caseId}] ${result.message ?? 'failed'}`);
      } else if (c.expectedFingerprint && c.expectedFingerprint !== result.fingerprint) {
        errors.push(
          `[${c.caseId}] fingerprint mismatch expected=${c.expectedFingerprint} actual=${result.fingerprint}`,
        );
      }
    }

    const pathFingerprint = this.fingerprint.computePathFingerprint({
      suiteId: suite.suiteId,
      version: suite.version,
      caseResults: caseResults.map((r) => ({
        caseId: r.caseId,
        passed: r.passed,
        fingerprint: r.fingerprint,
      })),
    });

    let baselineMatch: boolean | null = null;
    const baseline = suite.pathFingerprintBaseline?.trim();
    if (!baseline) {
      warnings.push(
        'pathFingerprintBaseline unset — all cases passed but suite baseline not pinned (set fixtures/harness/eval/suites pathFingerprintBaseline after HARNESS_EVAL_RECORD_BASELINE=1)',
      );
      if (process.env.HARNESS_EVAL_RECORD_BASELINE === '1') {
        this.writeBaseline(suite, pathFingerprint);
        warnings.push(`Recorded baseline ${pathFingerprint} → ${this.suiteLoader.resolveSuitePath(suiteId)}`);
      }
    } else {
      baselineMatch = pathFingerprint === baseline;
      if (!baselineMatch) {
        if (process.env.HARNESS_EVAL_RECORD_BASELINE === '1') {
          this.writeBaseline(suite, pathFingerprint);
          warnings.push(
            `Recorded updated baseline ${pathFingerprint} (was ${baseline}) → ${this.suiteLoader.resolveSuitePath(suiteId)}`,
          );
          baselineMatch = true;
        } else {
          errors.push(
            `suite pathFingerprint mismatch: expected=${baseline} actual=${pathFingerprint}`,
          );
        }
      }
    }

    const passed = errors.length === 0 && caseResults.every((r) => r.passed);

    if (!passed) {
      this.logger.error(`L1 smoke REJECT suite=${suiteId} errors=${errors.length}`);
    } else {
      this.logger.log(`L1 smoke PASS suite=${suiteId} pathFingerprint=${pathFingerprint}`);
    }

    return {
      suiteId: suite.suiteId,
      passed,
      pathFingerprint,
      baselineMatch,
      caseResults,
      lintStrictApplied: process.env.ORCHESTRATOR_CONTEXT_LINT_STRICT === '1',
      errors,
      warnings,
    };
  }

  private async runCase(
    c: EvalSuiteDefinition['cases'][number],
    suite: EvalSuiteDefinition,
  ): Promise<EvalCaseRunResult> {
    if (c.kind === 'fingerprint-only') {
      const fp = this.fingerprint.computePathFingerprint(
        c.payload ?? { caseId: c.caseId },
        c.allowedDiffPaths ?? [],
      );
      const ok = !c.expectedFingerprint || c.expectedFingerprint === fp;
      return {
        caseId: c.caseId,
        kind: c.kind,
        passed: ok,
        fingerprint: fp,
        message: ok ? undefined : 'fingerprint-only assertion failed',
      };
    }

    const pattern = c.jestPattern?.trim();
    if (!pattern) {
      return {
        caseId: c.caseId,
        kind: c.kind,
        passed: false,
        fingerprint: 'missing-pattern',
        message: 'jest case requires jestPattern',
      };
    }

    const jestOk = this.runJestPattern(pattern);
    const fp = this.fingerprint.computePathFingerprint({
      suiteId: suite.suiteId,
      caseId: c.caseId,
      jestPattern: pattern,
      passed: jestOk.ok,
    });

    return {
      caseId: c.caseId,
      kind: c.kind,
      passed: jestOk.ok,
      fingerprint: fp,
      message: jestOk.ok ? undefined : jestOk.message?.slice(0, 500),
    };
  }

  private runJestPattern(pattern: string): { ok: boolean; message?: string } {
    try {
      execSync(`npx jest "${pattern}" --no-cache --ci`, {
        encoding: 'utf8',
        stdio: 'pipe',
        env: process.env,
        cwd: process.cwd(),
      });
      return { ok: true };
    } catch (e: unknown) {
      const err = e as { stdout?: string; stderr?: string; message?: string };
      const message = [err.stdout, err.stderr, err.message].filter(Boolean).join('\n');
      return { ok: false, message };
    }
  }

  private writeBaseline(suite: EvalSuiteDefinition, pathFingerprint: string): void {
    const abs = this.suiteLoader.resolveSuitePath(suite.suiteId);
    const next = { ...suite, pathFingerprintBaseline: pathFingerprint };
    fs.writeFileSync(abs, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  }
}
