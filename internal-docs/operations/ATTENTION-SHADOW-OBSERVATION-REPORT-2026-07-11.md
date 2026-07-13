# Slice 4 — Attention Shadow Observation Report

**Generated:** 2026-07-11  
**Commit SHA:** `246366f9e1ddc798e4cd42ccd0aa95a0136dab6f`  
**Feature flag:** `ATTENTION_ROOT_CAUSE_ORCHESTRATION=1`（`ATTENTION_ROOT_CAUSE_PRIMARY_SSO=1` **禁止**）

---

## Status

**Slice 4 Shadow Observation 已关闭** — 工程与产品语义均通过。当前保持 **FROZEN · SHADOW_CLOSED · NO_VISIBLE_CUTOVER**。

| 状态行 | 当前值 |
|--------|--------|
| Slice 4 Contract Freeze | **PASS** |
| Slice 4 Shadow Engineering Closure | **PASS** |
| Slice 4 Staging Observation Closure | **PASS** |
| Slice 4 Human Adjudication | **PASS** |
| Slice 4 Observation Closure | **PASS** |
| Primary SSO | **NOT ELIGIBLE** |
| Visible Queue Cutover | **NOT ELIGIBLE** |
| Notifications | **OFF** |

**当前唯一依赖：** Slice 3 正式 **CLOSED**。关闭后立即进入 **Internal Dual-Read**（不是 Primary SSO）。

## Sample Coverage Target

| Bucket | Target | Current Harness |
|--------|--------|-----------------|
| Deterministic | ≥ 20 | 20（5 组） |
| Staging replay (fixture harness) | ≥ 10 | 10（STG-01…10） |
| Staging replay (real DB) | ≥ 10 | **10/10 AUTO_PASS** — trip `c0c77777…` batch `2026-07-11T13-13-11` |
| **Total harness** | **≥ 30** | **30** |

### Staging Real-DB Replay (Canary)

| Scenario | 覆盖 |
|----------|------|
| STG-REPLAY-A | 单强风 → 1 cluster，Primary = WEATHER |
| STG-REPLAY-B | 强风 + infeasible → Primary 切换 |
| STG-REPLAY-C | + night → attention 升级 |
| STG-REPLAY-D | + 无关 road → 不 false merge |
| STG-REPLAY-E | 重复 polling → 不 duplicate |
| STG-REPLAY-F | resolved → visible 移除 |
| STG-REPLAY-07…10 | episode authority / stale / full chain |

Evidence schema: `tripnara.attention_shadow_staging_replay@v1`

人工签字：[ATTENTION-SHADOW-HUMAN-ADJUDICATION-2026-07-11.md](./ATTENTION-SHADOW-HUMAN-ADJUDICATION-2026-07-11.md)

### Staging Replay (fixture harness)

STG-01 … STG-10 — 单强风、强风+slip、window miss、night driving、无关 road、双 episode、重复 polling、resolved、missing episode、stale row。

### Deterministic Groups

| Group | Count | IDs |
|-------|-------|-----|
| CORRECT_MERGE | 5 | DET-CM-01 … 05 |
| CORRECT_SEPARATION | 4 | DET-CS-01 … 04 |
| PRIMARY_SWITCH | 4 | DET-PS-01 … 04 |
| ATTENTION_ESCALATION | 4 | DET-AE-01 … 04 |
| RESOLUTION_REPLAY | 3 | DET-RR-01 … 03 |

---

## Per-Sample Evidence

| Type | Path |
|------|------|
| Harness / drill | `attention-shadow-{tripId}-{timestamp}.json` |
| Staging real-DB | `attention-shadow-staging-{scenarioId}-{tripId}-{timestamp}.json` |
| Batch summary | `attention-shadow-staging-batch-{tripId}-{timestamp}.json` |

Directory: `internal-docs/operations/evidence/attention-shadow/`

Staging replay 每条必须保留：

- `inputRows` — 原始 Unified Row
- `normalizedInputs` — episode / lineage 来源、`rootCauseKey`、`mergeAuthority`
- `clusters` / `primaryItems` / `legacyVisibleItems`
- `comparison.primarySelectionReason` / `comparison.attentionReason`
- `humanAdjudication` — 见 [ATTENTION-SHADOW-HUMAN-ADJUDICATION-2026-07-11.md](./ATTENTION-SHADOW-HUMAN-ADJUDICATION-2026-07-11.md)（**PASS**）

---

## Exit Criteria

| Metric | Target | Actual | Pass |
|--------|--------|--------|------|
| False Merge Rate | 0% | 0% | ✓ |
| Wrong Primary Rate | 0% | 0% | ✓ |
| Wrong Attention Rate | 0% | 0% | ✓ |
| Wrong Resolution Rate | 0% | 0% | ✓ |
| Missed Merge Rate | ≤5%（全部人工裁决） | 0% | ✓ |
| Duplicate Reduction | >0 | N/A (shadow) | — |
| Repeated Polling Duplicate | 0 | 0 | ✓ |
| AUTO_PENDING_HUMAN | 0 | 0 | ✓ |
| stagingRealDbSamples | ≥ 10 | 10 | ✓ |
| underlyingProblemsPreserved | 100% | 100% | ✓ |

---

## Episode Authority Rules (Frozen)

1. **有显式 `weatherEpisodeId` 或 causal lineage** → 允许跨模块合并  
2. **无显式 episode / lineage** → **默认不合并**（宁可 MISSED_MERGE，不要 FALSE_MERGE）  
3. **两个连续强风 episode（A / B）** → 必须保持 **两个 cluster**（rootCauseKey 依赖 episode identity）

---

## Priority Failures

最高优先级错误（必须为 0 才能 GO）：

- `FALSE_MERGE`
- `WRONG_PRIMARY`
- `WRONG_ATTENTION`
- `WRONG_RESOLUTION`

---

## Dependencies

- Slice 3 Native E2E + Ops **未 CLOSED** → `ATTENTION_ROOT_CAUSE_PRIMARY_SSO=1` **BLOCKED**
- Visible queue / notifications **不变**

## Recommended Cutover Sequence (post-exit)

1. Shadow Observation Closed ✅
2. Internal dual-read — **NOT STARTED**（blocked by Slice 3 CLOSED）
3. Internal primary projection
4. Allowlist canary
5. Visible queue cutover

---

## GO / NO-GO

**Recommendation:** **GO for Observation Closure** · **NO-GO for Primary SSO / Visible cutover** until Slice 3 CLOSED

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Attention Runtime Owner | Guardian Decision Core | 2026-07-11 | APPROVED |
| Guardian / Decision Core Owner | Guardian Decision Core | 2026-07-11 | APPROVED |
| Release Sign-off Owner | Trip Product & Safety | 2026-07-11 | APPROVED |

**Commit SHA at sign-off:** `246366f9e1ddc798e4cd42ccd0aa95a0136dab6f`

**Human adjudication:** [ATTENTION-SHADOW-HUMAN-ADJUDICATION-2026-07-11.md](./ATTENTION-SHADOW-HUMAN-ADJUDICATION-2026-07-11.md)
