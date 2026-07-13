# Road.is 实时链路盘点 Checklist

**Effective:** 2026-07-11  
**Status:** DESIGN REVIEW — 基于真实代码与运行证据  
**Method:** 静态代码盘点 + 已有 harness/evidence；**未在本轮执行 Live Egress Probe**  
**Prerequisite for Live claims:** `scripts/test-road-is-api.ts` 或待建 `road-is-egress-probe.ts` 正式 evidence JSON  

**禁令：** 本文档盘点不触发 Production Canary Road Live Write；不修改 Formal Weather Soak。

---

## 状态图例

| 标记 | 含义 |
|------|------|
| **FEATURE_COMPLETE** | 源码存在，L2/e2e 有覆盖，行为符合 RFC-001 |
| **PARTIAL** | 核心路径存在，缺 Live/Canary/evidence/边界 |
| **PROTOTYPE** | 可运行但依赖 mock/stub/默认关闭 |
| **CONTRACT_ONLY** | 类型/文档/配置存在，无完整运行时链 |
| **NOT_IMPLEMENTED** | 设计有，代码无 |
| **BLOCKED** | 已知阻塞（egress、权限、缺失依赖） |

---

## 链路总览

```
Road.is API
  → Adapter / Realtime Service
  → EvidenceEnvelope
  → EvidenceResolver (ROAD_STATUS_CHANGED)
  → WorldStateAssertion
  → Monitoring (TripMonitoringMvp)
  → [Gap: Trigger Gateway for roads]
  → Causal Trace
  → DecisionProblem SSOT
  → Repair Candidates (Neptune)
  → Constraint Gateway (Abu + Dre)
  → W-01 Apply / W-02 Execute
  → PlanVersion
  → Revalidation
```

---

## 分层盘点

| # | 层 | 状态 | 关键路径 | 说明 |
|---|-----|------|----------|------|
| L1 | **Road.is 外部 API** | **PARTIAL** | `https://api.road.is/api/condition` | API 存在；**无正式 egress evidence**；`scripts/test-road-is-api.ts` 可手动测 |
| L2 | **Adapter — RFC-001 主路径** | **FEATURE_COMPLETE** | `src/skills/world/services/road-status-realtime.service.ts` | `getRoadStatus()`, 15m cache, DB `roadStatusRealtime` |
| L2b | **Adapter — Data Contracts** | **PARTIAL** | `src/data-contracts/adapters/iceland-road-status.adapter.ts` | DATEX + `/api/roadconditions`；**非 RFC-001 主链** |
| L2c | **Adapter — Ontology Provider** | **PROTOTYPE** | `src/infrastructure/external/road-is/road-is-provider.service.ts` | **`ROAD_IS_PROVIDER_MOCK=true` 默认** |
| L3 | **EvidenceEnvelope** | **FEATURE_COMPLETE** | `wrapRoadStatusAsEnvelope()` in `evidence-envelope.mapper.ts` | TTL, confidence, entityRef |
| L4 | **EvidenceResolver** | **FEATURE_COMPLETE** | `evidence-resolver.service.ts` | `fetchAndResolveIfChanged()`, `resolveRoadStatusChanged()` |
| L5 | **WorldStateAssertion** | **FEATURE_COMPLETE** | `road-status-to-assertion.adapter.ts` | `assertionImpliesHardClosure()` — **仅 CLOSED** |
| L6 | **Monitoring** | **PARTIAL** | `trip-monitoring-mvp.service.ts` | `scanAndProcessRoadClosures()` — **直连 runner，不经 Trigger Gateway** |
| L7 | **Trigger Gateway** | **PARTIAL** | `decision-trigger.gateway.service.ts` | Catalog 有 `road-segment-unavailable`；**MVP 未 poll 道路** |
| L8 | **Causal Trace** | **PARTIAL** | `causal-protocol/` + harness | Road close harness 有 trace；**无 prod-canary road evidence** |
| L9 | **DecisionProblem SSOT** | **FEATURE_COMPLETE** | `decision-problem-detector.service.ts`, `rfc001-decision-problem.store.ts` | `FEASIBILITY_FAILURE`, dedupe by triggerEvent |
| L10 | **Repair Candidate** | **PARTIAL** | `neptune-road-repair.adapter.ts`, `is-road-repair-templates.json` | 模板含 +90min 绕行；**fallback stub 仍存在** |
| L11 | **Constraint Gateway** | **FEATURE_COMPLETE** | `abu-road-constraint.adapter.ts`, `dre-road-load.adapter.ts` | Evaluate 已接线 |
| L12 | **W-01 Apply** | **PARTIAL** | `unified-decision-resolution.service.ts` | 天气 prod-canary 已验 W-01；**道路未验** |
| L13 | **W-02 Execute** | **FEATURE_COMPLETE** | `plan-version-apply.executor.ts` | L2 harness `ICE-L2-001` 已覆盖 |
| L14 | **PlanVersion** | **FEATURE_COMPLETE** | `plan-version.service.ts`, `plan-version.store.ts` | PENDING → AUTHORIZED → EFFECTIVE |
| L15 | **Revalidation** | **PARTIAL** | `decision-problem-revalidation.util.ts` | Gateway 有逻辑；**道路 Execute 后无 prod evidence** |

