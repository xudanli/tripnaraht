# CGUS Baseline Update Policy

Short, binding rules for changing files under `baselines/cgus/`. Without this, “refresh the baseline when compare fails” erodes the replay gate.

## 1. When you **may** update an official baseline

- **Shipped behavior change**: CGUS / MC rerank / margin / candidate pool or equivalent is intentionally merged, and the new distribution is the new anchor.
- **Fixture contract change**: `cgusDsoFixtureVersion` (or corpus) changes and fixtures are re-captured with documented commands and env.
- **Schema bump**: `cgus-replay-observability` / `rankReplaySnapshot` contract version changes with a compare migration plan.
- **Emergency** (rare): production-impacting fix; requires a one-line incident reference in the PR and post-merge follow-up if the anchor was moved under pressure.

## 2. When you **must not** update a baseline

- Solely to make CI green **without** resolving or accepting the underlying attribution (`comparisonSummary.comparisonClass`).
- Because the diff is “noisy” or inconvenient, without an explicit decision recorded in the PR.
- While **`comparisonClass` is `INCOMPLETE_FINGERPRINT`**: fix fingerprints and re-run replay first.

**Anti-gaming (反作弊):** It is **forbidden** to change what goes into `configForHash`, to rename or fake `mappingVersion`, or to bump fixture version identifiers **only** to bypass or disguise `comparisonClass` / `gateRecommendation`. Reviewers reject such PRs.

## 3. Required evidence in every baseline-bump PR

1. **Pinned command + env** (copy-paste block) used to produce the new JSON.
2. **Artifact**: attach or link the new full replay report (path in repo or CI artifact).
3. **Compare**:  
   `npm run cgus:replay:compare -- baselines/cgus/<old>.json <new-report.json> [--out artifacts/...diff.json]`  
   Prefer also recording `comparisonSummary` (class, `gateRecommendation`, `comparisonClassPriorityOrder`) in the PR body or in the diff JSON.
4. **Fingerprint sanity**: note `runFingerprint.configHash`, `mappingVersion`, and fixture version set so reviewers know what moved.
5. **One-line changelog** in the PR: *why* the anchor moved (product intent, not “tests failed”).

### 3a. Standard PR title and description (scan + history)

**Single source of truth (do not copy strings here):** all literal examples live in  
[`scripts/lib/baseline-pr-compliance.examples.ts`](../../scripts/lib/baseline-pr-compliance.examples.ts)  
(`BASELINE_PR_TITLE_EXAMPLE_COMPACT`, `BASELINE_PR_EXAMPLE_SHORT_TITLE`, `BASELINE_PR_BODY_BLOCK_EXAMPLE`, `BASELINE_PR_EXAMPLE_SCHEMA_VERSION`). CI stderr uses the same via `formatBaselinePrComplianceHint()` in `scripts/check-baseline-pr-title.ts` (includes `Example schema: …`). **Change format in one place only.**

**示例格式版本：** 以 `BASELINE_PR_EXAMPLE_SCHEMA_VERSION` 为准（与 CI stderr 的 `Example schema:` 行一致；文档不硬编码版本号以免漂移）。

**Rules (summary):**

- **Title** must start with **`[CGUS Baseline Update]`** (see `BASELINE_PR_TITLE_PREFIX` in the examples module).
- **Either** a **compact one-line title** containing `comparisonClass=`, `cases=<n>/<m>` (digit fraction), and `reason=` **or** a **short title** plus a **body opening block** with those three keys (shape = `BASELINE_PR_BODY_BLOCK_EXAMPLE` in the module).
- Use the **actual** `comparisonClass` and counts from your compare output (`cases` = e.g. `top1Changed` / total or your agreed metric—state which in the same block if not obvious).

**CI enforcement:** `.github/workflows/baseline-pr-title.yml` runs `scripts/check-baseline-pr-title.ts` on PRs that touch `baselines/cgus/**`: any change to `baselines/cgus/*.json` requires the title prefix; titles with the prefix must include `comparisonClass=`, `cases=<digits>/<digits>`, and `reason=` in **title or body**. Local dry-run: `PR_TITLE='…' PR_BODY='…' npm run check:baseline-pr-title`.

## 4. How `comparisonClass` affects baseline promotion

| `comparisonClass` | Baseline update |
|-------------------|-----------------|
| **`PURE_CODE_REGRESSION`** | Allowed when the code change is the **intended** reason for the new anchor; review rate deltas and `top1Changed` / `topNChangedWinnerLocked` as usual. |
| **`CORPUS_SEED_OR_COMMIT_DIFF`** | Allowed when the **intended** change is corpus, seed, or commit anchor; document which of seed / fixture set / `gitSha` moved and why. |
| **`CONFIG_DIFF`** | **Not default.** Allowed only if the **shipped** change is optimizer / MC / sampling / numeric script config; PR must state that config drift is intentional. |
| **`MAPPING_DIFF`** | **Not default.** Allowed only if **DecisionParams mapping** rollout is intentional; needs explicit sign-off from the mapping / memory owner (or team RACI delegate). |
| **`MIXED_ATTRIBUTION_DIFF`** | Treat as **high scrutiny**: both config and mapping moved; needs combined sign-off (config + mapping owners or single delegated architect). |
| **`INCOMPLETE_FINGERPRINT`** | **Do not** promote; fix completeness first (`CGUS_COMPARE_FP_STRICT=1` should block anyway). |

## 5. `gateRecommendation: REVIEW` vs baseline updates

- **`REVIEW` means automation must not self-approve** a new anchor; a human must record *why* adopting the new JSON is still correct for the product line.
- A baseline PR may still land **after** human approval, even if a branch used `CGUS_COMPARE_GATE_POLICY=fail_on_review` (exit 4): either re-run compare after sign-off without `fail_on_review`, or merge with documented reviewer override and the same evidence as in §3.

**`BLOCK`**: do not promote until fingerprints are complete and comparable.

## 6. Roles (adjust names to your RACI)

| Role | Responsibility |
|------|----------------|
| **Proposer** | Runs replay, opens PR with §3 evidence. |
| **Technical approver (CGUS / optimization)** | Confirms `comparisonClass` handling matches shipped intent; rejects “green by baseline only.” |
| **Mapping owner** (when `MAPPING_DIFF` or mixed) | Confirms mapping rollout is intentional. |
| **Release / tech lead** | Final merge of baseline changes into `baselines/cgus/` per team process. |

## 7. Relationship to other docs

- Promotion checklist and reading order: `baselines/cgus/README.md`
- Gate semantics and exit codes: same README (`gateRecommendation`, `CGUS_COMPARE_*`).
- Fixture lifecycle: `src/trips/decision/evaluation/FIXTURE_REGENERATION.md`
