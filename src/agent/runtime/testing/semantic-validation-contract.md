# Semantic Validation Contract

**Scope:** `validateSemanticExecutionGraph` / `assertSemanticExecutionGraph`（见 `semantic-execution-graph-validation.facade.ts`）的**输出形态与演进约束**。本文档为 **ABI**；实现须与之对齐；变更须 bump 文档版本并附 migration note。

**Document revision:** `2026-05-11x`

---

## 1. 输出结构契约（SemanticValidationResult v1）

调用方与 CI **只应依赖**以下顶层字段；未列字段视为实现细节，不得作为稳定 ABI 依赖。

| 字段 | 类型 | 语义 |
|------|------|------|
| `schemaId` | **常量** | `semantic.validation.result@v1`（见 `semantic-validation-result-schema.ts`）。**版本化 API 标识**；变更输出形状须 bump `version` 与/或 `schemaId`。 |
| `version` | **常量** `1` | 与 `schemaId` 配套的数值版本。 |
| `executionModelVersion` | **常量** `v1` | 语义执行图**模型身份**（与单条事件的 `schemaAbi` 不同）；图结构/角色 fixture 演进时 bump，并与 regression 输出对齐。 |
| `modelSnapshot` | `SemanticModelSnapshotDescriptor` | 模型快照描述符（§10）：`executionModelVersion` / `schemaId` / `contractRevision` / `fingerprint`；**不含**事件载荷。 |
| `ok` | `boolean` | **唯一**聚合成功语义：`topology.ok && completeness.ok`。任一切片为 `false` 则 `ok === false`。 |
| `mode` | `'strict' \| 'explained'` | 调用时传入或默认 `'strict'`；当前两模式**行为一致**，仅保留扩展位。 |
| `topology` | `SemanticTopologyDiff` | `{ ok: boolean, lines: string[] }`，黄金路径角色/边语义（Expected/Actual 等）。 |
| `completeness` | `SemanticTopologyDiff` | 最小图闭包：悬空 parent、未映射 span 等（见 §7）。 |
| `lines` | `string[]` | **合并视图**，见 §2。 |

`SemanticTopologyDiff` 固定为 `{ ok: boolean; lines: string[] }`，不得删除或改名键。

---

## 2. `lines` 顺序契约（Merged）

**定义：** `lines` **必须**等于 `topology.lines` 与 `completeness.lines` 的**按序拼接**：

1. 先追加 **全部** `topology.lines`（保持 `diffSemanticGoldPathTopology` 内部已保证的确定性顺序）。
2. 再追加 **全部** `completeness.lines`。

**稳定性要求（MUST）：** 在以下条件下，`lines` 字节级语义序列（逐行字符串数组）必须一致：

- 事件 multiset 与语义角色解析结果相同；
- 边关系与 fixture 中 `expected_parent_edges` 语义相同；
- 与 `semantic-replay-golden-path.util` 中已文档化的排序规则相同（角色键字典序、边键排序、`(startedAt, spanId)` tie-break）。

**禁止：** 在未 bump 本契约 revision 的情况下，向 `lines` 插入调试噪声、时间戳、非确定性 ID，或改变上述拼接顺序。

---

## 3. 扩展规则（Extension）

对 `ValidationResult` 或各切片结果的演进 **必须** 满足：

1. **不改变 `ok` 的判定语义**：`ok === false` 仍仅表示「拓扑或完备性任一未通过」；不得用 `explained` 等模式把「仅提示」算进 `ok === false`，除非契约 revision 明确写明。
2. **不改变 `lines` 的排序与拼接规则**：新增切片时，合并顺序须在本文档中显式修订（新版本段落），不得隐式 prepend。
3. **不改变 `topology` / `completeness` 的 identity**：二者保持 `SemanticTopologyDiff` 形状；新增顶层字段须在本文档登记，且默认为可选、不影响既有 CI 对 `ok` + `lines` 的读取。

`explained` 模式：若未来增加**非失败**诊断信息，**必须**以不违反 §2 的方式承载（例如独立字段或文档约定的后缀切片），且默认不得使 `ok` 与 `strict` 分歧，除非修订本契约并 bump revision。

---

## 4. 与实现文件的对应关系

| 契约概念 | 实现位置 |
|----------|----------|
| 拓扑 diff + completeness | `semantic-replay-golden-path.util.ts` |
| Facade + contract guard | `semantic-execution-graph-validation.facade.ts` |
| 结果 schema / executionModelVersion / `NormalizedSemanticTimelineEvents` | `semantic-validation-result-schema.ts` |
| 漂移事件类型 / 发射 | `semantic-contract-drift.types.ts`, `semantic-contract-drift.emitter.ts` |
| 对外 Service / Module | `semantic-validation.service.ts`, `semantic-validation.module.ts` |
| 语义回归 compare | `semantic-regression.compare.ts` |
| 模型快照描述符 | `semantic-model-snapshot-descriptor.ts` |
| 快照台账（治理最小闭环） | `semantic-model-snapshot-ledger.ts` |
| 执行模型版本兼容 / 导入策略 | `semantic-model-version-compatibility.ts` |
| 运行时执行模型版本选择 | `semantic-execution-model-version-selector.ts` |
| route_and_run 入口执行模型路由器 | `src/agent/runtime/execution-model-runtime-router.ts` |
| 编排执行轨迹正式切片 v1 | `src/agent/contracts/orchestration-execution-trace-v1.types.ts` |
| trace → replay 轮廓与再入 | `src/agent/contracts/orchestration-replay-from-trace.ts` |
| 确定性回放内核 | `src/agent/contracts/replay-execution-kernel.ts` |
| 纯函数回放核 v1 / 等价断言 | `src/agent/contracts/replay-kernel-v1.ts` |
| 语义执行等价判定（boolean，trace-only） | `src/agent/contracts/execution-equivalence-kernel.ts` |
| 语义执行轨迹标准形（canonical） | `src/agent/contracts/execution-normalization-kernel.ts`, `canonical-execution-trace-v1.types.ts` |
| 语义不动点（pair 收敛，trace-only） | `src/agent/contracts/semantic-fixed-point-kernel.ts` |
| 执行模型稳定性谓词（v1） | `src/agent/contracts/execution-model-stability.ts` |
| 契约治理（演进规则总表，非 ABI 正文） | `src/agent/runtime/specs/execution-contract-governance.md` |
| 执行系统治理内核（adjudicate v1） | `src/agent/contracts/execution-system-governance-kernel.ts` |
| ESGK 规范（三层治理 + 不变量） | `src/agent/runtime/specs/execution-system-governance-kernel.md` |
| EGI（人 / AI / runtime 协同与写入门） | `src/agent/runtime/specs/execution-governance-interface.md` |
| ESP（产品化：Editor / Explorer / Console） | `src/agent/runtime/specs/execution-system-productization.md` |
| MVP 平台（三页 + 一链裁剪路径） | `src/agent/runtime/specs/execution-platform-mvp.md` |
| 交付工程计划（里程碑 + 风险 + 交付模式） | `src/agent/runtime/specs/execution-platform-delivery-plan.md` |
| 角色 / 边 fixture | `fixtures/semantic-replay-golden-path/execution_graph_topology.json` |
| 载荷哈希 golden | `fixtures/semantic-replay-golden-path/expected_hashes.json` |

