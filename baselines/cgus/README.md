# CGUS replay — official baseline registry

**Baseline governance:** [`BASELINE_UPDATE_POLICY.md`](./BASELINE_UPDATE_POLICY.md) — when you may change anchors, required PR evidence, and how `comparisonClass` maps to approval (prevents “update baseline to go green”). **PR title/body CI:** `.github/workflows/baseline-pr-title.yml` + `npm run check:baseline-pr-title` (see policy §3a). **Copy-paste title/body literals:** edit only [`scripts/lib/baseline-pr-compliance.examples.ts`](../../scripts/lib/baseline-pr-compliance.examples.ts) (single source of truth). **示例格式版本** = `BASELINE_PR_EXAMPLE_SCHEMA_VERSION` in that file (CI stderr prints `Example schema: …`).

This directory holds **team-agreed, versioned replay JSON** used as regression anchors. It complements:

- **Run**: `scripts/replay-cgus-suite.ts`, `scripts/replay-cgus-real-fixtures.ts` (reports include `observability` + per-case `rankReplaySnapshot` when using current scripts).
- **Compare**: `npm run cgus:replay:compare -- <baseline.json> <current.json> [--out diff.json]`

## What counts as an “official” baseline

A file promoted here should:

1. Be produced with **documented env** (seed, `MONTE_CARLO_SAMPLES`, rerank flags, `CGUS_SUITE_*`, `TD_REPLAY_MATRIX_ID`, etc.) copied into the PR or a run log.
2. Pass **`npm run fixtures:check`** when the run uses engine-captured TD fixtures.
3. Have **`observability.schemaVersion` = `cgus-replay-observability/v1`** and per-case **`rankReplaySnapshot`** so compare can classify top1 / topN drift (re-run replay if missing).
4. Be **named with intent + version**, e.g. `real-fixtures.engine-dso-v1.json`, not only `latest.json`.

## Canonical logical baselines (fill files as you promote)

| Logical name | Suggested filename | Intended corpus / role |
|--------------|-------------------|-------------------------|
| **real-fixtures** | `real-fixtures.engine-dso-v1.json` | `td-replay-fixtures` — day-to-day TD corpus; winner-protected semantics smoke. |
| **suite-stress-fatigue** | `suite-stress-fatigue.v1.json` | `cgus-suite:*:stress_fatigue` (or your pinned profile) — fatigue signal stress. |
| **suite-stress-weather** | `suite-stress-weather.v1.json` | `cgus-suite:*:stress_weather` — weather stress. |

Adjust table rows when you add profiles; keep **one primary file per logical baseline** to avoid “everyone compares against a different file.”

## Where files live

- **Default**: committed JSON under `baselines/cgus/` (small enough to review in Git, or LFS if needed).
- **Scratch / CI upload**: `artifacts/` is fine for **temporary** runs; promote to `baselines/cgus/` only through the process below.

## When to **update** (replace) an official baseline

Do **not** overwrite on every PR. Update when:

- You **intentionally** ship CGUS / MC rerank / margin / candidate-pool behavior and want the new distribution to become the new anchor, **or**
- Fixture contract version changes (`cgusDsoFixtureVersion`) and inputs are re-captured, **or**
- Observability / snapshot schema bumps (`cgus-replay-observability/v1`, `cgus-replay-rank-snapshot/v1`) and old files are no longer comparable.

## When to **only compare** (no baseline overwrite)

Typical PR work:

- Utility weights, pruning, exploration knobs, bugfixes under review.
- Parameter sweeps (“margin 0.03 vs 0.05”).

Use `npm run cgus:replay:compare` against the frozen file; attach `diff.json` or stdout to the PR.

## Regression diff reading template (fixed order)

Use this **same order** when reading a compare result (`compare` stdout or `diff.json`) so reviews stay aligned:

1. **Input surface** — In each side’s report: `observability.fixtureVersion`, `observability.fixtureVersionsDistinct` (if present), `observability.corpus`, `observability.caseCount`, `generatedAt`. Confirm you are comparing **same corpus / same fixture contract**.
2. **Headline rates** — `mcEligibleRate`, `winnerChangedRate`, `winnerLockedButTopNChangedRate`, `marginBlockedFlipRate` (from `rateComparison` deltas or each report’s `observability.rankAuthorityRates`).
3. **Winner drift** — `cases.top1Changed`: any change here is highest severity for “who won.”
4. **Tail reorder under stable winner** — `cases.topNChangedWinnerLocked`: informative for rerank value vs noise / candidate resolution.
5. **Data completeness** — `cases.missingRankReplaySnapshot`, `cases.missingInBaseline`: fix or re-run before drawing strong conclusions.
6. **Spot-check** — Pick a few ids from the lists above; in the **raw reports**, open `results[].rankReplaySnapshot` and read `deterministicTopN` vs `finalTopN` for those cases.