---

## 重点检查（20 项）

| # | 检查项 | 状态 | 证据 / 说明 |
|---|--------|------|-------------|
| 1 | devbox 能否访问 Road.is | **BLOCKED** | devbox + Frankfurt 均无法解析 `api.road.is` |
| 2 | DNS / TCP / TLS / HTTP 分阶段探针 | **PARTIAL** | Frankfurt：`gagnaveita.vegagerdin.is` **PASS**（358KB）；`api.road.is` **FAIL** |
| 3 | Road.is 返回格式 vs Adapter | **PARTIAL** | API: `open\|closed\|limited\|unknown` → `mapRealtimeStatusToChangedStatus()`；DATEX 路径分离 |
| 4 | 真实原始响应持久化 | **NOT_IMPLEMENTED** | 无 `rfc001RoadCollectorRawEvidence`；Vedur 有先例 |
| 5 | fingerprint / TTL / validUntil | **PARTIAL** | TTL + validUntil ✅；**road fingerprint 未实现** |
| 6 | 同路段状态更新去重 | **PARTIAL** | `fetchAndResolveIfChanged` 比对 ACTIVE assertion status；**无 fingerprint 级 dedupe** |
| 7 | CLOSED / RESTRICTED / OPEN 语义 | **PARTIAL** | RFC-001: `CLOSED\|LIMITED\|OPEN\|UNKNOWN`；Problem 对 CLOSED+LIMITED；**RESTRICTED 与 LIMITED 漂移** |
| 8 | 道路恢复解除 INFEASIBILITY | **PARTIAL** | OPEN 不建 problem；**显式 RESOLVED/recovery 路径未完整** |
| 9 | 恢复迟滞 / 连续观测 | **NOT_IMPLEMENTED** | 天气有 calm recovery streak；**道路无等价物** |
| 10 | 路段绑定 Effective Plan | **FEATURE_COMPLETE** | `road-close-impact-analyzer`, `readBindingsFromTripMetadata()` |
| 11 | 默认道路永远 OPEN Stub | **PROTOTYPE** | `getFallbackStatus()` seasonal；`ROAD_IS_PROVIDER_MOCK=true` |
| 12 | Live Monitoring → Trigger Gateway | **NOT_IMPLEMENTED** | 天气走 gateway poll；**道路 MVP 直连 runner** |
| 13 | RFC001 vs ERC 双轨 | **PARTIAL** | RFC-001 canonical；ERC confirm-transaction 独立；**shadow compare 存在** |
| 14 | 绕行候选真实路线 vs Stub | **PARTIAL** | Pack template `route_bypass_ring_road` +90min；**非实时 routing engine** |
| 15 | 绕行 +时长来源 | **FEATURE_COMPLETE** | `is-road-repair-templates.json` → `estimatedAddedDurationMinutes: 90` |
| 16 | POI lastEntryAt / closesAt 统一 Evidence | **CONTRACT_ONLY** | `iceland-poi-official-constraints.util.ts` 存在；**未接入 RFC-001 road pipeline** |
| 17 | 夜间驾驶约束进 Canonical 链 | **CONTRACT_ONLY** | `no-night-drive-conflicts.util.ts`；**Evaluate 未强制接线** |
| 18 | 用户确认只走 W-01 | **PARTIAL** | `effective-plan-write-chain-blocked.util.ts` 已冻结入口；**道路未 prod-canary 验证** |
| 19 | Road Problem 生命周期进 SSOT | **FEATURE_COMPLETE** | `rfc001-decision-problem.store.ts` + unified projection |
| 20 | 队列投影只读 Canonical Problem | **FEATURE_COMPLETE** | `decision-semantics.service.ts` + `unified-decision-problem-projection.util.ts` |