---

## 5. Migration

- **2026-05-11x**：§31 **Delivery Plan**（`execution-platform-delivery-plan.md`）：M1–M4 里程碑、三大风险、**交付控制模式**；**非** 新架构。
- **2026-05-11w**：§30 **MVP**（`execution-platform-mvp.md`）：三页面 + 单主链裁剪、成功标准、**非** 前端实现承诺。
- **2026-05-11v**：§29 **ESP**（`execution-system-productization.md`）：Intent Editor / Execution Explorer / Governance Console 三形态与闭环；**非** MVP 实现。
- **2026-05-11u**：§28 **EGI**（`execution-governance-interface.md`）：人 / AI / runtime 三参与者 + Write/Observe/Replay 通道 + **EGI Gate** 读法；**非** UI 实现。
- **2026-05-11t**：§27 **`ExecutionSystemGovernanceKernel.adjudicateV1`** + ESGK 规范 `execution-system-governance-kernel.md`（三层治理、不变量、**非** runtime）；与 §24–§26 正交补充。
- **2026-05-11s**：§24–§26 **契约治理指针** + **Replay 语义保证** + **`ExecutionModelStability`（`isStableV1` / `isReplaySemanticallyFaithfulV1`）**；演进规则总表见 `execution-contract-governance.md`。
- **2026-05-11r**：§23 **`SemanticFixedPointKernel`**：`isFixedPointCanonical` / `isFixedPointTraces`；**仅**当前 pair 的收敛判定；**无**新状态、**无**未来预测、**无** runtime；§21 v1 委托 `isFixedPointTraces`。
- **2026-05-11q**：§22 **`ExecutionNormalizationKernel.normalizeExecutionTrace`** → `CanonicalExecutionTraceV1`；§21 等价实现收敛为 **normalize → stable JSON 相等**；**禁止** enrich / infer / runtime。
- **2026-05-11p**：§21 **`ExecutionEquivalenceKernel.isSemanticallyEquivalent`**（boolean、忽略 `runtime_hint`、与 §20 正交）；**自 2026-05-11q 起**实现细节以 §22 **normalize → stable JSON** 为准（此前为显式三层 + `executionTimelineInputHash`）。
- **2026-05-11o**：§19–§20 **`ReplayKernelV1`（纯解释器）** + `assertReplayEquivalence`；无 IO / 无 router / 无 validate；与 §18 可注入执行内核正交。
- **2026-05-11n**：§18 **ReplayExecutionKernel** / `replayFromTrace(trace, deps)` → `ReplayExecutionResultV1`；成功路径 `deterministic: true`；**不**在核内再路由、不再跑 import 兼容闸门；快照只读由 `deps` 契约保证。
- **2026-05-11m**：§17 **Replay kernel（v1）**：`buildReplayProfileFromTrace` / `buildReplayFromTrace`、`mergeReplayProfileIntoRouteAndRunRequest`、`replayExecutionFromTrace`；**不**实现分布式快照加载、事件流、多 trace 并行。
- **2026-05-11l**：§16 `OrchestrationExecutionTraceV1`（`traceInfo.execution_trace_v1`）；聚合 router + §10 `model_fingerprint` + `route_decision_path`；移除松散字段 `traceInfo.execution_model_runtime`（仅观测名变更，语义并入正式切片）。
- **2026-05-11k**：§15 `ExecutionModelRuntimeRouter` / `EXECUTION_MODEL_RUNTIME_ROUTER`：`route_and_run` 主链在 dedup 之后执行一次 `select`；`options.execution_model_*` 可选字段；**不**改变 §1 ValidationResult、不修改 ledger / §13 兼容内核。
- **2026-05-11j**：§14 `selectExecutionModelVersion(context)`：运行时版本选择策略与 `importSnapshot` 的 `suggestAllowExecutionModelUpgradeForImport` 建议；**不**引入多内核路由实现、仍**不**改变 §1 ABI。
- **2026-05-11i**：§13 **版本感知导入**：`importSnapshot(payload, { allowExecutionModelUpgrade? })`；`EXECUTION_MODEL_VERSION_LINEAGE` + `EXECUTION_MODEL_UPGRADE_ALLOWLIST`；受控升级成功时 `listLatest` 可含 `importCheckpoint`；仍**不**改变 §1 `SemanticValidationResult` ABI。
- **2026-05-11h**：§12 Ledger **export / import** 序列化契约（`SemanticModelSnapshotLedgerExportV1`）；`listLatest` 摘要行含 `schemaId` 与 `mode`；仍**不**改变 §1 `SemanticValidationResult` ABI。
- **2026-05-11g**：§11 `SemanticModelSnapshotLedger`（`register` / `compareById` / `listLatest`）；进程内治理最小闭环，**不**改变 §1 `SemanticValidationResult` ABI。
- **2026-05-11f**：`modelSnapshot`（`SemanticModelSnapshotDescriptor`）；确定性 `fingerprint`（sha256 hex，见 §10）；`compareSemanticRegression` 同构字段。
- **2026-05-11e**：`executionModelVersion`；`compareSemanticRegression` + `SemanticValidationService.compare`；§9 纯输入边界与回归层说明。
- **2026-05-11d**：新增 §8；`SemanticValidationService` / `SemanticValidationModule` 作为对外稳定消费入口。
- **2026-05-11c**：`ValidationResult` 增加 `schemaId` / `version`；completeness 实装最小检查；contract guard 改为 **JSON 单行** `SemanticContractDriftEvent`（见 §6）。
- **2026-05-11b**：新增 §6（runtime contract guard：仅 Logger warn，不 fail CI）。
- 修订本契约时：更新文首 **Document revision**，在本节追加 **Migration** 条目。

