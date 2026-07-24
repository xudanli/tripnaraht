# Readiness → Feasibility 迁移清单

> 配套 [`PRODUCT_READINESS_MODEL.md`](../../internal-docs/product/PRODUCT_READINESS_MODEL.md)  
> **用途**: 分 PR 迁移时的字段、模块、调用方 inventory

---

## 1. 应从 Travel Readiness 迁出的能力

| 当前位置 | 能力 | 目标归属 | 迁移 PR 建议 |
|----------|------|----------|--------------|
| `ReadinessScoreBreakdown.scheduleFeasibility` | 日程可行性 | Feasibility `dimensions.schedule` | PR-1 |
| `ReadinessScoreBreakdown.transportCertainty` | 交通确定性 | Feasibility `dimensions.transport` | PR-1 |
| `ReadinessScoreBreakdown.buffers` | 缓冲时间 | Feasibility issues / dimensions | PR-1 |
| `ReadinessScoreBreakdown.safetyRisk`（路段/封路部分） | 实时道路风险 | Feasibility `environment` + segment hazards | PR-1 |
| `CoverageMapService.calculateScheduleFeasibilityScore` | POI 密度、路段时长 | `feasibility-assembler` | PR-1 |
| `CoverageMapService.calculateTransportCertainty*` | 路段 blocked/warning | 已有 `buildDimensions` | PR-1 |
| `CoverageMapService.calculateBuffersScore` | 驾驶负荷、POI 密度 | Feasibility issues (`daily_drive`, `buffer_*`) | PR-1 |
| `PoiAccessReadinessBridgeService` | POI Access → score findings | `TripPrerequisiteService` 双投影 | PR-2 ✅ |
| `feasibilityIssueToReadinessFinding` | 双写桥接 | 删除；Prerequisite 单写 | PR-2 ✅ |
| `ReadinessRepairService` 行程 mutate | apply-repair 写库 | `FeasibilityReportService.applyRepair` | PR-4 |
| `readiness.controller` repair-options/apply-repair | 双入口 | deprecated → feasibility 路径 | PR-4 |
| Guardian negotiation on readiness score | 三人格修复 | Decision Checker / feasibility repair | PR-4 |
| `cascadeUiHints` on `/readiness/score` | 级联影响 | repair-options on feasibility | PR-4 |
| `experience_regret_unconfirmed` in readiness | 体验底线 | Feasibility `gateExecute` | PR-2 |
| `todayReadiness` 全量 score | 行中今日 | scoped feasibility + execution advisory | PR-3 |

---

## 2. Travel Readiness 应保留

| 模块 / 文件 | 保留内容 |
|-------------|----------|
| `CountryProfile` + `FactsToReadinessCompiler` | 签证、支付、电源、紧急电话 |
| `ReadinessPack` / Pack Storage | 目的地 overlay 规则（准备类） |
| Capability Packs（准备向） | emergency、permit（用户任务侧） |
| `ChecklistStatusService` | 用户勾选完成态 |
| `FindingMarksService` | 不适用 / 稍后处理 |
| `PackingListService` | 打包清单 |
| `UserDecisionService` | 结构化问答 |
| Pack categories | `entry_transit`, `health_insurance`, `gear_packing`, `activities_bookings`, `logistics` |

---

## 3. 共享基础设施（只出事实，不出用户结论）

| 组件 | 路径 | 消费方 |
|------|------|--------|
| Coverage Map 几何/证据 | `CoverageMapService.getCoverageMap` | Feasibility assembler |
| Evidence freshness | coverage `dataFreshness` | Feasibility + DepartureGate |
| World Facts / Geo | `GeoFactsService` | Pack overlay + Feasibility |
| POI opening / booking facts | poi-access-capacity | Feasibility P0 |
| Road / weather evidence | transport + readiness refresh | Feasibility validate |
| Destination Pack 事实 | `FactsToReadinessCompiler` | 出发准备 only |

---

## 4. Readiness Score 调用方 inventory