---

## 代码路径速查

### Live 路径（目标）

```
RoadStatusRealtimeService.getRoadStatus(roadId)
  → EvidenceResolverService.fetchAndResolveIfChanged({ tripId, roadId, segmentId })
  → WorldStateStore.appendAssertion
  → RoadSegmentUnavailablePipelineService.runFromResolvedEvidence
  → DecisionProblemDetectorService.detectRoadCloseProblem
  → RoadSegmentUnavailableRunnerService.runFullFromEvent / evaluateAndFinalizeByProblemId
```

### Replay / Simulate 路径（当前可用）

```
POST /internal/rfc001/iceland/road-close/simulate  (admin_injection)
  或
buildRoadStatusChangedEvent({ roadId: 'F208', status: 'CLOSED' })
  → runner.runFullFromEvent()
```

### 禁止作为 Live 验收的路径

```
ROAD_IS_PROVIDER_MOCK=true (默认)
getFallbackStatus() / seasonalFallback
buildRoadCloseStubCandidates() 作为唯一候选
admin_injection 作为 prod-canary sign-off
```

---

## 现有证据与 Harness

| 资产 | 路径 | 覆盖 |
|------|------|------|
| L2 apply chain | `src/trips/guardian-decision-core/e2e/iceland-road-close-l2.spec.ts` | ICE-L2-001, IDEM, RB, PRE |
| PR harness | `iceland-road-close.harness.spec.ts` | Evidence → Problem → Workspace |
| Shadow | `iceland-road-close.shadow.spec.ts` | Legacy vs RFC-001 |
| S3 monitoring | `s3-monitoring-closure.harness.spec.ts` | Monitoring + runner |
| Fixture | `docs/.../07_FIXTURES/iceland-road-closed.json` | REAL-SHAPE 输入 |
| F208 simulate | `scripts/simulate-f208-road-close-fixture.ts` | 端到端 fixture trip |
| **Prod Canary A/B/C** | `prod-canary-*-2026-07-10.json` | **仅天气** — 无 road |
| **Formal soak** | `formal-vedur-soak-2026-07-10.json` | **仅 Vedur** |
| **Road.is egress devbox** | `road-is-egress-devbox-2026-07-10.json` | **NO-GO** — DNS EAI_AGAIN |
| **Road.is egress Frankfurt** | `road-is-egress-de-frankfurt-2026-07-10.json` | **PARTIAL** — `api.road.is` DNS fail；**gagnaveita HTTP 200** |

---

## 输出结论

### 1. 当前道路 Slice 已具备多少生产等价证据？

| 类别 | 完成度 | 说明 |
|------|--------|------|
| **工程实现（RFC-001 后端）** | **~75%** | L2 harness 全链；Feature Complete 标注见上表 |
| **Staging Replay 证据** | **~40%** | Fixture + simulate 脚本存在；**无 formal replay evidence JSON** |
| **Live Road.is 证据** | **~5%** | 仅 ad-hoc `test-road-is-api.ts`；**无 egress probe / soak** |
| **Production Canary 证据** | **0%** | 无 `prod-canary-road-*`；W-01 仅在天气上签字 |