---

## 6. Runtime contract guard（非失败、非 CI）

**目的：** 在运行路径上保留对契约的**意识**；**不**替代 CI，**不**改变返回值语义。

**行为（MUST NOT 失败）：** 若检测到与 §1–§2 不一致的实现，输出 **warn**，且每条 warn 的 message 为 **单行 JSON**，反序列化后为 `SemanticContractDriftEvent`：

| 字段 | 说明 |
|------|------|
| `type` | 固定 `semantic_contract_drift` |
| `category` | `mode_mismatch` \| `lines_mismatch` \| `topology_mismatch`（**非** taxonomy；`topology_mismatch` 表示 **聚合结果与切片一致性** 被破坏，例如 `ok !== topology.ok && completeness.ok`） |
| `message` | 人类可读短说明 |
| `context` | 可选；含 `facadeStage`（如 `validateSemanticExecutionGraph.contract_guard`）及 `role` / `spanId` 等 |

**明确不做：** 不 throw、不将上述情况映射为 `ok: false`、不把 `category` 扩展为漂移类型学。

---

## 7. Completeness 切片（最小图闭包）

**职责边界：** 与 topology 的「黄金边 Expected/Actual」**互补**，**不重复**缺 role 的 Drift 行（缺 role 仍由 `diffSemanticGoldPathTopology` 报告）。

**当前检查（MUST 稳定、可解释）：**

1. **Dangling parent**：存在 `parentSpanId != null` 且该 id **不属于** 当前事件列表中任一 `spanId`。
2. **Unmapped span**：`eventType === 'span'` 且 **不匹配** fixture 中任一 `semantic_roles` 的 `match_any` 指纹。

**输出：** `Completeness: …` 前缀行；排序与实现内 `compareEventTemporal` / `spanId` 字典序一致，保证确定性。

---

## 8. 消费契约（对外 API）

**推荐：** 应用与集成测试通过 **`SemanticValidationModule` / `SemanticValidationService`** 消费语义校验（`validate(events, { mode? })` → `SemanticValidationResultV1`）；双快照对比使用 **`compare(eventsLeft, eventsRight, { mode? })`**。  
**等价：** 直接调用 `validateSemanticExecutionGraph` / `compareSemanticRegression` 仅保留给同目录单测或零依赖脚本；新代码优先 **Service** 以锁定「稳定入口」。

---

## 9. 纯输入边界与语义回归层（v1）

**纯函数边界（MUST）：** `validateSemanticExecutionGraph` / `compareSemanticRegression` / `SemanticValidationService` **只接受** `NormalizedSemanticTimelineEvents`（即 `ExecutionTimelineEvent[]`）。**禁止**传入 request、ALS store、未序列化的 runtime span 句柄等；调用方须在边界外完成 **归一化**。

**回归 compare（v1）：** `compareSemanticRegression(left, right, mode?)` 输出包含：

- `modelSnapshot`：与 `validate` 输出同构（§10）；左右两侧共用同一模型身份锚。
- `topologyDrift` / `completenessDelta`：两侧 `SemanticTopologyDiff` 原样并列（**非** AI 裁决、**无** taxonomy）。
- `contractSliceDiff`：`okLeft`/`okRight` 与合并 `lines` 的**对称差**（字典序稳定）。
- `driftEventStreamDiff`：当前恒为 **空数组**（不采集 Logger JSON）；占位供未来 replay 管道，**不改变** v1 字段形状。

**禁止：** 在 v1 上扩展 drift taxonomy、解释模式、或向 `driftEventStreamDiff` 塞非确定性日志而未 bump 契约。

---

## 10. Model Snapshot Descriptor（语义模型身份锚）

**目的：** 为 `compare(A, B)` 提供**可比较的模型状态**（非事件 multiset）：回归基线锚、CI 版本门控、未来 replay 与模型漂移边界。

**形状（MUST）：**

| 字段 | 说明 |
|------|------|
| `executionModelVersion` | 与 §1 `executionModelVersion` 同常量。 |
| `schemaId` | 与 §1 `schemaId` 同常量。 |
| `contractRevision` | 与文首 **Document revision** 对齐的源码常量 `SEMANTIC_VALIDATION_CONTRACT_REVISION`（`semantic-validation-result-schema.ts`）。 |
| `fingerprint` | **64 字符**小写十六进制 sha256；对以下对象经 `executionTimelineInputHash` 同款 canonical JSON（键字典序递归排序）后哈希：`contractRevision`、`executionModelVersion`、`schemaId`、`topologyFixturesRevision`（`execution_graph_topology.json` 的 `fixtures_revision`）、`validationResultVersion`（§1 `version`）。**不得**将事件列表纳入指纹。 |

**稳定性：** 变更契约 revision、结果 `version`、或 topology fixture 的 `fixtures_revision` 时，**必须** bump 相应常量/文件并预期 `fingerprint` 变化；CI 可对期望指纹做硬断言以实现门控。