| 调用方 | 文件 | 当前用途 | 迁移后 |
|--------|------|----------|--------|
| Feasibility 组装 | `feasibility-report.service.ts` | dimensions + phaseHint | 仅 phaseHint / coverageDisclosure；dimensions 自算 |
| Feasibility 组装 | `feasibility-assembler.util.ts` | `buildDimensions(input.readiness.score)` | 移除 score 依赖 |
| Scope 过滤 | `feasibility-scope-validation.util.ts` | filterReadinessByDay/Issue | 删除或仅 stub |
| Readiness repair | `readiness-repair.service.ts` | repair 后 refresh score | feasibility validate |
| Readiness API | `readiness.controller.ts` GET score | C 端准备度面板 | 改为 departure-preparation |
| Journey Map BFF | `journey-map.service.ts` | inspector feasibilityScore | feasibility-report.overallScore |
| Agent prompt | `claude-orchestrator.service.ts` | 准备度摘录 | departure-gate 或 feasibility |
| Mobile execution | `mobile-execution.service.ts` | todayReadiness from score | execution-advisory |
| Loop | `readiness-repair.loop.ts` | scoped validation vs score | feasibility scoped |
| Scripts | `test-readiness-unified-apis.ts` | 集成测试 | 更新断言 |
| Specs | `coverage-map.service.spec.ts` | 分数阶段行为 | 拆到 feasibility spec |

---

## 5. Feasibility / canStartExecute 调用方

| 调用方 | 字段 | 迁移后 |
|--------|------|--------|
| `feasibility-report` | `canStartExecute` | 保留为 `planVerdict.canExecutePlan`；文档 deprecated |
| `plan-gate*.util.ts` | `canStartExecute` | 改用 `departure-gate.canStartExecution` |
| `decision-semantics` | `canStartExecute` | 同上 |
| `planning-conflicts` | `canStartExecute` | 同上 |
| `loops/adapters` | `canStartExecute` | 同上 |
| **新增** | `departure-gate` | SSOT 组合门控 |

---

## 6. 分数维度对照（迁出后 Readiness Score 目标形态）

### 当前 `ReadinessScoreBreakdown`

```typescript
{
  overall,
  evidenceCoverage,      // → 部分保留（仅 POI 预订凭证类证据）
  scheduleFeasibility,   // → Feasibility
  transportCertainty,    // → Feasibility
  safetyRisk,            // → 拆分：方案风险→Feasibility；目的地风险→保留
  buffers,               // → Feasibility
}
```

### 目标 `DeparturePreparationBreakdown`（PR-1 后）

```typescript
{
  overall,               // 出发准备完成度 0–100
  entryTransit,          // 签证/入境
  healthInsurance,
  gearPacking,
  bookingsCredentials,
  logisticsComms,
  emergency,
}
```

---

## 7. 推荐 PR 顺序

| PR | 范围 | 风险 |
|----|------|------|
| PR-0 | DepartureGate + 文档 | 低（additive） | ✅ |
| PR-1 | Score 停止计算 schedule/transport/buffers | 中（BFF 需切 feasibility overallScore） | ✅ |
| PR-2 | Prerequisite SSOT + 移除 POI Access bridge 双写 | 中 | ✅ |
| PR-3 | 行中 today 改 execution-advisory | 中 |
| PR-4 | Repair authority 统一到 feasibility | 高 | ✅ |
| PR-5 | `canStartExecute` 语义拆分 | 高 |

---

## 8. 验收标准

- [ ] 同一道路关闭 issue **仅**出现在 feasibility-report，不出现在 readiness score findings
- [ ] 「86 分准备度 + NOT_EXECUTABLE」场景通过 departure-gate 表达为 BLOCKED_BY_PLAN / BLOCKED_BY_BOTH
- [ ] C 端首页同一阶段只突出一个主状态（由 BFF 消费 departure-gate + lifecycle）
- [x] apply-repair 写库仅一条 authority 路径（feasibility-report + `repairAuthority: feasibility`）
