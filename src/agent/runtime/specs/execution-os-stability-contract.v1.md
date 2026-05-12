# Execution OS Stability Contract (SSC) v1

**Status:** normative for CI + operational discipline; implementation hooks live in `execution-gateway-contract-governance.v1.ts`, `execution-gateway-trace-contract.enforcement.ts`, and `npm run ci:execution-os-stability`（末尾输出 **`execution_os.verdict@v1`**，见 §8.4）。

**Scope:** how this repo stays a **self-verifying execution OS** without silent drift: governance hash, gateway trace contract, replay strict seal, and a minimal replay regression matrix.

---

## 1. CI enforcement rules (mandatory)

| Gate | Command / mechanism | Fail condition |
|------|---------------------|----------------|
| Governance rule-set hash | `npm run ci:execution-os-stability` (includes `scripts/ci/check-execution-os-stability-contract.ts`) | `computeExecutionGatewayContractGovernanceRuleSetHashV1() !== EXECUTION_GATEWAY_CONTRACT_GOVERNANCE_RULE_SET_HASH_V1_EXPECTED` |
| Trace + memory + router enforcement | Jest `execution-gateway-trace-contract.enforcement.spec.ts` (invoked via same npm script) | any assertion failure |
| Replay merge + regression matrix | Jest `execution-os-replay-regression-matrix.v1.spec.ts` | any assertion failure |
| Change Impact Descriptor (CID) | `npm run ci:cid-v1` (manifest + optional strict `git diff` vs `CID_MERGE_BASE`) | manifest invalid / strict path rules not satisfied |

**Dual enforcement:** runtime (`route_and_run` success path) + CI (same hash material). A change that updates governance material without updating the pinned hash must fail CI before merge.

---

## 2. Version bump decision tree

**Bump `SEMANTIC_VALIDATION_CONTRACT_REVISION`** (in `semantic-validation-result-schema.ts`) when:

- Semantic validation result schema, execution graph topology fixtures, or document `semantic-validation-contract.md` materially changes execution identity or ABI consumed by traces / ledger.

**After bumping semantic revision, always:**

1. Run `npm run exec:gateway-governance-hash`.
2. Update `EXECUTION_GATEWAY_CONTRACT_GOVERNANCE_RULE_SET_HASH_V1_EXPECTED` if the printed hash changed (governance material embeds `SEMANTIC_VALIDATION_CONTRACT_REVISION`).

**Bump `EXECUTION_MODEL_VERSION`** when:

- Host execution model identity changes (selector / compatibility tables / version string exposed to trace).

**Bump governance rule keys** (`traceContract`, `memoryBindingContract`, `routerOutputContract`, or `gatewayEnforcement`) when:

- Enforcement semantics change (new required fields, new bindings, stricter router output), even if trace schema id/version unchanged.

**Bump `ORCHESTRATION_EXECUTION_TRACE_V1_VERSION`** when:

- The `OrchestrationExecutionTraceV1` payload shape or meaning changes (requires coordinated replay and client updates).

**Regenerate pinned governance hash** when:

- Any field in `EXECUTION_GATEWAY_GOVERNANCE_MATERIAL_V1` changes, including `semanticValidationContractRevision`, `traceSchemaId`, `traceSchemaVersion`, or `rules.*`.

---

## 3. Replay regression matrix (v1)

| Case | Intent | Status |
|------|--------|--------|
| v1 vs v1 identical | Same `OrchestrationExecutionTraceV1` → same `OrchestrationReplayProfileV1` | required in Jest |
| v1 strict seal replay shape | Merged request carries `orchestration_replay_strict_seal` + `execution_model_allow_upgrade === false` when product replay path applies them | required in Jest |
| v1 runtime fingerprint alignment | Golden trace uses host `buildSemanticModelSnapshotDescriptor().fingerprint` | required in Jest |
| v2 cross-version replay | Replay of v2 traces against v1 seal / governance | **placeholder** (`describe.skip` until v2 material exists) |

---

## 4. Runtime stability budget (v1 targets, non-binding)

These are **operational targets** for a follow-up hardening PR; SSC v1 records them so work stays traceable.

- **Latency budget:** document p95 / max for `route_and_run` per orchestration mode (to be measured in prod/staging).
- **Trace size budget:** cap or warn on `observability.trace` serialized size (telemetry + storage).
- **Memory snapshot size:** cap Redis payload for `MemorySnapshotPersistence` (reject or sample on persist).
- **Enforcement cost:** keep gateway assertions O(1) on response size; no per-request ledger scans in hot path.

---

## 5. Migration (SSC v1 → v2)

