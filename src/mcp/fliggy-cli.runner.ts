/**
 * 飞猪 FlyAI CLI 执行器（@fly-ai/flyai-cli）。
 * 文档: https://open.fly.ai/docs/quickstart
 * 输出：stdout 单行 JSON；stderr 为提示/错误。
 *
 * - 全局限流：同一进程内串行执行 CLI，避免多晚并发打爆配额
 * - 429：指数退避重试（默认最多 3 次）
 */

import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';

const execFileAsync = promisify(execFile);

export type FliggyCliRunResult = {
  ok: boolean;
  data: unknown;
  raw: string;
  stderr?: string;
  error?: string;
  latencyMs: number;
  rateLimited?: boolean;
  attempts?: number;
};

function resolveFlyaiBin(): string | null {
  try {
    const req = createRequire(__filename);
    const pkgPath = req.resolve('@fly-ai/flyai-cli/package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      bin?: { flyai?: string } | string;
    };
    const binRel =
      typeof pkg.bin === 'string'
        ? pkg.bin
        : typeof pkg.bin?.flyai === 'string'
          ? pkg.bin.flyai
          : null;
    if (!binRel) return null;
    return join(dirname(pkgPath), binRel);
  } catch {
    return null;
  }
}

export function isFliggyCliAvailable(): boolean {
  return Boolean(resolveFlyaiBin()) || Boolean(process.env.FLYAI_CLI_PATH?.trim());
}

export function isFliggyRateLimitError(message: string | null | undefined): boolean {
  const t = String(message ?? '');
  return (
    /Rate limit exceeded/i.test(t) ||
    /MCP HTTP 429/i.test(t) ||
    /\b429\b/.test(t) ||
    /too many requests/i.test(t)
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fliggyRetryMax(): number {
  const n = Number(process.env.FLYAI_RETRY_MAX ?? 3);
  return Number.isFinite(n) ? Math.min(Math.max(Math.floor(n), 1), 5) : 3;
}

function fliggyRetryBaseMs(): number {
  const n = Number(process.env.FLYAI_RETRY_BASE_MS ?? 1200);
  return Number.isFinite(n) ? Math.min(Math.max(Math.floor(n), 200), 10_000) : 1200;
}

/** 进程内串行队列：多晚酒店采样不再并发打飞猪 */
let fliggyQueue: Promise<unknown> = Promise.resolve();

function enqueueFliggy<T>(fn: () => Promise<T>): Promise<T> {
  const run = fliggyQueue.then(fn, fn);
  fliggyQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function runFliggyCliOnce(
  args: string[],
  opts?: { timeoutMs?: number; apiKey?: string | null },
): Promise<FliggyCliRunResult> {
  const started = Date.now();
  const bin = process.env.FLYAI_CLI_PATH?.trim() || resolveFlyaiBin();
  if (!bin) {
    return {
      ok: false,
      data: null,
      raw: '',
      error:
        '未安装 @fly-ai/flyai-cli。请执行: npm i @fly-ai/flyai-cli，并可选配置 FLYAI_API_KEY（见 https://open.fly.ai/docs/quickstart）',
      latencyMs: Date.now() - started,
    };
  }

  const env = { ...process.env };
  const key = opts?.apiKey?.trim();
  if (key) env.FLYAI_API_KEY = key;

  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [bin, ...args], {
      timeout: opts?.timeoutMs ?? 90_000,
      maxBuffer: 10 * 1024 * 1024,
      env,
    });
    const raw = String(stdout ?? '').trim();
    const errText = String(stderr ?? '').trim() || undefined;
    if (!raw) {
      const error = errText || 'flyai CLI 无输出';
      return {
        ok: false,
        data: null,
        raw: '',
        stderr: errText,
        error,
        rateLimited: isFliggyRateLimitError(error),
        latencyMs: Date.now() - started,
      };
    }
    // 部分实现把 429 JSON 写到 stdout 仍 exit 0
    if (isFliggyRateLimitError(raw) || isFliggyRateLimitError(errText)) {
      return {
        ok: false,
        data: null,
        raw,
        stderr: errText,
        error: errText || raw.slice(0, 400),
        rateLimited: true,
        latencyMs: Date.now() - started,
      };
    }
    try {
      return {
        ok: true,
        data: JSON.parse(raw),
        raw,
        stderr: errText,
        latencyMs: Date.now() - started,
      };
    } catch {
      return {
        ok: true,
        data: raw,
        raw,
        stderr: errText,
        latencyMs: Date.now() - started,
      };
    }
  } catch (e: unknown) {
    const err = e as { message?: string; stderr?: string; stdout?: string };
    const msg =
      String(err.stderr ?? '').trim() ||
      String(err.stdout ?? '').trim() ||
      String(err.message ?? e);
    return {
      ok: false,
      data: null,
      raw: String(err.stdout ?? '').trim(),
      stderr: String(err.stderr ?? '').trim() || undefined,
      error: msg.slice(0, 800),
      rateLimited: isFliggyRateLimitError(msg),
      latencyMs: Date.now() - started,
    };
  }
}

export async function runFliggyCli(
  args: string[],
  opts?: { timeoutMs?: number; apiKey?: string | null; retries?: number },
): Promise<FliggyCliRunResult> {
  const maxAttempts = opts?.retries ?? fliggyRetryMax();
  const baseMs = fliggyRetryBaseMs();

  return enqueueFliggy(async () => {
    let last: FliggyCliRunResult | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      last = await runFliggyCliOnce(args, opts);
      last.attempts = attempt;
      if (last.ok) return last;
      if (!last.rateLimited || attempt >= maxAttempts) return last;
      const delay = baseMs * Math.pow(2, attempt - 1);
      await sleep(delay);
    }
    return (
      last ?? {
        ok: false,
        data: null,
        raw: '',
        error: 'flyai CLI 未知失败',
        latencyMs: 0,
        attempts: maxAttempts,
      }
    );
  });
}

/** 将 flag map 转为 CLI 参数（跳过 null/undefined/空串） */
export function buildFliggyCliArgs(
  command: string,
  flags: Record<string, string | number | undefined | null>,
): string[] {
  const args = [command];
  for (const [flag, val] of Object.entries(flags)) {
    if (val == null) continue;
    const s = String(val).trim();
    if (!s) continue;
    args.push(flag, s);
  }
  return args;
}