---

## 11. Snapshot Ledger（模型实例台账，v1）

**定位：** 将 `modelSnapshot` 从返回值上的**值对象**提升为可 `register` / 按 id **索引**的**台账实体**；进程内 `Map` + §12 **JSON 导出**作为跨 runtime 边界，**不**内置 DB 驱动。**不**扩展 drift taxonomy、**不**新增 runtime hook、**不**改变 §1–§2 校验语义。

**实现：** `SemanticModelSnapshotLedger`（`semantic-model-snapshot-ledger.ts`），进程内 `Map`：

| 方法 | 行为 |
|------|------|
| `register(events, { mode? })` | 对 `events` 调用 `validateSemanticExecutionGraph`；持久化 `id`（UUID）、完整 `modelSnapshot`、`mode`、`registeredAtMs`、以及**完整** `events` 供对比。 |
| `compareById(aId, bId, mode?)` | 取出两侧 `events`，委托 `compareSemanticRegression`；compare 输出形状仍遵守 §9。 |
| `listLatest(maxCount?)` | 按 `registeredAtMs` **降序**返回摘要行（**不含** `events`）；行含 `schemaId` / `mode` 与 §10 身份字段；受控升级导入成功时可含 `importCheckpoint`（§13）。 |
| `exportSnapshot(id)` | 返回 §12 `SemanticModelSnapshotLedgerExportV1`（可 `JSON.stringify`）。 |
| `importSnapshot(payload, { allowExecutionModelUpgrade? })` | 解析 §12 载荷；`validate` 后默认 **指纹须与当前进程一致**；`allowExecutionModelUpgrade: true` 时适用 §13 受控升级；`id` 冲突抛错。 |

**明确不做：** Redis / PG 等存储驱动、Nest 全局注入、多进程一致性、版本谱系图、自动 migration；仅提供**可序列化边界**（§12）。出现 DB / 控制面需求时须新契约 revision 与独立模块。

---

## 12. Ledger Export / Import（跨 runtime 边界，v1）

**格式 token（MUST）：** `semantic.model.snapshot.ledger.export@v1`（源码常量 `SEMANTIC_LEDGER_EXPORT_FORMAT`）。

**载荷形状 `SemanticModelSnapshotLedgerExportV1`：**

| 字段 | 说明 |
|------|------|
| `format` | 上表固定 token。 |
| `id` | 导出时的 snapshot UUID；`importSnapshot` 恢复时 **保留** 该 `id`。 |
| `registeredAtMs` | 导出时的注册时间戳（有限数字）；导入后写回台账。 |
| `mode` | `'strict' \| 'explained'`；与 `register` 时一致。 |
| `modelSnapshot` | §10 描述符完整四元组；默认导入须与当前 `validate` 的 `fingerprint` **逐字相等**；§13 受控升级例外。 |
| `events` | `NormalizedSemanticTimelineEvents`（JSON 数组）。 |

**辅助：** `parseLedgerExportV1(unknown)`（结构校验）、`serializeLedgerExportV1` / `deserializeLedgerExportV1`（`JSON.stringify` / `JSON.parse` 薄封装；`parse` 失败由调用方处理）。

**稳定性：** 变更本载荷形状须 bump `format` token 与契约 revision；不得向 §1 ValidationResult 注入本载荷字段。

---

## 13. Model import compatibility & migration checkpoint（v1）

**目的：** 在**不**引入 DB / 全局注入 / drift taxonomy 的前提下，将导入从「仅严格指纹相等」扩展为**显式可选**的**版本感知**受控升级。

**源码：** `semantic-model-version-compatibility.ts`（`evaluateLedgerImportModelCompatibility` / `formatLedgerImportCompatibilityFailure`）。

**谱系（MUST）：** `EXECUTION_MODEL_VERSION_LINEAGE` 为已发布 `executionModelVersion` 的**严格追加序**（越后越新）。

**升级 allowlist（MUST）：** `EXECUTION_MODEL_UPGRADE_ALLOWLIST`：`Record<fromVersion, toVersion[]>`。仅当 `toVersion` 出现在 `fromVersion` 对应数组中时才允许该有向升级边。

**默认导入（`allowExecutionModelUpgrade` 未传或为 `false`）：** 与 §12 原语义一致——`exported.fingerprint === current.fingerprint`。

**受控升级（`allowExecutionModelUpgrade === true` 且指纹不等）：**

1. `exported` 与 `current` 的 `executionModelVersion` 均须在谱系中；否则拒绝。
2. **降级拒绝：** 若导出侧版本在谱系中**新于**当前 runtime（例如 v2 快照导入 v1 内核），拒绝。
3. **同版本指纹漂移拒绝：** 谱系秩相同但指纹不同 → 拒绝（须 bump 契约/指纹材料或走显式迁移模块，不在此隐式放行）。
4. **升级边：** 仅当 `upgradeAllowlist[exported.executionModelVersion]` 包含 `current.executionModelVersion` 时允许；台账条目以 **当前** `validate` 产出的 `modelSnapshot` 为真值，并写入可选 **`importCheckpoint`**：`fromFingerprint` / `fromExecutionModelVersion` / `fromContractRevision`（导出侧审计锚）。

**Ledger 构造：** 可选注入 `ExecutionModelCompatibilityContext`（单测 / 高级脚本）；默认 `DEFAULT_EXECUTION_MODEL_COMPATIBILITY_CONTEXT`（当前仅 `v1`，allowlist 为空 → 与默认严格指纹等价）。

**明确不做：** 自动 migration 图、多版本 replay 内核、语义 rollback；出现需求须新 revision 与独立模块。

---

## 14. Runtime execution model version selection（v1）

**目的：** 将「导入时兼容」延伸为**执行前**可查询的**版本路由意图**（replay / A·B / 渐进发布），仍不实现多套并行校验内核。

**源码：** `semantic-execution-model-version-selector.ts`。

**API：** `selectExecutionModelVersion(context, { hostExecutionModelVersion?, compatibility? })` → `ExecutionModelVersionSelection`。