No extra tooling required; this is the default review checklist for CGUS replay regressions.

## Promotion checklist (baseline bump PR)

1. Follow **[`BASELINE_UPDATE_POLICY.md`](./BASELINE_UPDATE_POLICY.md)** (including **anti-gaming** and **§3a PR title/body format**).
2. Run replay with pinned env; store command + env in PR description.
3. `npm run fixtures:check` (if TD fixtures involved).
4. `npm run cgus:replay:compare -- baselines/cgus/<old>.json <new-run.json> --out artifacts/cgus-replay-diff.promotion.json` — review rate deltas and **top1Changed** / **topNChangedWinnerLocked** lists.
5. Copy or rename the new report into `baselines/cgus/` with a **new version suffix** if semantics changed; update the table above.
6. Avoid silent overwrite: prefer **add new file + pointer in PR** rather than force-push replacing history without context.

## Schema discipline

Keep **`observability` and `rankReplaySnapshot` stable** across releases unless there is a **version bump** and compare-path migration. Prefer ad-hoc debug fields in separate logs or uncommitted artifacts—not in the official baseline contract.

## `comparisonClass` 官方优先级（固定顺序）

`scripts/compare-cgus-replay-reports.ts` 中 `deriveComparisonSummary` 与 diff JSON 字段 `comparisonSummary.comparisonClassPriorityOrder` 使用同一顺序（从高到低，先命中先返回）：

1. `INCOMPLETE_FINGERPRINT` — 指纹不完整，无法归因比较。
2. `MIXED_ATTRIBUTION_DIFF` — `configHash` 与 `mappingVersion` 同时不一致。
3. `MAPPING_DIFF` — 仅 `mappingVersion` 不一致（DecisionParams 映射路径 / shadow 等）。
4. `CONFIG_DIFF` — 仅 `configHash` 不一致（optimizer / MC / 采样 / 脚本数值参数等）。
5. `CORPUS_SEED_OR_COMMIT_DIFF` — 仅语料版本、seed 或 `gitSha` 等运行上下文差异（**不**并入 `CONFIG_DIFF`，便于区分「参数口径」与「语料/随机性/提交点」）。
6. `PURE_CODE_REGRESSION` — 上述指纹面对齐，比较在「可归因」意义上可视为纯代码/纯实现回归语境。

## `gateRecommendation` 门禁语义（正式规则，非仅 stdout 提示）

由 `comparisonSummary.gateRecommendation` 输出，**CI / release gate 应以此为准**，与控制台文案一致：

| 取值 | 含义 | 建议 CI 行为 |
|------|------|----------------|
| **BLOCK** | 指纹不完整（`INCOMPLETE_FINGERPRINT`），无法安全归因 | **拦截**合并/发布 |
| **REVIEW** | 存在可归因类差异（`CONFIG_DIFF` / `MAPPING_DIFF` / `CORPUS_SEED_OR_COMMIT_DIFF` / `MIXED_ATTRIBUTION_DIFF`） | **需人工审查**后再晋升基线或发布；可用 `CGUS_COMPARE_GATE_POLICY=fail_on_review` 在自动化中强制失败 |
| **PASS** | `PURE_CODE_REGRESSION` — 指纹面对齐 | **允许**继续流水线（仍应人工阅读 rate / top1 等业务 diff） |

### 环境变量（release / CI）

| 变量 | 行为 |
|------|------|
| `CGUS_COMPARE_FP_STRICT=1` | 任一侧 `FingerprintCompleteness` 含 **errors** → 进程退出码 **2** |
| `CGUS_COMPARE_GATE_POLICY=fail_on_review` | `gateRecommendation === 'REVIEW'` → 退出码 **4**（发布线强制人工过审） |

npm：`npm run cgus:replay:compare:strict`（仅 `CGUS_COMPARE_FP_STRICT=1`）；发布线可再前缀 `CGUS_COMPARE_GATE_POLICY=fail_on_review`。

### `configForHash` 变更纪律（与代码同权）

凡新增进入 `configForHash` 的键，PR 中必须附一句 **「为什么它会改变数值结果」**；仅审计可读、不改变 CGUS 数值的字段禁止进入（见 `scripts/lib/cgus-replay-config-hash.ts` 文件头规则）。

## Related docs

- **Baseline update rules:** [`BASELINE_UPDATE_POLICY.md`](./BASELINE_UPDATE_POLICY.md)
- Engine fixture lifecycle: `src/trips/decision/evaluation/FIXTURE_REGENERATION.md`
