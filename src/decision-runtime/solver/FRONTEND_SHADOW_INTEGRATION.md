# 前端对接说明 — OR-Tools Shadow（ADR-008 / M4-RA-01A）

> **口径（2026-07-15）**  
> 前端现在可对接 **Shadow 观测与对比**；**不需要**等真实 10 条 trip / 产品 APPROVED。  
> **禁止**把 Shadow 当可写回权威；Python `POST /v1/solve` **不对浏览器开放**。

相关：

- [ADR-008](../ADR-008-OR-Tools-Candidate-Provider.md)
- [Planning API](../../trips/arrange-itinerary/ARRANGE_ITINERARY_API.md)
- [AUTHORITY_CANARY](./AUTHORITY_CANARY.md) · [CANARY_ROLLBACK_SOP](./CANARY_ROLLBACK_SOP.md)
- Env：[DECISION_RUNTIME_ENV.md](../DECISION_RUNTIME_ENV.md)

全局前缀：`/api` · 响应信封：`{ success, data?, error? }`

---

## 1. 先探测再渲染

```http
GET /api/decision-engine/v1/ortools-shadow/health
```

- `@Public()`，可未登录探活
- 关键特征字段（读 `data`）：

| 字段 | 前端用法 |
|------|----------|
| `shadowRepairEnabled` | false → 不展示 Shadow 面板 |
| `solverUrlConfigured` | false → 提示后端未挂 sidecar |
| `writeAuthority` | **恒为 false**；UI 文案须写「仅对比 / 非权威」 |
| `canaryStage` | 默认 `shadow`；勿在 UI 暗示已升权威 |
| `authoritativeCanaryFlag` | 生产通常 false |
| `planningOrchestratorShadow` | 声明 `OPTIMIZE_ROUTE` / `AUTO_ARRANGE` 附件字段名 |
| `mvpOperations` | Shadow 支持的 solver ops 列表 |

**建议启动时 / Decision 页进入时拉一次**；可缓存 30–60s。

