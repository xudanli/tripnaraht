# 规划工作台 · 决策检查器 BFF 契约

> **版本**: 0.1.0  
> **Schema**: `tripnara.decision_checker@v1`  
> **Base**: `/api/trips/:tripId/decision-checker`  
> **状态**: 后端已实现 · 前端待切 SSOT  
> **关联 UI**: `PlanningWorkbenchDecisionChecker` 四 Tab（概览 / 证据 / 影响 / 反事实）  
> **原则**: **所有展示文案、数值、等级、推荐语由 BFF 投影**；前端只做渲染与 Tab 切换，禁止客户端拼装「AI 建议」或从 score 差值推导「+13 / -1h40m / +¥620」。

**最后更新**: 2026-06-29

---

## 1. 为什么要新接口

当前前端在 `decision-checker-view.util.ts` 中 **拼接/硬编码** 了以下内容，与设计稿不一致且不可审计：

| 区块 | 现状（需删除） | 应由后端提供 |
|------|----------------|--------------|
| 概览 · AI 建议 | 固定文案「建议优先修复硬冲突…」 | `overview.aiSuggestion.text` |
| 推荐方案 · 指标 | 从 `OptionComparison.scores` 差值推算「可行度 +N」 | `repairPlan.metrics[]` 带单位与格式化值 |
| 推荐方案 · benefits | 从 `violations_before/after` 拼句子 | `repairPlan.benefits[]` |
| 证据 · 可靠性 | 按 `evidenceSource` 字符串关键词猜「高/中/低」 | `evidence.items[].reliability` |
| 证据 · 冲突判断说明 | `title + message` 拼接 | `evidence.judgmentExplanation`（审计级叙述） |
| 影响 · 预算/体验 | 缺失，无法展示 | `impact.summary.budgetImpact` / `experienceCompletion` |
| 影响 · AI 解读 | 固定模板句 | `impact.aiInterpretation.text` |
| 反事实 · 方案卡片 | 字母 A/B/C、badge、metrics 客户端生成 | `counterfactual.scenarios[]` 完整投影 |
| 反事实 · 风险块 | 从 hardConflicts 复制 + 模板推荐语 | `counterfactual.ifUnchanged` |

---

## 2. 推荐真源（SSOT）

```
GET /trips/:tripId/decision-checker     ← 读本模型（本契约）
POST /trips/:tripId/decision-checker/refresh   ← 可选，触发重算（异步 taskId）
```

**BFF 内部聚合（不要求前端多次请求）**：

| 子域 | 读源 |
|------|------|
| 硬/软冲突 | `PlanningConflictsService` ← `trip-conflicts` + feasibility issues |
| 每日驾驶上限 | `metadata.constraints.maxDailyDrivingHours` → `issueKind: daily_drive` |
| 约束变更预览 | `TripConstraintPreviewService.captureAssessSummary` |
| 可执行性报告 | `FeasibilityReportService` |
| 修复候选 | `getRepairOptions(issueId)` |
| 证据链 | issue `proofs[]`（含 `max_daily_drive` / OSRM） |
| 级联影响 | repair options `cascadeUiHints` |
| 约束版本 | `ConstraintsSummaryService` |

TypeScript 类型 SSOT：`types/decision-checker.types.ts`。

---

## 3. 主接口

### 3.1 `GET /trips/:tripId/decision-checker`

| Query | 说明 |
|-------|------|
| `focusConflictId` | 聚焦某条冲突（深链 `?conflictId=`） |
| `planId` | 当前方案 id（预留） |
| `constraintsVersion` | 乐观锁；不匹配时 `isStale: true` |
| `includeStale` | `true` 时返回 STALE 快照并带 `isStale` |
| `taskId` | refresh / deferred 后轮询 |

**Response 200**：`DecisionCheckerResponse` — 四 Tab `overview` / `evidence` / `impact` / `counterfactual`，可选 `splitPlan`、`actions[]`、`snapshotVersion`。

### 3.2 `POST /trips/:tripId/decision-checker/refresh`

Body 可选：`reason`, `constraintsVersion`, `focusConflictId`, `runMonteCarlo`。

**Response 202**：

```json
{
  "taskId": "dc_refresh_abc",
  "pollUrl": "/trips/:tripId/decision-checker?taskId=dc_refresh_abc"
}
```

---

## 4. 响应示例（daily_drive 硬冲突）

与规划工作台设计稿对齐；`maxDailyDrivingHours` 超限经 `trip-conflicts` → feasibility → 本投影：