- Add `EXECUTION_GATEWAY_GOVERNANCE_MATERIAL_V2` and a second pinned hash when governance rules split (e.g. separate replay seal revision).
- CI runs both hashes until v1 material is retired.
- See `execution-gateway-contract-governance.v1.ts` header for parallel governance migration notes.

---

## 6. Execution OS v1 freeze boundary

Until an explicit **v2 program** is approved, **v1** means:

- **No new** execution kernel entrypoints beyond `route_and_run` / documented replay HTTP surface.
- **No new** `OrchestrationExecutionTraceV1` schema versions without coordinated replay + client bump.
- **No new** governance primitives (pinned hashes, enforcement categories) without a governance material bump + SSC update.

**Allowed on v1:** bugfixes, contract tightening, CI strengthening, documentation that does not alter executable invariants, and **CID manifest** updates that truthfully record impacts.

---

## 7. Change Impact Descriptor (CID) v1

**Goal:** shift drift detection earlier — **declare contract impact at change time**, not only at runtime.

| Artifact | Role |
|----------|------|
| Repository root `change-impact-descriptor.v1.json` | Machine-readable manifest; **update in any PR** that touches paths matched by `CID_STRICT_PATH_RULES_V1` (see `execution-os-change-impact-descriptor.v1.ts`). |
| `npm run ci:cid-v1` | Validates manifest + (on PR CI) `CID_STRICT_DIFF=1` + `CID_MERGE_BASE` → `git diff` must be **covered** by `impacts.*` flags. |
| `.github/pull_request_template.md` | Human checklist + pointer to CID file. |
| Runtime trace | `RouteAndRunRequestDto.options.change_impact_descriptor_v1` → parsed copy on **`observability.trace.change_impact_descriptor_v1`**（与 `execution_trace_v1` 并列）；成功路径下须与请求 **canonical 相等**（gateway enforcement）。 |
| CID semantic view | 当请求含 CID 时，派生 **`observability.trace.cid_semantic_view_v1`**（`agent.execution_os.cid_semantic_view@v1`）：仅解释层指纹 + flags，**不改变**路由/执行分支。 |
| Execution semantic axis | 每条成功 trace 含 **`observability.trace.execution_semantic_fingerprint_v1`**（`cid_axis_version` + model + route path + 可选 CID canonical）；gateway 校验与 trace 自洽。 |
| CID axis lock | 常量 **`CID_AXIS_VERSION`**（`execution-os-change-impact-descriptor.v1.ts`）写入语义指纹与 `cid_semantic_view` 材料；变更版本时须同步迁移/清缓存。 |
| Trace compatibility | `RouteAndRunRequestDto.options.trace_compatibility_mode`：`cid-aware`（默认）全量契约；`legacy` 仅放宽旧 dedup 形态（缺语义指纹 / 请求有 CID 而 trace 未物化），并在 **`observability.execution_trace_compatibility_v1`** 记录 `suppressed_warnings`。 |
| Dedup（cid-aware） | 命中缓存但 trace 缺 **`execution_semantic_fingerprint_v1`**（或请求带 CID 而 trace 无 CID）时 **拒绝 dedup**，强制新鲜执行以刷新 trace。 |
| Replay | `POST /agent/replay_from_trace` 可选 **`expected_change_impact_descriptor_v1`**：注入 CID 并比对响应 trace（`400` on mismatch）；成功时 **`observability.replay_change_impact_closure_v1`**（`inferred_change_impact_descriptor_v1` + `reversibility_ok`）。 |
| CI 单视图 + 观测 | `npm run ci:execution-os-stability`：jest 通过后 **追加** NDJSON 快照（§8.6）→ 打印 **`execution_os.verdict@v1`**；**不改变运行时**；`fingerprint_match` / `replay_safe` 由 jest 已通过隐含。趋势：`npm run obs:execution-os-stability:trend`。 |

**Governance hash dependency:** if `impacts.governanceHash` is true, authors must still run `npm run exec:gateway-governance-hash` and update `EXECUTION_GATEWAY_CONTRACT_GOVERNANCE_RULE_SET_HASH_V1_EXPECTED` when governance **material** changes (§2).

**Classification vs impacts:** `classification` implies minimum impacts (e.g. `GOVERNANCE` ⇒ `governanceHash: true`); stricter path rules may require additional flags when multiple sensitive files change.

**Default branch hygiene:** when `main` has no pending contract work, prefer `classification: "NONE"` with all `impacts` false and a truthful `rationaleNoContractImpact` (≥40 chars). Flip flags again on the next sensitive edit.

---

## 8. Execution OS v1 Final Stability Contract（语义冻结）

