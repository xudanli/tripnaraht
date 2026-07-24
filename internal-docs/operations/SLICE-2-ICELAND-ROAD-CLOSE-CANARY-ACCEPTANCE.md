# Slice 2 — 冰岛道路关闭 Canary 验收用例

**Effective:** 2026-07-11  
**Status:** DESIGN REVIEW — 待评审（含 Traversability RT-F208 扩展）  
**Scope:** Production Canary 道路关闭 Vertical Slice + **LIMITED 五维可通行性**（T2 drill，T1 接线后执行）  
**Prerequisite:** Formal Weather Soak 签字完成后再进入 Staging Replay / Live Egress / Prod Canary A/B/C；Traversability drill 在 T1 接线后、Road Production GO 前执行。

**相关禁令（本阶段）：** 不修改 Vedur Collector / 天气阈值 / Repair 类型 / 写入权限 / 当前 Canary Trip；Road Stub 不得作为 Live 验收证据。

---

## 0. 目标场景（Canonical Narrative）

用户正在冰岛自驾。当前 **Effective PlanVersion** 中 Day 2 计划经 **F208**（或等效已绑定 `routeSegmentId`）前往高地营地，并在 Day 2 16:00 参加一项有明确 **`lastEntryAt=16:00`** 的景点活动。

Road.is 将 **F208** 标记为 **CLOSED**（真实形状 Evidence，非 admin injection）。

| 后果 | 数值（验收基准） |
|------|------------------|
| 原路线 | **不可继续执行** |
| 可用绕行 | Ring Road 绕行，**+90 分钟** |
| 下一活动 | 新 ETA **17:18**，超过 `lastEntryAt=16:00` 与 `closesAt=18:00` |
| 夜间驾驶 | 绕行后段可能落入 **sunset cutoff** 之后（Atlantic/Reykjavik 日没约束） |
| 系统结论 | 当前计划进入 **INFEASIBILITY**，须生成替代方案 |

**Canary Trip 分层（冻结）：**

| 用途 | Trip ID | 禁令 |
|------|---------|------|
| Weather Formal Soak | `a0a99999-9999-4999-8999-999999999999` | **不得**用于 Road drill |
| Road A/B/C Pre-Signoff + RT-F208 | `b0b88888-8888-4888-8888-888888888888` | **不得**用于 Weather soak |

**建议绑定路段：** `F208` → `routeSegmentId` = `segment:{tripId}:item_drive_f208`（与 `buildItemSegmentId()` 一致）；静态 profile SSOT：`data/destination-packs/is/road/is-road-segment-profiles.json`（`seg-is-f208`）。

---

## 1. 输入条件

### 1.1 Road.is Evidence（真实形状）

| 字段 | 要求 | 代码锚点 |
|------|------|----------|
| `factType` | `ROAD` | `wrapRoadStatusAsEnvelope()` |
| `entityRef.kind` | `ROAD` | `travelEntityRefFromRoadSegment()` |
| `entityRef.id` | 与 Effective Plan 中 `routeSegmentId` / `roadId` 可解析匹配 | `road-close-impact-analyzer` |
| `value.roadId` | `F208`（或 Canary 行程中已建模 F-road） | `RoadStatus.roadId` |
| `value.currentStatus` | `closed` → 映射为 RFC-001 `CLOSED` | `mapRealtimeStatusToChangedStatus()` |
| `source` | `road.is_api` 或 `road.is_api_or_cache`（Live）；Replay 须标注 `REAL-SHAPE-ROAD-REPLAY` | `evidence-resolver.service.ts` |
| `observedAt` | Road.is `last_updated` ISO | EvidenceEnvelope |
| `validUntil` | `observedAt + DEFAULT_STRONG_JUDGMENT_TTL_MS.ROAD` | `evidence-envelope.mapper.ts` |
| `confidence` | Live API: **0.88**；seasonal fallback: **0.6**（不得作为 Live 验收证据） | `computeRoadConfidence()` |
| `fingerprint` | `{source\|roadId\|status\|observedAt}` — **Slice 2 待实现**（天气已有先例） | 对标 `buildWeatherObservationFingerprint()` |

**持久化要求：**

- WorldState：`rfc001WorldState` → ACTIVE assertion `road.status=CLOSED`
- 原始响应：**Slice 2 待实现** Road Collector Raw Record（对标 `rfc001VedurCollectorRawEvidence`）
- Replay fixture：`docs/TripNARA-Execution-Risk-Backend-Package-V1/07_FIXTURES/iceland-road-closed.json`

### 1.2 计划上下文

| 输入 | 说明 |
|------|------|
| `effectivePlanVersionId` | 例如 `plan_v1_*` — Execute 前不得变更 |
| `routeSegmentId` | 绑定至 `trip.metadata.rfc001RoadSegmentBindings` 或 item metadata `roadIds` |
| `affectedPlanItemIds` | 至少含：drive segment item、下一活动 item |
| 下一活动 `startsAt` | 16:00 |
| 下一活动 `lastEntryAt` | 16:00 |
| 下一活动 `closesAt` | 18:00 |
| 绕行路线 | `route_bypass_ring_road` template → `+90 min`（`is-road-repair-templates.json`） |
| 夜间驾驶约束 | `no-night-drive-conflicts.util.ts` — driving cutoff after sunset |
| 成员约束（可选） | 本 Slice 仅记录，不自动推断；可附 `memberState=NEEDS_REST` 用于后续 Slice 4 |

