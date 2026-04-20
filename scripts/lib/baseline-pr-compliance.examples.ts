/**
 * CGUS baseline bump PR：标题 / 正文示例的**唯一事实来源**。
 *
 * - `check-baseline-pr-title.ts` CI stderr 必须由此拼接，禁止手写重复文案。
 * - `BASELINE_UPDATE_POLICY.md` / `baselines/cgus/README.md` 仅作规则说明并 **链接本文件**，勿再复制具体字符串（避免三处漂移）。
 * - Bump 示例格式时同步递增 {@link BASELINE_PR_EXAMPLE_SCHEMA_VERSION}；CI stderr 会打印 `Example schema: …`。
 */

/** PR 标题/正文示例块格式版本（与 CI `Example schema:` 行一致）。 */
export const BASELINE_PR_EXAMPLE_SCHEMA_VERSION = 'v1';

export const BASELINE_PR_TITLE_PREFIX = '[CGUS Baseline Update]' as const;

/** 单行紧凑示例（PR 列表 + 本地 / CI 报错提示）。 */
export const BASELINE_PR_TITLE_EXAMPLE_COMPACT =
  `${BASELINE_PR_TITLE_PREFIX} comparisonClass=PURE_CODE_REGRESSION cases=12/25 reason=fix-commute-matrix-bug`;

/** 短标题示例（三字段放在正文首块时使用）。 */
export const BASELINE_PR_EXAMPLE_SHORT_TITLE = `${BASELINE_PR_TITLE_PREFIX} fix commute matrix bug`;

/** 正文首块三行（与 POLICY §3a「结构块」一致）。 */
export const BASELINE_PR_BODY_BLOCK_EXAMPLE = `comparisonClass=PURE_CODE_REGRESSION
cases=12/25 changed
reason=fix commute matrix bug`;

/**
 * CI / 本地校验失败时附加的说明块（与 POLICY 指向同一来源）。
 */
export function formatBaselinePrComplianceHint(): string {
  const bodyIndented = BASELINE_PR_BODY_BLOCK_EXAMPLE.split('\n')
    .map((line) => (line.length ? `  ${line}` : ''))
    .join('\n');
  return [
    '',
    `Example schema: ${BASELINE_PR_EXAMPLE_SCHEMA_VERSION}`,
    '',
    'Example (compact one-line title):',
    `  ${BASELINE_PR_TITLE_EXAMPLE_COMPACT}`,
    '',
    'Or put this block at the start of the PR body:',
    bodyIndented,
    '',
  ].join('\n');
}