**综合生产等价证据：约 30–35%**（工程 > 证据）。

---

### 2. Replay Harness 能跑到哪一步？

| 步骤 | Harness | 状态 |
|------|---------|------|
| Evidence → Assertion | `iceland-road-close.harness.spec.ts` | ✅ |
| Assertion → Problem | 同上 + detector | ✅ |
| Problem → Evaluate → Candidates | L2 + evaluate service | ✅ |
| Authorize → Execute → Effective | `ICE-L2-001` | ✅ |
| W-01 Gateway + Revalidation | `s4-automation-closure.harness.spec.ts` (mock) | ⚠️ mock gateway |
| Prod-canary A/B/C drill script | — | ❌ 未建 |
| REAL-SHAPE replay on staging trip | `simulate-f208-road-close-fixture.ts` | ⚠️ 需手动跑 evidence |

**结论：Replay Harness 在 Jest/mock 层可跑到 Effective PlanVersion；Gateway W-01 + Revalidation 仅 mock 覆盖；无 automated prod-canary road drill。**

---

### 3. Live Road.is 接入还缺哪些能力？

| # | 缺失能力 | 优先级 |
|---|----------|--------|
| 1 | **Road.is Egress Probe**（DNS/TCP/TLS/HTTP + evidence JSON） | P0 |
| 2 | **Road fingerprint + anti-noise**（对标 Vedur） | P0 |
| 3 | **Raw response persistence**（collector 或 poll audit） | P1 |
| 4 | **Monitoring → Trigger Gateway 对齐**（与 weather 对称） | P1 |
| 5 | **POI 时间窗 Evidence 接入 Evaluate** | P1 |
| 6 | **夜间驾驶约束接入 Evaluate** | P1 |
| 7 | **道路恢复迟滞 / calm-open streak** | P2 |
| 8 | **Live 绕行 ETA**（非 template 固定 +90） | P2 |
| 9 | **Road Source Authority SSOT 文档** | P1 |
| 10 | **Formal 24h road soak**（若 Live 需要） | P2 |

---

### 4. 哪些是 Staging 阻断项？

| 阻断项 | 原因 |
|--------|------|
| 无 Road.is egress PASS evidence | 不知 devbox/Frankfurt 哪条 egress 可达 API |
| 无 `prod-canary-road-*` replay drill | 无法证明 A/B/C 在 staging/prod DB |
| POI 时间窗未进 RFC-001 Evaluate | Slice 2 场景 R5 无法完整验收 |
| `ROAD_IS_PROVIDER_MOCK=true` 默认 | Staging 易误用 mock 作为 live |
| Monitoring 不经 Trigger Gateway | Staging 行为与目标架构不一致 |

---

### 5. 哪些可以复用天气 Slice？

| 复用项 | 来源 |
|--------|------|
| W-01 Apply + write chain 冻结 | `effective-plan-write-chain-blocked.util.ts` |
| Prod Canary A/B/C drill 脚本模式 | `prod-canary-*-2026-07-10.json` 结构 |
| Egress probe 脚本模式 | `vedur-egress-probe.ts` → 待建 road 版 |
| Collector + 反向隧道模式 | **可选** — Road.is 若 devbox 可达则无需 Collector |
| Formal soak 脚本模式 | `prod-canary-formal-vedur-soak-*.ts` |
| Evidence envelope + TTL 模式 | `evidence-envelope.mapper.ts` |
| Anti-noise / fingerprint 模式 | `weather-observation-change.util.ts` |
| Attention / queue dedupe | `decision-queue-admission.util.ts`, `aggregateRowsByInstanceKey()` |
| Canary trip + user IDs | `a0a99999-…`（**soak 结束后切换场景**） |

---

### 6. 哪些模块必须停止扩展或降级为投影？