### 1.3 Evidence 引用链

```
evidenceRef: ev_road_{tripId}_{roadId}_{observedAt}
  → ROAD_STATUS_CHANGED event
  → WorldStateAssertion(road.status=CLOSED)
  → Rfc001DecisionProblem.basis
```

---

## 2. 预期因果链

每个节点：**输入事实 → 传播规则 → 输出 Effect → confidence → evidenceRefs → affectedScope → 直接/派生**

### Node R1 — Road CLOSED（外部事实）

| 维度 | 值 |
|------|-----|
| 输入 | Road.is API `status=closed` for F208 |
| 规则 | `RoadStatusRealtimeService.getRoadStatus()` → 标准 `RoadStatus` |
| Effect | `EvidenceEnvelope<RoadStatus>` |
| confidence | 0.88 (live) |
| evidenceRefs | `[ev_road_…]` |
| affectedScope | `ROAD:F208` |
| 影响类型 | **直接** |

### Node R2 — 当前路段不可通行

| 维度 | 值 |
|------|-----|
| 输入 | R1 + `routeSegmentId` 绑定 |
| 规则 | `assertionImpliesHardClosure()` → true when `status=CLOSED` |
| Effect | `WorldStateAssertion { status: CLOSED }` |
| confidence | 继承 R1 |
| evidenceRefs | 同 R1 |
| affectedScope | `segment:{tripId}:item_drive_*` |
| 影响类型 | **直接** |

### Node R3 — 原路线不可执行

| 维度 | 值 |
|------|-----|
| 输入 | R2 + Effective Plan drive item 依赖 F208 |
| 规则 | `RoadCloseImpactAnalyzerService` → `affectedPlanItemIds` 非空 |
| Effect | `FEASIBILITY_FAILURE` 前置条件满足 |
| confidence | 0.92（assertion-bound） |
| evidenceRefs | R1 + snapshotId |
| affectedScope | `[item_drive, …]` |
| 影响类型 | **直接** |

### Node R4 — 绕行 +90 分钟

| 维度 | 值 |
|------|-----|
| 输入 | R3 + Neptune template `route_bypass_ring_road` |
| 规则 | `estimatedAddedDurationMinutes: 90` from pack |
| Effect | `RepairCandidate.proposedOperations[CHANGE_ROUTE]` |
| confidence | 0.85（template-derived） |
| evidenceRefs | pack template + road evidence |
| affectedScope | drive segment |
| 影响类型 | **派生**（候选方案属性） |

### Node R5 — 下一活动超过时间窗

| 维度 | 值 |
|------|-----|
| 输入 | R4 + 原 schedule + POI `lastEntryAt/closesAt` |
| 规则 | `newETA > lastEntryAt` → activity **不可执行** |
| Effect | ConstraintAssertion BLOCK on affected activity item |
| confidence | 0.90（时间算术） |
| evidenceRefs | POI time window evidence（**Slice 2 契约待统一**，见 POI 时间窗设计） |
| affectedScope | `[item_activity_next]` |
| 影响类型 | **派生** |

### Node R6 — 夜间驾驶风险

| 维度 | 值 |
|------|-----|
| 输入 | R4 新 ETA + 坐标 + 日期 |
| 规则 | `isDrivingAfterNightCutoff()` |
| Effect | 附加 Constraint WARN/BLOCK on drive segment |
| confidence | 0.85 |
| evidenceRefs | daylight/suncalc |
| affectedScope | drive segment + day index |
| 影响类型 | **派生** |

### Node R7 — INFEASIBILITY

| 维度 | 值 |
|------|-----|
| 输入 | R3 + R5（原方案 BLOCK；绕行方案仍 BLOCK 活动） |
| 规则 | Abu BLOCK original + 无单一候选全 PASS |
| Effect | `DecisionProblem.type = FEASIBILITY_FAILURE` |
| confidence | 0.92 |
| evidenceRefs | R1–R6 聚合 |
| affectedScope | trip day 2 |
| 影响类型 | **直接** |

### Node R8 — 生成替代方案

| 维度 | 值 |
|------|-----|
| 输入 | R7 + Neptune ≥2 candidates |
| 规则 | Evaluate → Constraint Gateway per candidate |
| Effect | Workspace 含 executable candidates |
| confidence | per-candidate |
| evidenceRefs | per-candidate |
| affectedScope | plan items |
| 影响类型 | **直接** |

**Causal Trace 要求：** Observe 阶段必须产出 **单一** `CausalTrace` story graph，根节点为 R1，叶节点为 R7/R8；不得 fork 为多个 user-visible 根因。

---

## 3. DecisionProblem 定义

