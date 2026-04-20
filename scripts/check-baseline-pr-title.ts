#!/usr/bin/env npx ts-node
/**
 * CI / 本地：基线 JSON 变更时校验 PR 标题与 §3a 结构化字段。
 *
 * 环境变量：
 * - `PR_TITLE`（必填于 CI）：PR 标题
 * - `PR_BODY`：PR 正文（短标题时三行块可放在正文首段）
 * - `PR_BASE_SHA`（CI 建议）：`github.event.pull_request.base.sha`，用于 `git diff` 检测 `baselines/cgus/*.json` 是否变更
 *
 * 未设置 `PR_BASE_SHA` 时：仅当标题含 `[CGUS Baseline Update]` 时校验三字段（本地 smoke）。
 *
 * 退出码：0 通过；1 未满足规则。
 */
import { execSync } from 'node:child_process';
import { BASELINE_PR_TITLE_PREFIX, formatBaselinePrComplianceHint } from './lib/baseline-pr-compliance.examples';

const BASELINE_PREFIX = BASELINE_PR_TITLE_PREFIX;

function printComplianceHint(): void {
  process.stderr.write(formatBaselinePrComplianceHint());
}

function listBaselineJsonChanged(baseSha: string | undefined): string[] {
  if (!baseSha?.trim()) {
    return [];
  }
  try {
    const out = execSync(`git diff --name-only ${baseSha.trim()}...HEAD`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (!out) return [];
    return out.split('\n').filter((p) => p.startsWith('baselines/cgus/') && p.endsWith('.json'));
  } catch {
    return [];
  }
}

function haystack(title: string, body: string): string {
  return `${title}\n${body}`.replace(/\r\n/g, '\n');
}

function hasRequiredFields(text: string): { ok: boolean; missing: string[] } {
  const required = [
    { key: 'comparisonClass=', test: () => text.includes('comparisonClass=') },
    {
      key: 'cases=<n>/<m>…',
      test: () => /\bcases=\s*\d+\s*\/\s*\d+/.test(text),
    },
    { key: 'reason=', test: () => /\breason=/.test(text) },
  ];
  const missing = required.filter((r) => !r.test()).map((r) => r.key);
  return { ok: missing.length === 0, missing };
}

function main(): void {
  const title = process.env.PR_TITLE ?? '';
  const body = process.env.PR_BODY ?? '';
  const baseSha = process.env.PR_BASE_SHA;

  const jsonChanged = listBaselineJsonChanged(baseSha);
  const titled = title.includes(BASELINE_PREFIX);

  if (jsonChanged.length > 0 && !titled) {
    process.stderr.write(
      `[check-baseline-pr-title] Baseline JSON changed (${jsonChanged.join(', ')}), but PR title is missing "${BASELINE_PREFIX}".\n`,
    );
    printComplianceHint();
    process.exit(1);
  }

  if (!titled) {
    process.exit(0);
  }

  const text = haystack(title, body);
  const { ok, missing } = hasRequiredFields(text);
  if (!ok) {
    process.stderr.write(
      `[check-baseline-pr-title] Title/body must include (title compact OR body block): ${missing.join(
        ', ',
      )}\nSee baselines/cgus/BASELINE_UPDATE_POLICY.md §3a.\n`,
    );
    printComplianceHint();
    process.exit(1);
  }

  process.exit(0);
}

main();