| 模块 | 动作 |
|------|------|
| `RealtimeRoadStatusService` (www.road.is 旧路径) | **降级** — 不进入 RFC-001 Live 链 |
| `ROAD_IS_PROVIDER_MOCK` ontology path | **仅 dev/test** — 禁止 Canary sign-off |
| `buildRoadCloseStubCandidates()` | **fallback only** — Neptune pack 为空时 |
| `iceland-storm-rerouting-engine.util.ts` | **不扩展** — Legacy Plan B，非 RFC-001 |
| ERC `execution-risk-confirm-*` | **不扩展** — 道路 Slice 走 RFC-001 W-01 |
| GuardianDebate / gate_result 旧串联 | **已废弃** — 仅 shadow compare |
| 第四类通用 Repair | **禁止** — Slice 2 冻结三类 |

---

### 7. Weather Formal Soak 结束后、Road Production Canary 前 — 最少任务

| 顺序 | 任务 | 产出 |
|------|------|------|
| 1 | Formal Weather Soak **PASS** + sign-off | `formal-vedur-soak-check` PASS |
| 2 | **设计评审**通过本文档 + 验收用例 | 签字记录 |
| 3 | 实现 **Road.is Egress Probe** + evidence | `road-is-egress-*.json` |
| 4 | 实现 **road fingerprint** + poll audit | 代码 + unit test |
| 5 | 编写 **`prod-canary-road-close-drill.ts`** | Staging replay A/B/C evidence |
| 6 | **POI 时间窗 Evidence** 最小契约 + Canary POI 覆盖 | 类型 + fixture |
| 7 | 接线 **夜间驾驶** 到 Evaluate（或 Slice 2.1） | harness 扩展 |
| 8 | Monitoring → **Trigger Gateway** 对齐（或 documented exception） | ADR / 代码 |
| 9 | **`ROAD_IS_PROVIDER_MOCK=false`** staging 验证 | staging evidence |
| 10 | Production Canary Road **A → B → C** drill | `prod-canary-road-*-*.json` |
| 11 | （可选）Formal 24h Road soak | 若 Live 而非仅 Replay |

**最少 = 1–6 + 10**（共 9 项）可进入 Production Canary Road drill；7–9 可在 Slice 2.0 与 2.1 间拆分。

---

## 与 Formal Weather Soak 并行安全项

| 安全（现在可做） | 不安全（soak 期间禁止） |
|------------------|-------------------------|
| 本文档 + 验收用例评审 | 改 Vedur collector / 天气阈值 |
| Road.is egress probe 脚本（只读） | Road Live Write 进 prod canary |
| POI 时间窗契约设计 | 新增第四类 Repair |
| 执行偏差信号模型文档 | 修改当前 Canary Trip metadata 语义 |
| Attention Gate shadow 统计（只读） | 切换 weather authority |
| Replay fixture 准备 | `npm run dev` 占 3000 杀 soak |

---

## 附录 A — 状态语义对照表

| Road.is API | RFC-001 Event | Problem? | Hard Closure? |
|-------------|---------------|----------|---------------|
| `closed` | CLOSED | ✅ | ✅ |
| `limited` | LIMITED | ✅ | ❌ (assertion) |
| `open` | OPEN | ❌ | ❌ |
| `unknown` | UNKNOWN | ❌ | ❌ |
| Ontology `RESTRICTED_4WD` | — | ⚠️ 未统一 | — |

---

## 附录 B — 推荐下一步（Soak 并行）

1. 评审 `SLICE-2-ICELAND-ROAD-CLOSE-CANARY-ACCEPTANCE.md`
2. ~~创建 `scripts/road-is-egress-probe.ts`~~ ✅ + `road-is-egress-probe.sh`
3. Frankfurt 重跑 `bash scripts/road-is-egress-probe.sh de-frankfurt` 并 scp evidence
4. 创建 `scripts/prod-canary-road-close-drill.ts`（Replay only）
4. POI 时间窗 Evidence 类型草案
5. Weather soak 签字后执行 Staging Replay

---

**Document owner:** Iceland Canonical / RFC-001  
**Next review:** 设计评审会议 — 天气 Formal Soak 运行期间