### 3.1 字段规范

| 字段 | 值 / 规则 |
|------|-----------|
| `type` | **`FEASIBILITY_FAILURE`**（非 `INFEASIBILITY` enum — SSOT 使用 FEASIBILITY_FAILURE） |
| `semanticCapability` | **`ROAD_SEGMENT_UNAVAILABLE`** |
| `semanticKey` | `ROAD_SEGMENT_UNAVAILABLE:{triggerEventId}` — `buildRoadSegmentUnavailableSemanticKey()` |
| `rootCauseKey` | `road.is:F208:CLOSED:{observedAt}` |
| `severity` | **`HIGH`** when CLOSED；`MEDIUM` when LIMITED |
| `urgency` | 同 `decision-problem-detector.service.ts`：`CLOSED → HIGH` |
| `affectedItems` | `affectedPlanItemIds[]` from impact analyzer |
| `affectedMembers` | 可选；本 Slice 默认 `[]` |
| `decisionDeadline` | `min(nextActivity.startsAt, nextActivity.lastEntryAt) - buffer` |
| `workflowStatus` | `OPEN` → `DECIDED` → `RESOLVED` |
| `basis` / evidence | `triggerEventId`, `worldStateSnapshotId`, `evidenceRef` |
| `enforcement` | **`BLOCK`** on original plan（Abu） |

### 3.2 Gate 状态规则

| Gate | 条件 |
|------|------|
| **`REJECT`** | 原方案 Abu **BLOCK** 且 **无可执行候选**（全部候选 Abu/Dre BLOCK 或零候选） |
| **`SUGGEST_REPLACE`** | 原方案 Abu **BLOCK** 且 **≥1 候选** 通过 Constraint Gateway（Abu ALLOW/WARN + Dre 未 BLOCK） |
| **`NEED_CONFIRM`** | 本 Slice 不作为主路径；若出现须记录为 **FAIL**（道路关闭应硬 BLOCK 原方案） |
| **`ALLOW`** | 原方案仍可行 → **不得创建 Problem**（验收 FAIL） |

**Projection Gate 映射（决策卡）：**

- `enforcement=BLOCK` + `hasExecutableOptions=true` → 前端 **`SUGGEST_REPLACE`**
- `enforcement=BLOCK` + `hasExecutableOptions=false` → 前端 **`REJECT`**

### 3.3 去重 / 单卡规则（ROAD-ATTN-001）

| 规则 | 实现 |
|------|------|
| 同一 `triggerEventId` | `findOpenByTriggerEvent()` — 不重复创建 |
| 同一 `semanticKey` instance | `aggregateRowsByInstanceKey()` in unified projection |
| 同一道路关闭根因 | **仅 1 张** user-visible 主卡；INFORM 级恢复通知不得并行占队列 |
| NO_ACTION | 道路 OPEN / 无 impact → **不得**入队 |

---

## 4. 三层 Canary 验收

### Phase A — Observe

**输入：** Road.is CLOSED Evidence（Replay: `REAL-SHAPE-ROAD-REPLAY-F208-CLOSED`）

**链路：**

```
Road Evidence
  → EvidenceResolver.fetchAndResolveIfChanged / resolveFromRoadStatusSnapshot
  → WorldStateAssertion (CLOSED)
  → Causal Trace projection
  → DecisionProblemDetector.detectRoadCloseProblem
  → 唯一 Canonical DecisionProblem (OPEN)
```

**必须通过：**

| ID | 断言 |
|----|------|
| PC-ROAD-A-001 | `destination=IS`, productionCanary=true |
| PC-ROAD-A-002 | WorldState ACTIVE assertion `status=CLOSED` |
| PC-ROAD-A-003 | 恰好 **1** 个 OPEN problem |
| PC-ROAD-A-004 | Causal trace `storyNodes ≥ 4` |
| PC-ROAD-A-005 | OBSERVE: problem **not user-visible**（或 inform-only shadow） |
| PC-ROAD-A-006 | **无** Repair 执行 |
| PC-ROAD-A-007 | Effective Plan **不变** |
| PC-ROAD-A-008 | Legacy write invocation = **0** |

**禁止：** Execute、W-01 Apply、PlanVersion EFFECTIVE 切换。

---

### Phase B — Suggest

**输入：** Phase A 的 OPEN Problem

**链路：**

```
DecisionProblem
  → RoadSegmentUnavailableEvaluateService.evaluate()
  → Abu BLOCK original
  → Neptune buildNeptuneRoadRepairCandidates (≥2)
  → Dre load per candidate
  → Constraint Gateway
  → DecisionCore finalize → PROPOSED
  → CausalStoryView / 决策卡投影
```

**必须通过：**