| 结果 | 语义 |
|------|------|
| `ok: true`, `basis: 'host_default'` | 未提供 `requestedExecutionModelVersion`；`active` = 宿主 `EXECUTION_MODEL_VERSION`（或注入的 `hostExecutionModelVersion`）。 |
| `ok: true`, `basis: 'requested_aligned'` | 请求版本与宿主谱系秩相同；`suggestAllowExecutionModelUpgradeForImport === false`。 |
| `ok: true`, `basis: 'requested_behind_host'` | 请求版本**旧于**宿主；`suggestAllowExecutionModelUpgradeForImport` 当且仅当 §13 allowlist 存在 `requested → host` 边时为 `true`（供组合 `importSnapshot(..., { allowExecutionModelUpgrade })`）。 |
| `ok: false`, `requested_newer_than_host` | 请求版本在谱系中**新于**宿主（无法在旧内核上「执行」新模型意图）。 |
| `ok: false`, `unknown_requested_version` | 请求或宿主版本不在注入的 `compatibility.versionLineage` 中。 |

**明确不做：** 在 v1 选择器内切换不同 `validateSemanticExecutionGraph` 实现、DB 持久化路由表、Nest 全局注入、CI 强制策略；多内核 **runtime routing** 须未来 revision 与独立模块。

---

## 15. Runtime execution model router（`route_and_run` 入口，v1）

**目的：** 在**执行编排前**解析「本请求应以何种语义执行模型身份运行」的**决策记录**；与 §14 选择器组合，**不**派发多套校验内核。

**实现：** `src/agent/runtime/execution-model-runtime-router.ts`；**挂载点（唯一）：** `runRouteAndRunMainChain`（`execution-gateway.route-and-run.orchestration.ts`）在 **dedup 早退之后**、规划/trip 校验之前调用 `EXECUTION_MODEL_RUNTIME_ROUTER.select(...)`。

**输入（`ExecutionModelRuntimeRouterInput`）：**

| 字段 | 说明 |
|------|------|
| `snapshotId` | 当前冻结 memory 的 `snapshotId`（路由 hint / 观测；v1 不参与判定）。 |
| `executionModelVersion` | 可选；`request.options.execution_model_version`。 |
| `allowUpgrade` | 可选；`request.options.execution_model_allow_upgrade === true`。 |
| `runtimeHint` | 可选；`request.options.execution_model_runtime_hint`（观测回显；v1 不参与判定）。 |

**输出（`ExecutionModelRuntimeRouterResult`）：** `selectedExecutionModelVersion` + `reason`：`exact_match` \| `upgrade_allowed` \| `fallback`（与 §14 语义对齐；拒绝或无法升级时**回落宿主** `EXECUTION_MODEL_VERSION`）。

**观测：** 见 §16 `traceInfo.execution_trace_v1`（正式契约）；§15 路由器仍负责 `select` 决策。

**明确不做：** 并行多模型执行、A/B 执行分流、策略引擎、ML 路由、向 §1 注入新字段。

---

## 16. Orchestration execution trace v1（`traceInfo.execution_trace_v1`）

**目的：** 将 runtime router 与路由事实从**松散 debug 字段**提升为**可 replay 索引的正式 ABI 切片**（仍嵌在既有 `traceInfo` 内，不替代 ETK `ExecutionTrace`）。

**源码：** `orchestration-execution-trace-v1.types.ts`；构造器 `buildOrchestrationExecutionTraceV1`。

**挂载点：** `runRouteAndRunMainChain` 构建 `traceInfo` 时写入 `execution_trace_v1`（在 `routePolicy` / `signals` 就绪之后，与 `route_decision` 同源）。

| 字段 | 说明 |
|------|------|
| `schemaId` | 常量 `agent.orchestration.execution_trace@v1`。 |
| `version` | 数值 `1`。 |
| `snapshot_id` | 当前冻结 memory 的 `snapshotId`。 |
| `model_fingerprint` | 宿主 `buildSemanticModelSnapshotDescriptor().fingerprint`（与 §10 一致）。 |
| `selected_execution_model_version` | §15 路由器输出。 |
| `selection_reason` | `exact_match` \| `upgrade_allowed` \| `fallback`。 |
| `runtime_hint` | `options.execution_model_runtime_hint` 或 `null`。 |
| `route_decision_path` | `task_type`、`route_policy_resolved`（编排 `decision.mode`）、可选 `intent_mode_*`。 |

**稳定性：** 变更形状须 bump `version` 与/或 `schemaId` 并修订本节；不得向 §1 ValidationResult 注入本切片。

**明确不做：** trace diff 引擎、谱系图、shadow 执行、CI 强制；出现需求须新 revision。

---

## 17. Orchestration replay from trace（v1）

**目的：** 将 §16 trace 从**观测事实**提升为**可驱动再入 `route_and_run` 的输入**（确定性 options 覆盖）；**不**替代 ETK、不内置 DB / 流式采集。

**源码：** `orchestration-replay-from-trace.ts`。

| API | 行为 |
|-----|------|
| `buildReplayProfileFromTrace(trace)`（别名 `buildReplayFromTrace`） | 纯函数：生成 `OrchestrationReplayProfileV1`（`schemaId` + `options_overlay` + `snapshot_id` + 嵌入 `source_trace`）。 |
| `mergeReplayProfileIntoRouteAndRunRequest(base, profile)` | 浅合并 `profile.options_overlay` 至 `base.options`（不修改入参对象）。 |
| `replayExecutionFromTrace(baseRequest, trace, runner)` | `merge` 后调用注入的 `runner(mergedRequest)`（生产可传 `gateway.runRouteAndRun`）。 |

**`options_overlay`（v1）：** 由 `route_policy_resolved` 映射 `use_claude_orchestration` / `use_state_machine_orchestration`（`CLAUDE_SM` \| `CLAUDE_DYNAMIC` \| `LEGACY`）；`intent_mode` 仅当 `intent_mode_resolved` 为合法 `IntentMode` 时写入；执行模型字段来自 trace。