可选运维面板（不必进主产品路径）：

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/decision-engine/v1/ortools-shadow/metrics?limit=20` | evaluate Shadow 计数；观测关闭时 `BUSINESS_ERROR` |
| GET | `/api/decision-engine/v1/ortools-shadow/planning-lab/compare?limit=20` | Planning lab 对比 rollup |
| GET | `/api/decision-engine/v1/ortools-shadow/authority/gate` | M4 授权清单（只读） |
| GET | `/api/decision-engine/v1/ortools-shadow/canary/dashboard` | Canary 审计看板 |
| GET | `/api/decision-engine/v1/ortools-shadow/lab-signoff/gate` | Lab 策略 gate |

---

## 2. Repair / Evaluate（决策工作台）

### 接口（需 trip 成员）

| Method | Path | Shadow 相关 |
|--------|------|-------------|
| POST | `/api/trips/:tripId/decision-problems/:problemId/evaluate` | 写入 workspace；回包可含附件 |
| GET | `/api/trips/:tripId/decision-problems/:problemId` | **产品路径顶层** `data.ortoolsShadow`（evaluate 之后） |
| GET | `.../decision-problems/:problemId?includeDebug=1` | 另有 `debug.rawCanonical.workspace.ortoolsShadow` |
| POST | `/api/trips/:tripId/decisions/:decisionId/authorize` | 选候选授权；OR-Tools 候选受 canary 硬拦 |
| POST | `/api/trips/:tripId/decisions/:decisionId/execute` | 同上 |

> 新 UI 请走 `/api/trips/...`；内部 `/api/internal/rfc001/...` 为废弃路径。  
> **主 UI 可只读 detail 顶层 `ortoolsShadow`**；不必依赖 `includeDebug`。字段仅在该 problem **已 evaluate 且 sidecar 开启** 时出现。

### 附件：`data.ortoolsShadow`（= `workspace.ortoolsShadow`）

`schemaId: "tripnara.ortools_evaluate_shadow@v1"`

| 字段 | 用途 |
|------|------|
| `shadowAuthority` | **恒 false** — 不可当写权限 |
| `report` | Neptune vs OR-Tools 对比；`writeAttempted: false`，`gatewayRequired: true` |
| `gatewayByCandidateId` | Shadow 候选 Gateway 打分 |
| `shadowRepairCandidates` | 观测候选集（**默认不进** `repairCandidates`） |
| `neptuneCandidateCount` / `shadowCandidateCount` | 数量对比 |
| `evidenceFreshness` | `FRESH` \| `STALE` — **STALE 勿展示为当前解** |
| `discardedStalePrior` | 上一轮因证据漂移被丢弃 |
| `solverOperation` | 如 `REROUTE` / `SWAP` |
| `solverUnavailableReason` | sidecar / 投影失败原因 |
| `canary` | M4 审计（见下） |

### `canary`（只读审计，不是前端开关）

| 字段 | 含义 |
|------|------|
| `canaryStage` | `shadow` \| `selected_trips` \| … |
| `authoritativeProviderId` | Shadow 阶段一般为 `neptune-repair` |
| `whitelistMatched` | 是否命中白名单 |
| `mergedIntoRepairCandidates` | true 仅在完整 canary 链开启时 |
| `mergedCandidateIds` | 若发生 merge，已并入的 id |
| `gateAuthoritativePromotion` | 门禁结论 |

**UI 建议**

1. 左侧 / 主列：`repairCandidates`（权威展示与用户选择）
2. 旁路「OR-Tools Shadow」：只读对比 `shadowRepairCandidates` + Gateway 状态 + lab report
3. `evidenceFreshness === 'STALE'` → 灰显 +「证据已变更，请重新 Evaluate」
4. **不要**让用户勾选 `generatorVersion` 含 `ortools-repair` 去 authorize（Shadow 默认会被 400）

### Authorize / Execute 错误码（前端需映射）

| `error.code` / message 关键字 | 处理 |
|-------------------------------|------|
| `ORTOOLS_CANARY_DISABLED` | 提示：OR-Tools 未开权威 canary，请选 Neptune 候选 |
| `ORTOOLS_NOT_MERGED` | 提示：该候选未并入权威集，请重新 evaluate / 选其他 |
| `ORTOOLS_EVIDENCE_STALE` | 提示：证据漂移，重新 evaluate |

---

## 3. Planning（编排行程）

### 接口（trip 成员）

| Method | Path | Shadow |
|--------|------|--------|
| POST | `/api/trips/:tripId/arrange-itinerary/proposals` | `intent: OPTIMIZE_ROUTE \| AUTO_ARRANGE` 且 Shadow env 开 → **必带** `ortoolsShadow`（求解失败时仍有 stub + `solverUnavailableReason`） |
| GET | `/api/trips/:tripId/arrange-itinerary/proposals/:proposalId` | 读完整草案（含 `ortoolsShadow`） |
| POST | `/api/trips/:tripId/arrange-itinerary/proposals/:proposalId/apply` | **只写** `proposal.changes` |

### Body 示例（创建草案）

```json
{
  "intent": "OPTIMIZE_ROUTE",
  "payload": { "dayIndex": 0 }
}
```

或 `"intent": "AUTO_ARRANGE"`（现有 payload 不变）。

### 附件：`proposal.ortoolsShadow`

`schemaId: "tripnara.ortools_planning_shadow@v1"`

| 字段 | 用途 |
|------|------|
| `shadowAuthority` | **恒 false** |
| `planningIntent` | `OPTIMIZE_ROUTE` \| `AUTO_ARRANGE` |
| `changes` 对照 | 权威改动在 **`proposal.changes`** |
| `shadowChanges` | **仅观测**；禁止当作 apply 输入 |
| `legacyChangeCount` / `shadowChangeCount` | 条数对比 |
| `labCompare` | 顺序一致性 / 路程差（可选展示） |
| `dayIndex` | 本次求解的天 |
| `evidenceFreshness` | 同 evaluate |
| `report` | 同 Repair 对比报告 |

**Apply 硬规则**

```
适用变更 = proposal.changes
禁止     = proposal.ortoolsShadow.shadowChanges
```

服务端 `selectAuthoritativePlanProposalChanges` 已过滤；前端仍应：

- Diff Preview 默认用 `changes` / `diff`
- Shadow 面板可并列展示 `shadowChanges`（标注「对比稿 · 不会写入」）
- 勿把 note 含 `[ortools-shadow]` 的变更塞进自定义 apply payload

---

## 4. TypeScript 类型锚点（前端可对齐）

| 附件 | 定义文件 |
|------|----------|
| Evaluate Shadow | `src/decision-runtime/solver/bridge/ortools-road-evaluate-shadow.bridge.ts` → `OrtToolsEvaluateShadowAttachment` |
| Planning Shadow | `src/decision-runtime/solver/bridge/ortools-planning-orchestrator-shadow.bridge.ts` → `OrtToolsPlanningShadowAttachment` |
| Workspace | `src/trips/guardian-decision-core/contracts/decision-workspace.types.ts` → `ortoolsShadow?` |
| PlanProposal | `src/trips/arrange-itinerary/types/plan-proposal.types.ts` → `ortoolsShadow?` |

建议前端自建薄类型：只 pick UI 需要字段；**锁定** `shadowAuthority: false`、`schemaId` 字面量。

---

## 5. 环境依赖（前端无需配置，需理解）

| 后端 env | 前端现象 |
|----------|----------|
| 未设 `OR_TOOLS_SOLVER_URL` | 无 `ortoolsShadow` |
| `OR_TOOLS_REPAIR_SHADOW` 开 + URL | evaluate / proposals 可出现附件 |
| `OR_TOOLS_AUTHORITATIVE_CANARY=0`（默认） | `canary.mergedIntoRepairCandidates` 为 false |
| `OR_TOOLS_MOVE_DAY_SHADOW` | 默认关；UI 不承诺 MOVE_DAY |

完整 canary（**非本次对接范围**）还需：产品 APPROVED token、白名单 trip、`selected_trips` stage、ops∈{SHIFT,SWAP,SHORTEN,REROUTE}。前端此时仍只读服务端 `canary` 审计字段，**不要做客户端「升权威」开关**。

---

## 6. 前端改动清单（建议 PR 切片）

### 必做（Shadow 可用）

1. **Health 探活**：Decision / Arrange 进入时 `GET .../ortools-shadow/health`
2. **决策空间 detail**：读顶层 `ortoolsShadow`；STALE 灰显 + 旁路对比（evaluate 后才有）
3. **PlanProposal 详情**：`OPTIMIZE_ROUTE` / `AUTO_ARRANGE` 展示 `ortoolsShadow` / `labCompare`
4. **Apply / Authorize**：只绑权威字段；错误码映射上表三条
5. **文案**：统一「OR-Tools Shadow · 非权威 · 不可写回」

### 可选（工程调试 / 内部）

6. Ops：`metrics` / `planning-lab/compare` / `canary/dashboard`（运维页）
7. 进决策空间可对 canonical problem 调一次 `POST .../evaluate` 以生成附件（若尚未 evaluate）
8. `includeDebug=1` 仍可用于深挖 `rawCanonical.workspace`

### 明确不做

- 浏览器直连 sidecar `/v1/solve`
- 用 `shadowChanges` 调 apply
- 把 `solverFeasible` / 有 shadow 候选 = 可执行
- UI 开关「提升 OR-Tools 为权威」

---

## 7. 最小联调顺序

```bash
# 1) 后端 sidecar（例）
export OR_TOOLS_SOLVER_URL=http://127.0.0.1:8091
# Nest 已开 OR_TOOLS_REPAIR_SHADOW（有 URL 时常默认开）

# 2) Health
curl -s "$API/api/decision-engine/v1/ortools-shadow/health" | jq '.data.writeAuthority,.data.shadowRepairEnabled'

# 3) 规划：创建 OPTIMIZE_ROUTE proposal → 看 data.ortoolsShadow
# 4) 决策：evaluate problem → 看 workspace.ortoolsShadow.evidenceFreshness
# 5) apply / authorize 仍走原权威路径，确认行为不变
```

---

## 8. 与旧对接文档差异

| 文档 | 需更新点 |
|------|----------|
| `ARRANGE_ITINERARY_API.md` | proposals 响应增加可选 `ortoolsShadow`；apply 仍只认 `changes` |
| `UNIFIED_DECISION_FRONTEND_INTEGRATION.md` | evaluate workspace 增加 `ortoolsShadow`；authorize 错误码 |
| Decision Inspector | **暂无** ortools 投影；勿当 Shadow 数据源 |

本文为 Shadow 对接 SSOT；报告附录实验 / 权威 canary 前端开关不在范围。