| ID | 断言 |
|----|------|
| PC-ROAD-B-001 | ≥ **3** 类候选可见（绕行 / 取消 / 替换） |
| PC-ROAD-B-002 | 原方案 marked **BLOCK** |
| PC-ROAD-B-003 | ≥ **1** 候选 executable |
| PC-ROAD-B-004 | 不可行候选被 Gateway **拒绝**（不得出现在 executable set） |
| PC-ROAD-B-005 | Gate = **SUGGEST_REPLACE**（本场景） |
| PC-ROAD-B-006 | 推荐方案含 `estimatedAddedDurationMinutes=90`（绕行候选） |
| PC-ROAD-B-007 | **无** Effective Plan 写入 |
| PC-ROAD-B-008 | Legacy write = **0** |

**禁止：** 直接 `executor.execute()`；Effective Plan 不变。

---

### Phase C — Execute

**输入：** 用户确认候选（例如 `cand_route_bypass` 或 `cand_cancel_activity`）

**链路：**

```
User confirm
  → W-01 Unified Gateway Apply (或 W-02 authorize + execute)
  → TripMutationOperation
  → PlanVersion PENDING → AUTHORIZED → EFFECTIVE
  → Constraint Revalidation
  → Problem RESOLVED
```

**必须通过：**

| ID | 断言 |
|----|------|
| PC-ROAD-C-001 | `writeChain=EVALUATE_AUTHORIZE_EXECUTE` |
| PC-ROAD-C-002 | W-01 apply gate pass |
| PC-ROAD-C-003 | `resolution=VERIFIED`, `revalidation=PASSED` |
| PC-ROAD-C-004 | `effectiveAfter ≠ effectiveBefore` |
| PC-ROAD-C-005 | F208 CLOSED segment **不再被新 Effective Plan 使用** |
| PC-ROAD-C-006 | Problem `status=RESOLVED` |
| PC-ROAD-C-007 | Legacy write invocation = **0** |
| PC-ROAD-C-008 | Idempotent replay — 重复 execute 不产生第二 Effective |

**对标证据格式：** `prod-canary-execute-c-2026-07-10.json`（天气 Slice 已验证的 W-01 链）

---

## 5. Repair 候选（限定三类）

**禁止新增第四类通用 Repair。** 「调整住宿」列入 Slice 2.1 扩展，本验收不包含。

### 5.1 候选 A — 绕行（ROUTE_REPAIR）

| 属性 | 值 |
|------|-----|
| templateId | `route_bypass_ring_road` |
| generationMethod | `ROUTE_REPAIR` |
| operations | `CHANGE_ROUTE` → `bypassRoadId: RING_ROAD` |
| 增加时间 | **+90 min** |
| 距离变化 | +~120 km（验收容差 ±15%） |
| 预算影响 | +1500 ISK（模板值） |
| 活动损失 | 下一活动 **可能仍不可达** — 须 Gateway BLOCK 或标记 degraded |
| 夜间驾驶 | **可能触发** — 须 Dre/夜间约束显式评估 |
| 成员影响 | 可选 +30 min 驾驶疲劳 |
| 硬约束 | 绕行道路须 OPEN（验收须 mock Ring Road OPEN） |
| 推荐理由 | 保留大部分原意图，仅绕开 F208 |

### 5.2 候选 B — 取消下一活动

| 属性 | 值 |
|------|-----|
| generationMethod | `LOCAL_SUBSTITUTION` / `REMOVE_ITEM` |
| operations | `REMOVE_ITEM` → activity item |
| 增加时间 | **-60 min**（净节省） |
| 活动损失 | **100%** 该活动 |
| 夜间驾驶 | 可能 **消除** |
| 硬约束 | PASS（若剩余驾驶不超 daily load） |
| 推荐理由 | 接受活动损失，保证当日可达 |

### 5.3 候选 C — 替换下一活动

| 属性 | 值 |
|------|-----|
| templateId | `local_waterfall_skogafoss` 或等效 |
| generationMethod | `LOCAL_SUBSTITUTION` |
| operations | `REPLACE_ITEM` |
| 增加时间 | **-10 min**（模板） |
| 活动损失 | 部分意图降级 |
| 夜间驾驶 | 取决于新 POI 位置 |
| 硬约束 | 新 POI 须在 `lastEntryAt` 前可达 |
| 推荐理由 | 保留「瀑布/自然」意图，换可执行 POI |

**Stub 禁止：** Live Canary 不得使用 `buildRoadCloseStubCandidates()` 作为唯一候选来源。

---

## 6. Revalidation（Execute 后）

| # | 验证项 | 规则 |
|---|--------|------|
| RV-01 | 关闭路段不再使用 | Effective Plan segments 不含 F208 CLOSED path |
| RV-02 | 新路线可通行 | WorldState / road poll 对选用路段为 OPEN 或 LIMITED（非 CLOSED） |
| RV-03 | 新 ETA 合理 | 与 Dre 评估一致，容差 ±10 min |
| RV-04 | 时间窗 | 保留的活动满足 `lastEntryAt` **或** 已正式 REMOVE |
| RV-05 | 夜间驾驶 | 新 plan 无 **更严重** 的 post-cutoff driving |
| RV-06 | Problem 关闭 | `status=RESOLVED`, revalidation `PASSED` |
| RV-07 | 无新 HIGH/STOP | 队列无新增 BLOCK 级 problem |