```json
{
  "schema": "tripnara.decision_checker@v1",
  "tripId": "3e4a1058-9218-467f-988a-c18008a14385",
  "generatedAt": "2026-06-28T10:12:00Z",
  "snapshotVersion": "constraints_v3:plan_v2:conflicts_20260628T101200",
  "overview": {
    "conflict": {
      "hardCount": 1,
      "primary": {
        "conflictId": "cfl_drive_day2",
        "severity": "hard",
        "title": "每日驾驶上限",
        "message": "Day 2 连续驾驶时长 5h 20m，超过每日上限 4 小时，超出 1h 20m。",
        "affectedDays": [2]
      }
    },
    "repairPlan": {
      "id": "change_day2_lodging",
      "source": "feasibility_repair",
      "badge": "方案 1（推荐）",
      "title": "更换 Day 2 住宿",
      "metrics": [
        { "key": "feasibility", "label": "可行度", "displayValue": "+13", "tone": "good" },
        { "key": "drive_duration", "label": "驾驶时长", "displayValue": "-1h 20m", "tone": "good" },
        { "key": "budget", "label": "预算变化", "displayValue": "+¥620", "tone": "good" }
      ],
      "benefits": ["连续驾驶时长降至 3 小时 40 分钟（符合限制）"]
    },
    "aiSuggestion": { "text": "建议优先修复硬冲突，再优化软偏好以提升可行度。", "source": "rule" }
  },
  "evidence": {
    "items": [{ "kind": "route_engine", "reliability": "high", "publisher": "OSRM" }],
    "judgmentExplanation": "OSRM计算的预计驾驶时长为 5h 20m…判定为硬冲突。"
  },
  "impact": {
    "summary": {
      "budgetImpact": { "value": "+¥620", "tone": "good" },
      "experienceCompletion": { "value": "-12%", "tone": "bad" }
    },
    "constraints": [{
      "constraintId": "c_max_daily_drive",
      "type": "hard",
      "name": "每日驾驶上限 ≤ 4 小时",
      "status": "超出 1h 20m",
      "impact": "high"
    }],
    "aiInterpretation": {
      "text": "该冲突主要由 Day 2 长途连续驾驶引起，建议拆分路段或调整休息点。",
      "source": "kernel"
    }
  }
}
```

---

## 5. 嵌入 planning-conflicts（异步首包）

`GET /trips/:tripId/planning-conflicts?includeDecisionChecker=1&focusConflictId=...`

**首包 <2s**：立即返回 `conflicts` / `daySplits`，`decisionCheckerDeferred.status=pending`。

```json
{
  "decisionCheckerDeferred": {
    "status": "pending",
    "taskId": "dc_embed_abc123",
    "pollUrl": "/trips/{tripId}/planning-conflicts?decisionCheckerTaskId=dc_embed_abc123",
    "pollIntervalMs": 5000
  }
}
```

轮询直至 `status=ready`，响应附带完整 `decisionChecker`。  
`GET /trips/:tripId/decision-checker?taskId=dc_embed_...` 亦可 await 同一任务。

---

## 6. 后端硬规则

1. **禁止** 只返回 raw score 让前端格式化为「+13 / -1h40m / +¥620」——必须返回 `displayValue` + `tone`。
2. **禁止** 返回空 `aiSuggestion` / `aiInterpretation` 让前端写兜底文案；无内容时字段 **省略**，前端显示空态。
3. `judgmentExplanation` 必须是**可审计**推理链（引用 proofs / OSRM / `max_daily_drive`），不得等于 `message` 复读。
4. `evidence.items[].reliability` 由 BFF 置信映射（`proof.confidence` + source），非前端猜 publisher。
5. `counterfactual.scenarios` 与 `overview.repairPlan` 引用同一 `snapshotVersion`；约束/日程变更后 `isStale: true`。
6. 所有时间 ISO8601；相对时间（「5 分钟前」）由前端从 `observedAt` 计算。
7. `daily_drive` 冲突：`planning-conflicts` + `decision-checker` 共用同一 issue 链（`proofs[].constraint=max_daily_drive`）。

---

## 7. 后端补齐清单（2026-06-29）

| 优先级 | 字段 | 状态 |
|--------|------|------|
| P0 | `overview.repairPlan`（metrics/benefits/cta） | ✅ deferred 启用 repair + daily_drive 合成兜底 |
| P0 | `counterfactual.scenarios[]` + `subheadline` | ✅ |
| P0 | `impact.summary` + `cascade[]` | ✅ daily_drive 默认级联链 |
| P0 | daily_drive → planning-conflicts | ✅ 可移除 clientHardConflictOverlay |
| P1 | `evidence.calculationDetailUrl` + `observedAt` | ✅ |
| P1 | `decisionCheckerDeferred` 轮询 | ✅ pollIntervalMs=5000 |
| P1 | poll ready 合并 `daySplits` | ✅ 来自 decisionChecker.daySplits |
| P0 | splitPlan 数据同源（Schedule 真源） | ✅ 见 §10 |

---

## 10. 分流方案（splitPlan）

| 接口 | 字段 |
|------|------|
| `GET .../decision-checker` | `splitPlan` — 右栏「分流」Tab |
| `GET .../planning-conflicts` | `daySplits[]` — 中栏并行时间线 |

写接口：`POST /trips/:tripId/split-plans/:splitPlanId/apply`

实现：

- `utils/split-plan.projection.util.ts` — 投影入口（**必须有 schedule**）
- `utils/split-plan-schedule.source.util.ts` — ItineraryItem + Persona 分组
- `utils/split-plan-schedule.builder.util.ts` — daySplits / splitPlan DTO
- `services/split-plan.service.ts` — 加载 schedule、apply 写回

