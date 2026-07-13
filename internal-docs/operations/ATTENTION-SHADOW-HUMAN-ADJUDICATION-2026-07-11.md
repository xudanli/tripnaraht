# Slice 4 — Attention Shadow Human Adjudication

**Date:** 2026-07-11  
**Commit SHA:** `246366f9e1ddc798e4cd42ccd0aa95a0136dab6f`  
**Batch evidence:** `internal-docs/operations/evidence/attention-shadow/attention-shadow-staging-batch-c0c77777-7777-4777-8777-777777777777-2026-07-11T13-13-11-066Z.json`  
**Canary Trip:** `c0c77777-7777-4777-8777-777777777777` (`exec-slip-canary@tripnara.dev`)  
**Feature flags:** `ATTENTION_ROOT_CAUSE_ORCHESTRATION=1` · `ATTENTION_ROOT_CAUSE_PRIMARY_SSO=0` (**禁止**)

---

## Purpose

Staging 实库 replay 10/10 AUTO_PASS 已完成。本文件为 **Engineering/Architecture** 与 **Product/Safety** 双签记录，逐样本确认 merge、primary、attention、visible count、resolution。

**本签字不授权：** Primary SSO · Visible Queue cutover · 用户通知。

### 正式状态（签字后）

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

Slice 4 保持 **FROZEN · SHADOW_CLOSED · NO_VISIBLE_CUTOVER**，直至 Slice 3 **CLOSED** 后进入 Internal Dual-Read。

---

## Priority Failure Summary

| Metric | Count | Target |
|--------|-------|--------|
| FALSE_MERGE | 0 | 0 |
| WRONG_PRIMARY | 0 | 0 |
| WRONG_ATTENTION | 0 | 0 |
| WRONG_RESOLUTION | 0 | 0 |
| MISSED_MERGE (adjudicated) | 0 | ≤ 5% |
| repeatedPollingDuplicate | 0 | 0 |
| AUTO_PENDING_HUMAN | 0 | 0 |

---

## Per-Sample Adjudication

Evidence 目录：`internal-docs/operations/evidence/attention-shadow/`

| Scenario | runId | 是否应合并 | rootCauseKey | Primary | Attention | 可见卡数 | Resolution | 可进 Canary | Eng | Prod/Safety | Notes |
|----------|-------|-----------|--------------|---------|-----------|----------|------------|-------------|-----|-------------|-------|
| STG-REPLAY-A | `a4edeaaf-5ea0-4dc2-8aba-32897fee1eca` | NO | PASS | PASS | PASS | CORRECT | CORRECT | YES | ✓ | ✓ | 单强风；1 cluster；LOG_ONLY；visible=0 |
| STG-REPLAY-B | `dcecf301-c1ce-42e0-919b-52c946133e29` | YES | PASS | PASS | PASS | CORRECT | CORRECT | YES | ✓ | ✓ | wind+infeasible 同 episode；Primary=EXECUTION；INTERRUPT≥QUEUE |
| STG-REPLAY-C | `0950247f-6d9a-4155-9b01-872b44812269` | YES | PASS | PASS | PASS | CORRECT | CORRECT | YES | ✓ | ✓ | +night；cluster 仍为 1；attention=INTERRUPT |
| STG-REPLAY-D | `c9b55add-cf64-4606-b12e-6787b1f6a4d0` | YES* | PASS | PASS | PASS | CORRECT | CORRECT | YES | ✓ | ✓ | *因果链合并 YES；无关 ROAD 独立（CORRECT_SEPARATION）；无 false merge |
| STG-REPLAY-E | `STG-REPLAY-E-poll-2` | YES | PASS | PASS | PASS | CORRECT | CORRECT | YES | ✓ | ✓ | poll-1/2 均为 cluster=1 visible=1；无 duplicate |
| STG-REPLAY-F | `07b06996-4da4-4b6a-9cb4-ab9c109fdc0a` | NO | PASS | PASS | PASS | CORRECT | CORRECT | YES | ✓ | ✓ | 全 RESOLVED；visible=0；underlying 3 行保留 |
| STG-REPLAY-07 | `64458e92-147f-4d58-97ad-f5320f63b83f` | NO | PASS | PASS | PASS | CORRECT | CORRECT | YES | ✓ | ✓ | AM/PM 双 episode → 2 cluster；不得跨 episode merge |
| STG-REPLAY-08 | `3606d4dd-bd7e-4343-b38f-8a260504f450` | NO | PASS | PASS | PASS | CORRECT | CORRECT | YES | ✓ | ✓ | missing episode → 保守 2 cluster；宁可 MISSED 不要 FALSE |
| STG-REPLAY-09 | `16d07c47-a684-43d8-9a2e-130203146786` | YES | PASS | PASS | PASS | CORRECT | CORRECT | YES | ✓ | ✓ | stale infeasible 仍 merge；lineage 完整 |
| STG-REPLAY-10 | `1cd5ff9c-96e3-4521-a723-13b4a1204958` | YES | PASS | PASS | PASS | CORRECT | CORRECT | YES | ✓ | ✓ | wind→slip→infeasible+night 完整链；Primary=EXECUTION |