**快照恢复：** v1 **不**实现存储加载；调用方须在构造 `baseRequest` 前完成与 `trace.snapshot_id` 对齐的 memory / 请求绑定（若需要）；`profile.snapshot_id` 仅作审计对齐键。

**明确不做：** 多 trace 版本并行、taxonomy、ML 路由、分布式 trace 收集、确定性 diff 引擎；出现需求须新 revision。

---

## 18. Replay execution kernel（确定性回放，v1）

**目的：** 将 §16 trace 视为**可执行种子**，闭合 **execution → trace → replay → execution**；与 §17「轮廓 + 合并」衔接，由本层串联 **rehydrate（deps）→ 固定路由合并 → 执行**。

**源码：** `replay-execution-kernel.ts`。

| API | 行为 |
|-----|------|
| `ReplayExecutionKernel` / `replayFromTrace(trace, deps)` | 校验 trace schema；`deps.loadBaseRequestForReplay(snapshot_id)`；`mergeReplayProfileIntoRouteAndRunRequest`；`deps.executeReplay(merged)`；组装 `ReplayExecutionResultV1`。 |

**成功结果 `ReplayExecutionResultV1`（`deterministic: true`）：** `snapshot_id`、`model_version`、`model_fingerprint`、`selected_route`、`selection_reason`、`execution_outcome`（`result_status` + `request_id`）、`schemaId` / `version`。

**失败结果（`deterministic: false`）：** `failure_reason`：`trace_invalid` \| `snapshot_not_found` \| `execution_threw`。

**三条铁律（MUST，由 `deps.executeReplay` 实现侧遵守）：**

1. **不得再跑** §15 runtime router（路由已由 trace 固定）。  
2. **不得再跑** §13 import 兼容闸门（replay 不是 runtime admission）。  
3. **不得 mutate** 持久化快照（只读 rehydrate；写操作须另开 revision）。

**明确不做：** 分布式/并行 replay、概率回放、ML 路由、事件流 replay、trace merge、与 §1 ValidationResult 混写。

---

## 19. Replay kernel v1（纯函数解释器）

**目的：** 将 replay 从「可调用能力」收敛为**同构结构计算**：`trace` → `ExecutionModelInstance` + `ReconstructedDecisionContext` → 确定性 `simulation`（**非** Nest 主链、**非** LLM）。

**源码：** `replay-kernel-v1.ts`；命名空间 **`ReplayKernelV1`**（`replayFromTrace` 等）。

| 阶段 | API | 约束 |
|------|-----|------|
| Model Reconstruction | `reconstructExecutionModelInstance` | 仅 trace 字段；**禁止** IO / ledger / router / validate。 |
| Decision Reconstruction | `reconstructDecisionContext` | 冻结 `route_decision_path` 与 `selection_reason`；**禁止** 再 select。 |
| Deterministic simulation | `simulateDeterministicReplay` / `runMainChainPure` | 仅 `executionTimelineInputHash` 闭包；**禁止** runtime router、兼容闸门、运行时状态依赖。 |
| 入口 | `replayKernelV1FromTrace` / `ReplayKernelV1.replayFromTrace` | 返回 `ReplayKernelV1Result`（`ok` 判别 + `simulation`）。 |

**与 §18 关系：** §18 负责「**可注入**再跑系统」；§19 负责「**纯**结构解释」——二者不可混为一谈。

**明确不做：** 分布式 replay、概率路径、启发式、validate-as-replay、对 §1 的写回。

---

## 20. Replay equivalence assertion（v1）

**目的：** 在**无运行时噪声**前提下比较两次执行的 **trace 结构是否等价**（代数闭包入口的极小切片）。

**API：** `assertReplayEquivalence(traceA, traceB)` → `ReplayEquivalenceV1`（`equivalent` + `mismatches[]`）。

**比较键（v1）：** `schemaId` / `version` / `snapshot_id` / `model_fingerprint` / `selected_execution_model_version` / `selection_reason` / `runtime_hint` / `route_decision_path` 全字段。

**与 §21 关系：** §20 为**字节级结构对齐**（含 `runtime_hint`）并返回 `mismatches`；§21 为**语义执行等价类**（`boolean`、**忽略** `runtime_hint`）。二者不可混用名称「等价」而不指明 revision。

**明确不做：** 拓扑 diff 引擎、执行 diff 代数、概率 / 模糊等价、ML 对齐；**boolean 等价类**见 §21；出现需求须新 revision。

---

## 21. Execution equivalence kernel（v1）

**目的：** 回答 **trace A ≡ trace B ?**（同一**语义执行等价类**），而非 drift taxonomy；**仅** trace 上可计算；**禁止** runtime 状态、存储、router、validate、LLM。

**源码：** `execution-equivalence-kernel.ts`；API **`ExecutionEquivalenceKernel.isSemanticallyEquivalent(traceA, traceB): boolean`**。

**实现（v1，与 §22–§23 绑定）：** **`SemanticFixedPointKernel.isFixedPointTraces(a, b)`**（§23）；合法 §16 schema 前提；**不**比较 `runtime_hint`（canonical 中不存在该字段）。

**三条铁律（MUST NOT）：**

1. **不得**输出 drift 类型学或多类分类（仅 `true` / `false`）。  
2. **不得**引入「minor / structural / causal drift」等语义分级。  
3. **不得**依赖运行时参与；输入**仅** `OrchestrationExecutionTraceV1`。

**去噪（trace 形状）：** `stripEquivalenceNoise`（`execution-normalization-kernel.ts` 再导出）仅将 `runtime_hint` 置 `null`；其它噪声字段若未来进入 trace，须在 **§22** `normalizeExecutionTrace` 的投影规则内白名单式剥离或文档 revision 明确。

**明确不做：** drift taxonomy、多 trace 并行、概率等价、模糊匹配、ML diff、分布式 trace 推断、自适应 replay；**标准形定义**见 §22。