**实现锚点：** `evaluateRevalidationFromRows()` in `decision-problem-revalidation.util.ts`

---

## 7. 验收矩阵

| ID | Phase | 描述 | Pass 条件 |
|----|-------|------|-----------|
| **ROAD-OBS-001** | A | 创建唯一 Problem | OPEN count = 1；semanticKey 正确 |
| **ROAD-OBS-002** | A | 重复 Evidence 不重复创建 | 同 fingerprint 第二次 poll → problem count 不变 |
| **ROAD-OBS-003** | A | 道路恢复后重新评估 | F208 OPEN → 触发 re-eval；problem 可 RESOLVED 或进入 recovery 路径 |
| **ROAD-SUG-001** | B | 生成三类候选 | workspace candidates ≥ 3 types |
| **ROAD-SUG-002** | B | 不可行方案被拒绝 | blocked candidate ∉ executableOptions |
| **ROAD-EXE-001** | C | 确认后新 PlanVersion | `planVersion.status=EFFECTIVE` |
| **ROAD-EXE-002** | C | 写入只经 W-01 | `writeChain=EVALUATE_AUTHORIZE_EXECUTE`；无 direct effective write |
| **ROAD-EXE-003** | C | Revalidation PASSED | `revalidationStatus=PASSED` |
| **ROAD-EXE-004** | C | 原 Problem RESOLVED | `problemResolved=true` |
| **ROAD-AUTH-001** | ALL | Legacy write = 0 | shadow comparator 无 legacy mutation |
| **ROAD-ATTN-001** | ALL | 同一根因一张主卡 | queue projection distinct instanceKey count = 1 |
| **RT-F208-001** | T2 | 2WD + LIMITED → 车辆不匹配 | `result=VEHICLE_INCOMPATIBLE`; gate `SUGGEST_REPLACE`; Problem OPEN |
| **RT-F208-002** | T2 | 4WD + LIMITED → 谨慎可通行 | `result=PASSABLE_WITH_CAUTION`; gate `NEED_CONFIRM`; Problem 可选 |
| **RT-F208-003** | T2 | 降雨 + 涉水 + LIMITED | `result=TEMPORARILY_IMPASSABLE`; gate `SUGGEST_REPLACE`; Problem OPEN |
| **RT-F208-004** | A/B/C | CLOSED 硬封闭（已有） | 等同 PC-ROAD-A/B/C + ROAD-OBS/EXE 矩阵；fixture CLOSED |
| **RT-F208-005** | T2 | OPEN 碎石 + 无驾驶经验 | `result=DRIVER_INCOMPATIBLE`; gate `NEED_CONFIRM`; Problem 可选 |

---

## 8. Replay vs Live 验收分层

| 层级 | 证据类型 | 用途 |
|------|----------|------|
| **L2 Harness** | Jest `iceland-road-close-l2.spec.ts` | 工程回归（mock prisma） |
| **Staging Replay — CLOSED** | `REAL-SHAPE-ROAD-REPLAY-F208-CLOSED` + `gagnaveita-f208-closed-real-shape.json` | A/B/C drill，**Prod Canary 前必过**（Pre-Signoff PASS 2026-07-10） |
| **Staging Replay — LIMITED** | `REAL-SHAPE-ROAD-REPLAY-F208-LIMITED` + `gagnaveita-f208-real-shape.json` | RT-F208 traversability drill（T2）；**不得**与 CLOSED replay 混记 |
| **Live Gagnaveita** | `vegagerdin_gagnaveita` source | Egress probe + soak（Frankfurt collector） |
| **Forbidden** | `seasonalFallback`, `ROAD_IS_PROVIDER_MOCK`, `admin_injection` | 不得作为 sign-off 证据 |

---

## 9. 与天气 Slice 的差异（设计评审关注点）

| 维度 | Weather Slice 1 | Road Slice 2 |
|------|-----------------|--------------|
| 不可行类型 | 风险 / 禁止户外活动 | **硬性路线不可达** |
| 影响粒度 | day + region | **segment + plan items** |
| Live 接入 | Vedur Collector + 反向隧道 | **待 Road.is Egress Probe** |
| Monitoring | Trigger Gateway (weather) | **Direct runner**（待对齐） |
| POI 时间窗 | 间接 | **必须进入因果链**（R5） |
| 恢复语义 | calm polls × N | **OPEN 观测 + 迟滞**（ROAD-OBS-003） |

---

## 10. 评审清单（Design Review Gate）

- [ ] 场景叙事与 Road Canary Trip 日序一致（`b0b88888-…`，非 Weather Trip）
- [ ] `FEASIBILITY_FAILURE` vs 用户期望 `INFEASIBILITY` 命名已对齐
- [ ] Gate REJECT / SUGGEST_REPLACE 规则可测试
- [ ] 三类 Repair 足够覆盖场景，住宿调整明确 deferred
- [ ] POI 时间窗 Evidence 契约有并行设计任务
- [ ] 验收矩阵 ID 可映射到 future drill script
- [ ] RT-F208-* 与 CLOSED Pre-Signoff 证据分层无混记
- [ ] 与 Formal Weather Soak 禁令无冲突

