# Phase 2.2 — Calibration Readout（首轮真实校准）

## 产出 A：Golden Circle 样本表

**说明：** 在修复 `StateManager.merge` 丢弃 `poiPlanning` 之前，线上/本地 `route-and-run` 返回的 `observability.poi_planning.outcome` 中 `metrics.noPoiPlanning` 常为 `true`、`anchorCoverage.required` 为空，**不能**用于调参判断。请先部署包含 **merge 修复** 的构建，再填下列。

### 修复（已合入代码库）

`src/decision/kernel/state-manager.service.ts`：`merge()` 现显式合并 `patch.poiPlanning`，与 `constraints` / `harnessRuntime` 等同级，保证 STATE_UPDATE 写入的区域锚点切片进入 DSO。

单测：`state-manager.service.spec.ts` —「应合并 poiPlanning（STATE_UPDATE 锚点切片）」。

### 跑法（每条请求）

- `POST /api/agent/route_and_run`（全局前缀 `api`）
- **必须**带 `trip_id`（非「从零规划」重定向）与足够 `options.max_seconds`（建议 ≥90）
- 在消息或结构化字段中给出 **日期**，避免 INTAKE `MISSING_DATES` 早退
- 需要 `observability.poi_planning` 时：`use_claude_orchestration: true`、`use_state_machine_orchestration: true`

摘数字段（来自 `observability.poi_planning` 与 `outcome.poiSelection` / `outcome.itineraryFinal`）：

| 列 | 来源 |
|----|------|
| regionId | `poi_planning.regionId` 或 `outcome.slice.regionId` |
| matchedBy | `poi_planning.resolution.matchedBy`（与 DSO 一致时） |
| feasibility | `poi_planning.feasibility` |
| coverage | `outcome.poiSelection.metrics.anchorCoverage.rate`（itinerary 对照用 `itineraryFinal`） |
| overflow | `outcome.poiSelection.metrics.optionalOverflow.overflow` |
| leakage | `outcome.poiSelection.metrics.excludedLeakage.leaked.length > 0` |
| budget gate OK | `outcome.poiSelection.metrics.budgetGateCorrect` |
| fallbackRate | `outcome.poiSelection.fallbackRate` |
| topAnchorRanks | `outcome.poiSelection.topAnchorRanks` |

### 样本定义（8 条 + 可选对照）

| # | 样本 | 请求要点（message / 结构化） |
|---|------|------------------------------|
| 1 | GC normal / 600min / msg | 黄金圈 + 一日游 + 600 分钟 + **normal 节奏**（文案写明） |
| 2 | GC relaxed / 600min / msg | 同上 + **relaxed / 松** |
| 3 | GC tight / 360min / msg | 黄金圈 + **360 分钟** + **紧凑** |
| 4 | GC + must Secret Lagoon | 额外必含 Secret Lagoon / `secret_lagoon`（若 API 支持 structured 字段则与 PR 对齐） |
| 5 | GC + exclude Kerið | exclude `kerid_crater` |
| 6 | GC region_id 直传 | 需在 **TripPlanRequest** 上带 `region_id: golden_circle`（当前 `RouteAndRunRequestDto` 若未暴露该字段，需一次 API 扩展或评测 harness 注入） |
| 7 | 无 region | 冰岛行程但**不**提黄金圈（如「雷克雅未克市区一日」） |
| 8 | 对照重复 | 与 #1 同参再跑 1 次，看方差 |

### 填表（部署 merge 修复后手工填写）

| case | regionId | matchedBy | feasibility | coverage | overflow | leakage | budget gate OK | fallbackRate | topAnchorRanks |
|------|----------|-------------|-------------|----------|----------|---------|----------------|--------------|----------------|
| 1 normal 600 | | | | | | | | | |
| 2 relaxed 600 | | | | | | | | | |
| 3 tight 360 | | | | | | | | | |
| 4 must Secret Lagoon | | | | | | | | | |
| 5 exclude Kerið | | | | | | | | | |
| 6 region_id | | | | | | | | | |
| 7 no region | | | | | | | | | |
| 8 repeat | | | | | | | | | |

---

## 产出 B：唯一优先级结论（先读数、再动一刀）

在 **merge 修复已生效** 且上表至少 **5 条** 为「完整走通 POI_SELECTION」的有效行之前：

**不要**在「调权重（+2 / +2.5 / +3）」与「slug / UUID 映射」之间做最终二选一；此前 `noPoiPlanning` 噪声会误导判断。

**修复生效后的判定规则（仍只选其一）：**

| 观测 | 下一步优先 |
|------|------------|
| coverage 偏低，或 fallbackRate 持续偏高 | **先提映射精度**（关键词表、slug 对齐、Place 映射），不调分 |
| coverage 稳定 1、fallback 低，但 optional 抢戏 / 锚点名次异常集中 | **先微调权重**（从 optional boost 入手） |
| 三项健康 | 可复制 Golden Circle 模板扩 **第二个 region**，仍不调分 |

### 本轮（代码侧修复后、本地 HTTP 未重跑）的正式结论

- **阻塞已消除：** DSO 现可保留 `poiPlanning`，`metadata.poiPlanningOutcome` 与文档口径一致。
- **校准表数值：** 需在你们环境 **重启 API** 后按上表跑满样本再填；当前仓库内不代填「假数据」行。
- **默认建议：** 先完成一轮 **有效样本填表**，再在开仓会议二选一做「权重 vs 映射」；二者不要并行。

---

*Phase 2.2 — Calibration Readout：表 + 单点决策；merge 修复为有效采样的前置条件。*