---

## 22. Execution normalization kernel（v1）

**目的：** **`trace → normalize(trace) → CanonicalExecutionTraceV1`**，为等价类与确定性比较提供**标准形**；**normalize ≠ enrich**；**禁止** guess / infer 缺失节点、runtime / IO。

**源码：** `execution-normalization-kernel.ts`；类型 **`CanonicalExecutionTraceV1`**（`canonical-execution-trace-v1.types.ts`）；API **`ExecutionNormalizationKernel.normalizeExecutionTrace(trace): CanonicalExecutionTraceV1`**。

**三条铁律（MUST NOT）：**

1. **不得**信息增强（不追加 trace 未承载的语义事实）。  
2. **不得**语义扩展（不推断 intent、不补全 span）。  
3. **不得**依赖 runtime；**仅**纯函数。

**标准形（v1）字段契约：**

| 切片 | 内容 |
|------|------|
| Identity | `snapshot_key`（`snapshot_id` trim）；`model_fingerprint_normalized`（trim + hex 小写）；`selected_execution_model_version`（trim）；并携带 **只读** `source_execution_trace_schema_id` / `source_execution_trace_version`（来自输入，不做升级推断）。 |
| Decision | `selection_reason`（枚举原样）；`route_decision_path` 为固定键对象，`intent_mode_*` 仅 trim，**`undefined` / 空串 → `null`**（可选字段坍缩，非推断）。 |
| Structure | `span_adjacency`：**定长** `[]`（§16 v1 无 span）；未来 trace ABI 含 span 时，本字段为 **按 `(parent, child)` 字典序排序** 的邻接表投影，仍不得 enrich。 |

**稳定编码：** `canonicalExecutionTraceStableJson(c)` = `JSON.stringify(sortKeysDeep(c))`（`execution-timeline-hash.util.ts` 导出之 `sortKeysDeep`）。

**从 trace 剔除：** `runtime_hint`、时间戳、日志、调试元数据——**仅**当 §16 trace 类型**已包含**此类字段时由 normalize 规则剔除；v1 正式切片未载字段则无操作。

**明确不做：** drift taxonomy、概率归一、ML 特征、分布式 trace 合并、启发式路由、runtime 插桩膨胀；quotient space / 代数运算见理论层，**不在**本工程 revision 内实现。

---

## 23. Semantic fixed point kernel（v1）

**目的：** 回答「**当前这一对**执行观测是否已在语义上收敛到同一点？」——**不**引入新状态变量、**不**预测未来稳定性、**不**依赖 runtime；**仅** trace / canonical 上的纯函数。

**源码：** `semantic-fixed-point-kernel.ts`；命名空间 **`SemanticFixedPointKernel`**。

| API | 语义 |
|-----|------|
| `isFixedPointCanonical(normalizedA, normalizedB)` | 两 **`CanonicalExecutionTraceV1`**（§22）的稳定 JSON 是否**字节级一致**（身份 + 路由/选择 + 结构切片均已编码于 canonical）。 |
| `isFixedPointTraces(traceA, traceB)` | 二者须为合法 §16 `schemaId`/`version`；否则 `false`。否则对二者 `normalizeExecutionTrace` 后调用 `isFixedPointCanonical`。 |

**三条铁律（MUST NOT）：**

1. **不得**把 fixed point 实现为「新状态容器」或会话存储。  
2. **不得**基于历史序列外推「将来是否稳定」；**仅**定义在**当前** `(A, B)` 或 `(canonical(A), canonical(B))` 上。  
3. **不得**依赖 runtime、IO、router、validate、LLM。

**与 §21 关系（v1）：** `ExecutionEquivalenceKernel.isSemanticallyEquivalent` **委托** `isFixedPointTraces`；等价类 membership 与 pair 不动点在 v1 **同 extension**。若未来 revision 分离二者，须 bump 本契约并写明差分。

**明确不做：** drift taxonomy、自适应路由、概率执行、ML 推断层、分布式 trace 图演化、runtime 启发式；吸引子 / 相空间理论见理论层，**不在**本 revision 内实现。

---

## 24. Execution contract governance（指针）

**目的：** 把 **trace / replay / regression / normalize / fingerprint** 等 **「谁允许改」** 收束为 **可审计演进规则**。

**正文（宪法层总表）：** `src/agent/runtime/specs/execution-contract-governance.md`（**可扩展 / 冻结 / 必须 bump** 三类规则）。

**与本文关系：** 若 governance 与 **§1–§23** 冲突，**以本文 + `SEMANTIC_VALIDATION_CONTRACT_REVISION` 为准**；governance 修订 **应** PR 说明是否需联动 bump 本契约。

---

## 25. Replay semantic guarantee（v1）

**区分三种「等价」——不可混名：**

| 名称 | 手段 | `runtime_hint` | 用途 |
|------|------|------------------|------|
| **字节结构对齐** | `assertReplayEquivalence`（§20） | **比较** | **审计**、严格对齐 |
| **语义等价类** | `ExecutionEquivalenceKernel.isSemanticallyEquivalent`（§21） | **忽略** | **归约 / 商点** |
| **Replay 语义忠实（v1 API）** | `ExecutionModelStability.isReplaySemanticallyFaithfulV1(original, traceAfterReplay)` | **忽略** | **「replay 后 §16 trace 是否落入原等价类」** |