**评审通过后：** 等待 Weather Formal Soak 签字 → T1 traversability 接线 → RT-F208 staging drill → Road Production GO 签字。

---

## 11. Traversability 扩展 — RT-F208-*（ADR-ROAD-TRAVERSABILITY-MODEL）

**状态：** T0 设计冻结；**T1 接线前不得作为 Production GO 证据**  
**证据标签：** `ROAD_TRAVERSABILITY_ENGINEERING_EVIDENCE`  
**与 §0–§9 关系：** CLOSED drill（RT-F208-004 / Pre-Signoff）证明主链可达；本节证明 **`LIMITED` 不得默认为 WARNING 可通行**，须结合 profile + 车辆 + 天气。

### 11.1 目标场景（LIMITED Narrative）

用户冰岛自驾，Effective Plan Day 2 经 **F208** 前往高地。Gagnaveita rollup 为 **`LIMITED`**（`FAERT_FJALLABILUM` = mountain vehicles only），**非 CLOSED**。

| 维度 | 验收基准 |
|------|----------|
| 静态 profile | `HIGHLAND_F_ROAD` / `GRAVEL` / `requires4wd=true` / 涉水 1 处（`is-road-segment-profiles.json`） |
| 动态 condition | `status=LIMITED`；mapper `AstandYfirbord=FAERT_FJALLABILUM` |
| 车辆 A — 2WD | 租赁合同 / trip metadata `driveType=2WD` → **不可执行原路线** |
| 车辆 B — LARGE_4X4 | `driveType=4WD`, `riverCrossingAllowed=true` → **可谨慎通行，须确认** |
| 天气叠加（RT-003） | 当日降雨 + 涉水点 → 4WD 亦 **暂时不可通行** |
| 系统结论（2WD） | `VEHICLE_INCOMPATIBLE` → Abu **BLOCK** 原方案 → `SUGGEST_REPLACE` |
| 系统结论（4WD 干燥） | `PASSABLE_WITH_CAUTION` → `NEED_CONFIRM`（可不建 Problem） |

**Trip（冻结）：** `b0b88888-8888-4888-8888-888888888888`  
**User：** `b0b88888-8888-4888-8888-888888888801`  
**Drive item：** `b0b88888-8888-4888-8888-888888888631`  
**Plan version：** `plan_1`

### 11.2 Fixture 与证据分层

| 场景 | Fixture | `replay` | `live` | 禁止混用 |
|------|---------|----------|--------|----------|
| RT-F208-001..003, 005 | `scripts/fixtures/gagnaveita-f208-real-shape.json` | `true`（drill 时 patch `observedAt`） | 源快照 `live=true` | 不得标为 CLOSED sign-off |
| RT-F208-004 | `scripts/fixtures/gagnaveita-f208-closed-real-shape.json` | `true` | — | 不得标为 LIMITED traversability |
| Live 对照（可选） | Frankfurt collector 实时 pull | `false` | `true` | 不得替代 replay 工程签字 |

**Gagnaveita 映射（冻结）：** 见 [ICELAND-ROAD-SOURCE-AUTHORITY-2026-07-11.md](./ICELAND-ROAD-SOURCE-AUTHORITY-2026-07-11.md) — `FAERT_FJALLABILUM` → `LIMITED`。

### 11.3 输入条件

#### 11.3.1 Road Evidence（LIMITED 真实形状）

| 字段 | 要求 |
|------|------|
| `value.currentStatus` | `limited` → RFC-001 `LIMITED` |
| `value.roadId` | `F208` |
| `sourceProvider` | `vegagerdin_gagnaveita` |
| `source` | Replay: `REAL-SHAPE-ROAD-REPLAY-F208-LIMITED` |
| `confidence` | **0.88**（Gagnaveita live shape） |
| WorldState assertion | `road.status=LIMITED`（非 CLOSED） |

#### 11.3.2 车辆能力（Trip / Rental Contract）

| 场景 | `VehicleCapability` |
|------|---------------------|
| RT-F208-001 | `{ driveType: '2WD', vehicleClass: 'COMPACT', riverCrossingAllowed: false }` |
| RT-F208-002 | `{ driveType: '4WD', vehicleClass: 'LARGE_4X4', riverCrossingAllowed: true }` |
| RT-F208-003 | 同 002 + weather assertion `precipitation=rain` on segment day |
| RT-F208-005 | `{ driveType: '2WD' }` + `driver.gravelRoadExperience=false`；condition `status=OPEN`, `condition=LOOSE_GRAVEL` |

**SSOT（T1）：** `exploration-rental-contract.adapter` 投影；drill 可通过 trip metadata seed。

#### 11.3.3 Traversability Assessment 输出（T1 纯函数）

`assessRoadTraversability()` 须产出（ADR contract）：