### Per-Sample Detail (Engineering)

| Scenario | Verdict | Cluster | Primary (actual) | Attention | Visible | Underlying |
|----------|---------|---------|------------------|-----------|---------|------------|
| A | NO_OP | 1/1 | WEATHER_STRONG_WIND | LOG_ONLY | 0/0 | 1 |
| B | CORRECT_MERGE | 1/1 | EXECUTION_SCHEDULE_INFEASIBLE | INTERRUPT | 1/1 | 2 |
| C | CORRECT_MERGE | 1/1 | EXECUTION_SCHEDULE_INFEASIBLE | INTERRUPT | 1/1 | 3 |
| D | CORRECT_SEPARATION | 1/1 | EXECUTION_SCHEDULE_INFEASIBLE | INTERRUPT | 1/1 | 3 (+ road observe) |
| E | NO_OP | 1/1 (×2 poll) | EXECUTION_SCHEDULE_INFEASIBLE | INTERRUPT | 1/1 | 3 |
| F | NO_OP | 1/1 | EXECUTION_SCHEDULE_INFEASIBLE | SILENT | 0/0 | 3 |
| 07 | CORRECT_SEPARATION | 2/2 | WEATHER_STRONG_WIND | LOG_ONLY | 0/0 | 2 |
| 08 | CORRECT_SEPARATION | 2/2 | EXECUTION_SCHEDULE_INFEASIBLE | INTERRUPT | 1/1 | 2 |
| 09 | CORRECT_MERGE | 1/1 | EXECUTION_SCHEDULE_INFEASIBLE | INTERRUPT | 1/1 | 2 |
| 10 | CORRECT_MERGE | 1/1 | EXECUTION_SCHEDULE_INFEASIBLE | INTERRUPT | 1/1 | 4 |

rootCauseKey 样例（A）：`weather:strong-wind:c0c77777-7777-4777-8777-777777777777:segment:…:drive_day2:vedur_ep_exec_slip_staging_20260712` — 稳定、含 episode identity，无 observedAt 污染。

---

## Observation Closure Exit Criteria

| Criterion | Target | Actual | Pass |
|-----------|--------|--------|------|
| stagingRealDbSamples | ≥ 10 | 10 | ✓ |
| falseMergeRate | 0 | 0 | ✓ |
| wrongPrimaryRate | 0 | 0 | ✓ |
| wrongAttentionRate | 0 | 0 | ✓ |
| wrongResolutionRate | 0 | 0 | ✓ |
| repeatedPollingDuplicate | 0 | 0 | ✓ |
| underlyingProblemsPreserved | 100% | 100% | ✓ |
| AUTO_PENDING_HUMAN | 0 | 0 | ✓ |
| missedMergeRate | ≤ 5% | 0% | ✓ |

**Slice 4 Observation Closure:** **PASS**

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Engineering / Architecture | Guardian Decision Core | 2026-07-11 | **APPROVED** |
| Product / Safety | Trip Product & Safety | 2026-07-11 | **APPROVED** |

### Engineering Checklist

- [x] 10 staging replay evidence files reviewed
- [x] Read Model row shape matches adapter assumptions (`TRIP_METADATA_RFC001`)
- [x] Episode / lineage provenance traced in `normalizedInputs`
- [x] No FALSE_MERGE / WRONG_PRIMARY / WRONG_ATTENTION / WRONG_RESOLUTION
- [x] `ATTENTION_ROOT_CAUSE_PRIMARY_SSO` remains **disabled**

### Product / Safety Checklist

- [x] 「是否应合并」语义与用户预期一致（含 conservative separation 07/08）
- [x] Primary 卡片决策入口合理（Primary ≠ root cause；EXECUTION 驱动决策）
- [x] 无安全级漏合并；07/08 保守分离为多卡 fallback，非错误隐藏
- [x] 不授权 Visible Queue cutover 或通知

---

## Blocked Until Slice 3 CLOSED

Observation Closure = PASS **不触发** cutover。仍 **禁止**：

- `ATTENTION_ROOT_CAUSE_PRIMARY_SSO=1`
- Visible Queue cutover
- 用户通知

**下一序列（Slice 3 CLOSED 后启动）：**

Shadow Observation Closed → **Internal Dual-Read** → Internal Primary Projection → Allowlist Canary → Visible Queue Cutover

---

## Post-Closure Sequence (not started)

| Step | Status |
|------|--------|
| Shadow Observation Closed | **PASS** |
| Internal Dual-Read | **NOT STARTED** — blocked by Slice 3 |
| Internal Primary Projection | NOT STARTED |
| Allowlist Canary | NOT STARTED |
| Visible Queue Cutover | NOT ELIGIBLE |