### splitPlan 数据规则

| 优先级 | 字段 | 规则 |
|--------|------|------|
| P0 | `groups[].label` | Persona 组名 + 人数（如「年轻人组（8 人）」「长者组（4 人）」），禁止「偏好 A/B 组」 |
| P0 | `groups[].activityTitle` | 组主题摘要（如「高强度体验」「舒适休息」），具体 POI/活动见 `highlights` 与 `segments` |
| P0 | `groups[].highlights` | 卡片要点（如「冰川徒步 4.5 小时」「专业向导 & 安全保障」「咖啡馆时光」），来自 schedule 段时长/note/POI |
| P1 | `groups[].members` / `avatarUrls` | 组内成员与头像（与 `daySplits.branches[].members` 同源） |
| P0 | `logistics.meetupPoint` | rejoin 段 POI 名（优先 `daySplit.rejoin.placeName`，非活动类型如「休息/用餐」），禁止占位「汇合点」 |
| P1 | `groups[].memberCount` | 与 `memberCluster` / 协作者人数一致 |
| P0 | `logistics.meetupTime` | 全部分支 **最晚结束时刻**；B 组先行酒店/休息时汇合点 POI 仍为 anchor，**禁止**用 B 组休息开始时间 |
| P0 | `splitPlan` ↔ `daySplits` | 无有效 schedule daySplit 时 **两者均不返回** |
| P0 | `stats.rentalHotel` | 租车点→酒店直线距离 / 预估车程；`dropoffFeasible=true` 时 B 组先送达酒店休息、A 组继续游览 |
| P1 | `logistics.transport` | 含送达文案（如「自 Geysir 送达 黑沙滩套房酒店（约 117 km），B 组休息 · A 组继续游览」） |

**租车→酒店送达规则：** 读取 schedule 中 `car_rental` 与 `hotel` REST 段；**分叉点**在 `[timelineDisplayRole:hotel]` 之前全员同行（含盖歇尔/塞里雅兰等），分叉后 B→酒店、A→后续景点。距酒店车程以**分叉前最后一站→酒店**计算；过远则建议全员同行。

### 中栏分叉时间轴（图2）

**不要**用扁平 `itineraryItems[]` 画分流日 — 必须用 `daySplits[]` 里 **`dayNumber === 当前选中天`** 的那条：

```
sharedBefore[]     → 主竖线（全员同行：落地/租车/转场）
fork.startTime     → 在此处分叉（afterSegmentId = sharedBefore 最后一段）
branches[].segments → A/B 并行卡片（含 members、placeName）
rejoin             → 汇合节点（「重新汇合 · 酒店晚餐」）
sharedAfter[]      → 汇合后继续
```

首包 `GET .../planning-conflicts?includeDecisionChecker=1` 现已带 `daySplits`（与 `splitPlan` 同源）；poll ready 时以 `decisionChecker.daySplits` 覆盖。

无匹配 `daySplits` 时中栏退化为普通单线行程（仅右栏可有 splitPlan 摘要）。

---

## 8. 验收清单

- [x] 有硬冲突时，概览 metrics 含 `displayValue`（分 / 分钟 / 货币）
- [x] 无 repair 历史时，证据 Tab 可空态（`items: []`），无客户端假证据
- [x] 影响 Tab 展示 `budgetImpact`、`experienceCompletion`（有则显示，无则省略）
- [x] 反事实 Tab 有 scenario 时，`ifUnchanged.recommendation` 来自 BFF
- [x] `constraintsVersion` 不匹配 → `isStale: true`
- [x] `maxDailyDrivingHours` 超限 → `issueKind: daily_drive` → DC 四 Tab 投影
- [ ] 顶栏可行度、preview-impact、DC metrics **数值一致**（依赖 assess 快照同源）

---

## 9. 前端对接（后端就绪后）

| 步骤 | 动作 |
|------|------|
| 1 | 新增 `src/api/decision-checker.ts` → `GET /trips/:id/decision-checker` |
| 2 | 新增 `useDecisionChecker(tripId)`，订阅 `plan-studio:schedule-refresh` |
| 3 | 删除 `buildDecisionCheckerViewModel` 客户端拼装 |
| 4 | Tab 直渲染 DTO；无字段则空态 |
| 5 | CTA 走 `actions[].type` + `payload` |

---

## 11. 实现文件

- `controllers/decision-checker.controller.ts`
- `services/decision-checker.service.ts`
- `utils/decision-checker-view.projection.util.ts`
- `types/decision-checker.types.ts`
- `utils/daily-drive-threshold.util.ts` / `daily-drive-conflicts.util.ts` — 每日驾驶检测
- `services/decision-checker-deferred.store.ts` — 异步 embed 任务
- `utils/split-plan.projection.util.ts` / `split-plan-schedule.*.util.ts` — 分流方案 Schedule 真源投影
- `services/split-plan.service.ts` — 分流 apply 写回