| 字段 | RT-F208-001 示例 |
|------|------------------|
| `result` | `VEHICLE_INCOMPATIBLE` |
| `gate` | `SUGGEST_REPLACE` |
| `dimensions.staticProfile` | F208 frozen profile |
| `dimensions.dynamicCondition` | `LIMITED` |
| `dimensions.vehicleMatch` | `INCOMPATIBLE` |
| `reasonCodes` | 含 `F_ROAD_REQUIRES_4WD` 或等效 |
| `evidenceRefs` | road assertion + profile catalog ref |

### 11.4 预期因果链（Traversability 节点）

在 §2 R1–R8 基础上，**LIMITED + 2WD** 路径插入：

#### Node RT1 — LIMITED 外部事实

| 维度 | 值 |
|------|-----|
| 输入 | Gagnaveita `FAERT_FJALLABILUM` for F208 |
| Effect | `WorldStateAssertion { status: LIMITED }` |
| affectedScope | `ROAD:F208` |

#### Node RT2 — 静态 profile 解析

| 维度 | 值 |
|------|-----|
| 输入 | `roadId=F208` |
| 规则 | `resolveRoadSegmentProfile()` → pack catalog |
| Effect | `RoadSegmentProfile { requires4wd: true, hasUnbridgedRiver: true }` |
| confidence | 1.0（pack SSOT） |

#### Node RT3 — 车辆能力匹配

| 维度 | 值 |
|------|-----|
| 输入 | RT1 + RT2 + `VehicleCapability` |
| 规则 | `assessRoadTraversability()` |
| Effect（2WD） | `result=VEHICLE_INCOMPATIBLE`, `gate=SUGGEST_REPLACE` |
| Effect（4WD 干燥） | `result=PASSABLE_WITH_CAUTION`, `gate=NEED_CONFIRM` |
| 影响类型 | **直接**（替代 Abu 对 LIMITED 的泛化 WARNING） |

#### Node RT4 — Abu / Gateway（2WD 路径）

| 维度 | 值 |
|------|-----|
| 输入 | RT3 `gate=SUGGEST_REPLACE` |
| 规则 | Abu **BLOCK** original（非 overridable WARNING） |
| Effect | `DecisionProblem` OPEN，`semanticCapability=ROAD_SEGMENT_RESTRICTED` 或 `ROAD_SEGMENT_UNAVAILABLE`（T1 对齐） |
| 影响类型 | **直接** |

**关键断言：** 2WD + LIMITED + F208 **不得**仅产出 `IS_ROAD_LIMITED_WARN` 且原方案仍 `ALLOW`。

### 11.5 场景验收表

| ID | liveCondition | vehicle / driver | 预期 `result` | 预期 `gate` | Problem | Phase 要求 |
|----|---------------|------------------|---------------|-------------|---------|------------|
| **RT-F208-001** | `LIMITED` | 2WD | `VEHICLE_INCOMPATIBLE` | `SUGGEST_REPLACE` | **OPEN** | A: assertion LIMITED；B: ≥1 executable 候选；C: 可选 execute |
| **RT-F208-002** | `LIMITED` | LARGE_4X4, river OK | `PASSABLE_WITH_CAUTION` | `NEED_CONFIRM` | 可选 | A: 可不建 Problem；B: 原方案 WARN/NEED_CONFIRM，非 BLOCK |
| **RT-F208-003** | `LIMITED` + rain + river | LARGE_4X4 | `TEMPORARILY_IMPASSABLE` | `SUGGEST_REPLACE` | **OPEN** | 同 001；因果链含 weather×surface |
| **RT-F208-004** | `CLOSED` | any | `CLOSED` | `REJECT` | **OPEN** | **已有** Pre-Signoff PC-ROAD-A/B/C；本节仅交叉引用 |
| **RT-F208-005** | `OPEN` + gravel | 2WD, 无碎石经验 | `DRIVER_INCOMPATIBLE` | `NEED_CONFIRM` | 可选 | T2 可选；driver 维度渐进 |

### 11.6 T2 Drill 断言（按 Phase）

#### Phase A — Observe（RT-F208-001 主路径）

| ID | 断言 |
|----|------|
| RT-A-001 | WorldState ACTIVE `road.status=LIMITED`（非 CLOSED） |
| RT-A-002 | `assessRoadTraversability.result=VEHICLE_INCOMPATIBLE`（2WD trip） |
| RT-A-003 | 恰好 **1** 个 OPEN problem（同 `triggerEventId` 不重复） |
| RT-A-004 | Causal trace 含 RT1–RT3 节点 |
| RT-A-005 | Effective Plan **不变** |
| RT-A-006 | Legacy write = **0** |

#### Phase B — Suggest（RT-F208-001）

| ID | 断言 |
|----|------|
| RT-B-001 | 原方案 Abu **BLOCK**（非单纯 WARNING） |
| RT-B-002 | Gate = **SUGGEST_REPLACE** |
| RT-B-003 | ≥ **1** executable 候选（绕行 / 换活动 / 取消 F208 段） |
| RT-B-004 | 候选含 `route_bypass_ring_road` 或等效 **不经过 F208** |
| RT-B-005 | **无** Effective Plan 写入 |