**确定性（replay 执行核）：** §18 `ReplayExecutionKernel` 成功路径标记 **`deterministic: true`** 表示 **未** 因 trace 非法 / 快照缺失 / 执行抛错而失败 — **不** 单独保证 **`replay(trace)` 产出 trace ≡ 原始 trace`**；**该保证** 须 **显式采集** replay **后的** `OrchestrationExecutionTraceV1`（或等价物）并调用 **§20 或 §21 / §26**。

**强重演 vs 审计：**  
- **审计系统：** 仅要求 **可观测 + 可比较**（§20 / §21 足够）。  
- **可重演系统（语义）：** 额外要求 **`isReplaySemanticallyFaithfulV1(original, traceAfterReplay)`** 为真（**及** §17 记忆与 `snapshot_id` 对齐）。  
- **可重演系统（字节级）：** 另需 **`assertReplayEquivalence`** 等价（**含** `runtime_hint`）。

**Drift：** **不** 在 replay 核内引入 **taxonomy**；**漂移** 由 **比较 API** 显式给出（§20 `mismatches`）或 **boolean**（§21）。

**明确不做：** 核内自动二次 `route_and_run` 以「纠偏」trace、概率 replay、无观测即断言等价。

---

## 26. Execution model stability predicate（v1）

**目的：** 提供 **单一入口式** 的 **稳定性** 谓词（**组合** schema 与 **可选** canonical 钉扎 / replay 忠实）。

**源码：** `execution-model-stability.ts`；**`ExecutionModelStability`**。

| API | 语义 |
|-----|------|
| `isStableV1({ trace, tier, expectedCanonicalStableJson? })` | **`tier === 'admit_schema'`**：合法 §16 schema 即真；**`'pinned_canonical'`**：且 **`stableJson(N(trace))`** 等于 **非空** `expectedCanonicalStableJson`。 |
| `isReplaySemanticallyFaithfulV1(original, traceAfterReplay)` | **`SemanticFixedPointKernel.isFixedPointTraces`**（§23），即 **replay 后 trace 与原始 **语义** 同商类**。 |

**弱全局稳定性（叙事）：** 「无 contract drift」跨 **所有** validation 层 — **非** 本 API 单函数职责；**须** 由各层 **显式** 组合调用。

**明确不做：** 在 **未采集** `traceAfterReplay` 时 **伪造** **`replay ≡ original`**；ML 打分式 stability；runtime 注入判定。

---

## 27. Execution System Governance Kernel (ESGK)（v1）

**目的：** 将 **trace / replay / memory / snapshot / model version / router / 等价核 / validation contract** 的 **变更裁决** 收束为 **单一确定性入口**（**非** runtime、**非** compiler）。

**源码：** `execution-system-governance-kernel.ts`；**规范全文：** `execution-system-governance-kernel.md`。

| API | 语义 |
|-----|------|
| **`adjudicateV1(report)`** | 输入 **`GovernanceMutationReportV1`**（**须** 由 CI/人 **预分类**）；输出 **`allow` \| `reject` \| `require_revision`**。 |

**策略（v1）：** 触碰 **语义宪法**（等价 / normalize / canonical 形状 / §25 分层）且 **未** `contractRevisionBumped` → **`reject`**；触碰 **执行政策** 或 **变更控制** 且 **未** bump → **`require_revision`**；否则 **`allow`**。

**与 §24 关系：** §24 / `execution-contract-governance.md` 列 **「什么能变」**；§27 提供 **「这一 PR 是否允许合入」** 的 **机械裁决壳** — **不** 替代人工对 **分类布尔位** 的诚实填充。

**明确不做：** 从 diff **自动** 推断 `touches*`；runtime 内动态改判；per-request 改契约；概率治理。

---

## 28. Execution Governance Interface (EGI)（v1）

**目的：** 定义 **Developer、AI Agent、Runtime** 在 **宪法化执行系统** 下的 **受控协作** 与 **唯一写入门**（**交互层**，**非** 新 runtime 能力）。

**规范全文：** `execution-governance-interface.md`。

**核心：** **Write Path** 上 **Human/AI 的 DSL proposal** **须** 经 **EGI Gate**（**读法** = **§27 ESGK** + validation + compatibility + §26 stability **等** 的组合策略；**具体清单** 以团队流程为准）**后** 方可 **commit**；**AI** **仅为** proposal / interpreter，**不得** 为 control plane；**Runtime** **不得** 自改语义规则。

**明确不做：** Copilot UI、Debugger 产品规格（见 EGI 规范 §11）；**不** 在 runtime 内实现 **动态** governance injection。

---

## 29. Execution System Productization (ESP)（v1）

**目的：** 将 **宪法级执行系统** **产品化** 为 **三件可沟通形态**（**写 / 看 / 管**）及 **闭环**，回答 **可用性、可理解性、可调试性、可信任性** — **非** 新执行内核。

**规范全文：** `execution-system-productization.md`。

**三形态：** **Intent Editor**（意图→DSL→Gate 预览）、**Execution Explorer**（trace / graph / canonical 三层视图）、**Governance Console**（契约登记、变更审查、稳定性面板）。

**明确不做：** 在本契约正文内规定 **信息架构 / MVP 排期**（见 ESP §10）；**不** 将 ESP 与 §1 ValidationResult 字段混写。

---

## 30. Execution Platform MVP（v1）

**目的：** 将 **ESP 三形态** 收敛为 **可上线最小集**：**3 个用户面 + 1 条稳定执行链**（Intent → Execute → Observe → Govern）；**定义** 删减边界与 **三条** 验收标准 — **非** 实现前端或新后端能力。

**规范全文：** `execution-platform-mvp.md`。

**主链：** Intent → DSL（AI）→ **Governance Check（最小 ESGK + CI）** → **`route_and_run`** → **`execution_trace_v1`** → Explorer → Replay/Compare → Console。

**明确不做：** milestone/roadmap 项目管理正文（见 MVP spec §10）；**不** 将 MVP 与 §1 `SemanticValidationResult` 字段混写。

---

## 31. Execution Platform Delivery Plan（v1）

**目的：** 从 **「继续设计系统」** 切换到 **「工业化交付」** — **里程碑**、**风险**、**只做/不做** 清单；**非** 新内核、**非** 新理论层。

**规范全文：** `execution-platform-delivery-plan.md`。

**阶段结论：** **Core Freeze（M1）** 相对当前主线 **视为已完成**；**下一步** = **M2 UI 骨架** → **M3 E2E 闭环** → **M4 稳定性硬化**。

**明确不做：** 在契约正文内维护甘特图或资源排期（见 Delivery Plan §6）。