**目的：** 把「稳定期」落成 **PR 可执行的边界**：后续改动只允许在 **不破坏下列三层分工** 的前提下进行。

### 8.1 三层（不可逆分工）

| Layer | 职责 | 允许 | **禁止** |
|-------|------|------|----------|
| **Compatibility** | 纯解释 / 准入宽容 | 仅 `trace_compatibility_mode`: `legacy` \| `cid-aware`；影响 dedup 是否命中、成功路径上对 trace 的**部分**契约放宽、`suppressed_warnings` 与 `execution_trace_compatibility_v1` | 参与 **routing / execution 分支**；参与 **replay 正确性判定**；引入 **classification / taxonomy** 扩展 |
| **Enforcement** | 唯一合法性裁判 | CID missing/mismatch、governance hash、trace 契约、语义指纹自洽、replay strict seal 等 **throw / 400** | 做「兼容解释」；为 legacy **编造**合法理由；把观测聚合当成门禁 |
| **Execution kernel** | 纯执行真值 | `route_and_run` 主链产出 `execution_trace_v1`、`execution_semantic_fingerprint_v1`、CID 物化（与请求对齐由 enforcement 校验） | 读取 **`trace_compatibility_mode`**；读取 enforcement 状态；内嵌 **dedup 策略** |

**调用顺序说明（工程事实 vs 语义）：** runtime 上先有 **dedup 准入**（兼容层影响是否复用缓存），未命中则跑 **kernel**，成功返回后再跑 **enforcement**。语义上仍满足：**kernel 不读兼容模式**；兼容只影响「是否走缓存」与「enforcement 是否对缺字段宽容」，不改变 kernel 内路由算子。

### 8.2 三条原则（冻结）

1. **Compatibility cannot affect truth** — 兼容层永不进入 kernel 决策；不改写 `execution_trace_v1` 所记录的事实语义。
2. **Enforcement cannot interpret** — 只判定合法 / 非法，不解释历史业务意图。
3. **Execution cannot observe system policy** — kernel 只产出事实；策略与版本条件在网关 / CI / 契约层表达。

### 8.3 PR 门禁（一句话）

> **若 PR 无法证明「未违反 §8.1 / §8.2」，则不得合入。**

### 8.4 CI 单视图：`execution_os.verdict@v1`

- **Schema id:** `agent.execution_os.verdict@v1`
- **含义：** 将同条 `ci:execution-os-stability` 中 **governance 重算 +（已由 jest 证明的）trace / replay** 压成 **一条人类可读 JSON**；**无分支逻辑**，不替代 jest。
- **`mode`：** 本脚本链的契约侧写为 **`cid-aware`**（与默认生产语义对齐）；`legacy` 仅用于显式工程场景，不由 CI 脚本伪造。

### 8.5 CID 轴闭合

- 代码锚：`CID_AXIS_STABILITY_LOCK === true`（`execution-os-change-impact-descriptor.v1.ts`）。
- **任何**对 v1 CID **形状或指纹材料**的演化，必须 **bump `CID_AXIS_VERSION`** 并配套迁移与 SSC 更新；禁止「silent v1.1」。

### 8.6 Stability observability（连续时间态，只读）

**目标：** 在 **零 runtime 改动、零 enforcement 改动、零新 execution descriptor** 的前提下，把 verdict 压成可累积的 **时间序列**（本地 / CI 工作区 `artifacts/`，默认 gitignore）。

| 机制 | 路径 / 命令 | 说明 |
|------|-------------|------|
| Append-only 快照 | `artifacts/execution_os/stability_snapshots_v1.ndjson` | `npm run ci:execution-os-stability` 在 jest 通过后、打印 verdict **之前** 追加 **一行 NDJSON**（`format_version: 1` + `verdict` + 可选 `GITHUB_*` 关联字段）。追加失败 **不 fail CI**（`stderr` warn）。 |
| 趋势汇总（人类可读） | `npm run obs:execution-os-stability:trend` | 读取尾部窗口（默认最近 50 行，`EXEC_OS_STABILITY_TREND_WINDOW` 可调），输出 `agent.execution_os.stability_trend_summary@v1` JSON：`pass_rate`、`governance_match_rate`、`replay_safe_rate`。**非门禁**。 |
| 实现 | `scripts/ci/execution-os-stability-verdict.lib.ts`、`append-execution-os-stability-snapshot-v1.ts`、`summarize-execution-os-stability-trend-v1.ts` | 纯 CI 侧脚本；不导入 Nest 运行时。 |

**边界：** 不记录 per-request `legacy` 比率（需生产 metrics 管道）；**CID manifest** 健康度仍以 `npm run ci:cid-v1` 为准，本层不替代。