#### Phase C — Execute（RT-F208-001，可选）

| ID | 断言 |
|----|------|
| RT-C-001 | 用户确认后 `writeChain=EVALUATE_AUTHORIZE_EXECUTE` |
| RT-C-002 | 新 Effective Plan **不含** F208 LIMITED 段 |
| RT-C-003 | Problem `RESOLVED` + revalidation `PASSED` |

#### 对照组（RT-F208-002，同 fixture，切换 4WD trip seed）

| ID | 断言 |
|----|------|
| RT-2WD-4WD-001 | 同 LIMITED evidence：2WD → BLOCK；4WD → `NEED_CONFIRM` 或 WARN，**非** BLOCK |
| RT-2WD-4WD-002 | 两趟 drill 的 evidence 文件 **分别** 标注 `vehicleProfile=2WD|4WD` |

### 11.7 与 CLOSED drill 的边界

| 维度 | CLOSED（§0–§9 / Pre-Signoff） | LIMITED Traversability（§11） |
|------|------------------------------|------------------------------|
| Fixture | `gagnaveita-f208-closed-real-shape.json` | `gagnaveita-f208-real-shape.json` |
| Abu 原方案 | 硬 BLOCK | 2WD BLOCK；4WD 可能 NEED_CONFIRM |
| 证据标签 | `ROAD_PROD_CANARY_PRE_SIGNOFF_ENGINEERING_EVIDENCE` | `ROAD_TRAVERSABILITY_ENGINEERING_EVIDENCE` |
| Production GO | 必要非充分（已 PASS engineering drill） | Road GO **前必过**（T2） |
| Weather Soak | 阻塞 GO | **不替代** Soak 签字 |

### 11.8 实现锚点（T1）

| 组件 | 路径 |
|------|------|
| Profile catalog | `data/destination-packs/is/road/is-road-segment-profiles.json` |
| Profile loader | `src/decision-runtime/packs/road/road-segment-profile.loader.ts` |
| Assessor（待建） | `src/decision-runtime/.../road-traversability.assessor.ts` |
| Abu LIMITED 分支 | `src/trips/guardian-decision-core/adapters/abu-road-constraint.adapter.ts` |
| Gagnaveita mapper | `src/trips/guardian-decision-core/evidence/gagnaveita-faerd.mapper.ts` |
| ADR | `internal-docs/architecture/ADR-ROAD-TRAVERSABILITY-MODEL.md` |

### 11.9 T2 执行顺序（Soak PASS + T1 接线后）

**Drill 脚本（骨架，2026-07-11）：**

```bash
# 2WD 主路径（RT-F208-001）
ROAD_DRILL_ALLOW_PROD=1 npm run prod-canary:road-traversability-pre-signoff

# 4WD 对照（RT-F208-002）+ 2WD/4WD 连续对照
ROAD_DRILL_ALLOW_PROD=1 npm run prod-canary:road-traversability-pre-signoff -- --vehicle=4WD
ROAD_DRILL_ALLOW_PROD=1 npm run prod-canary:road-traversability-pre-signoff -- --compare-4wd

# 分步
ROAD_DRILL_ALLOW_PROD=1 npm run prod-canary:road-traversability-pre-signoff-setup -- --reset --vehicle=2WD
ROAD_DRILL_ALLOW_PROD=1 npm run prod-canary:road-traversability-pre-signoff-abc -- --phase=A
```

| 脚本 | 用途 |
|------|------|
| `prod-canary-road-traversability-pre-signoff.ts` | 编排：baseline → setup → A/B/C → rollback → verify |
| `prod-canary-road-traversability-pre-signoff-setup.ts` | Seed trip + `rfc001VehicleCapability` |
| `prod-canary-road-traversability-pre-signoff-abc.ts` | LIMITED fixture ingest + RT-A/B/C 断言 |
| `prod-canary-road-traversability-pre-signoff-rollback.ts` | 恢复 `plan_1`，验证 Weather 不变 |

**骨架行为：** `structuralVerdict=PASS` 当 LIMITED 断言/ingest/候选链就绪；`traversabilityVerdict=PENDING_T1` 直至 `assessRoadTraversability` 接线。证据：`road-traversability-pre-signoff-{2wd|4wd}-*.json`。

**手动步骤（与脚本等价）：**

1. Seed Road Trip `b0b88888-…` with **2WD** rental metadata（`--reset` 若需）
2. Ingest `gagnaveita-f208-real-shape.json`（`replay=true`, patch TTL）
3. Run Phase A → B →（可选）C；写出 `road-traversability-pre-signoff-*.json`
4. Reset trip；repeat with **4WD** for RT-F208-002 / RT-2WD-4WD-001
5. **不** rerun CLOSED fixture 作为 LIMITED 证据；RT-F208-004 引用既有 Pre-Signoff 包即可

**禁令（与 Pre-Signoff 相同）：** 无 PM2 restart；无 Weather env/cron 变更；无 Road Live auto-trigger；不得使用 Weather Canary Trip。
