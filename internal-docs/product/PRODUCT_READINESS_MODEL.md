# TripNARA 准备度与可执行性 — 产品模型 SSOT

> **版本**: 1.0.0  
> **状态**: 已采纳（架构方向）  
> **最后更新**: 2026-07-08

---

## 1. 核心原则

**三个概念不是三个并列的「准备度分数」。** 它们检查三个不同对象，处于不同生命周期阶段：

| 后端概念 | C 端名称 | 检查对象 | 核心问题 |
|----------|----------|----------|----------|
| `PlanningReadiness` | 规划信息完整度 | 用户输入与旅行意图 | 信息够不够开始规划？ |
| `TripFeasibilityReport` | 行程可执行性 / 可执行证明 | 当前行程方案（绑定版本） | 这份计划按现在的安排能不能走？ |
| `TravelReadiness` | 出发准备 | 人、证件、装备与出发事项 | 用户是否已经准备好出发？ |
| `DepartureGate` | 可以出发 / 暂不能出发 | 计划 + 准备 + 验证时效 | 现在能不能出发？ |

**产品链路：**

```
用户表达旅行意图
        ↓
规划信息完整度（PlanningReadiness）
        ↓
生成行程方案
        ↓
行程可执行性验证 / 可执行证明（Feasibility）
        ↓
确认有效行程
        ↓
出发准备（TravelReadiness）
        ↓
出发门控（DepartureGate）
        ↓
行中持续验证（Today Execution Status）
```

**禁止：** 将三者加权合成「旅行总分」或三个并列圆环分数。

---

## 2. 规划信息完整度（PlanningReadiness）

### 2.1 职责

- 评估**输入信息完整性**，不是旅行质量，不是方案可行性
- 仅出现在：NL 建 trip、草稿初始化、规划助手追问阶段
- **有完整行程后退出主界面**

### 2.2 状态（流程枚举，非分数）

| 状态 | 含义 | C 端表达 |
|------|------|----------|
| `INSUFFICIENT` | 缺少基本信息 | 还需要一些基本信息 |
| `PARTIAL` | 部分信息 | 再补充 1 项即可开始规划 |
| `READY_FOR_STRATEGY` | 可生成策略 | 可以生成旅行方案 |
| `READY_FOR_ITINERARY` | 可生成详细行程 | 可以生成详细行程 |

### 2.3 两层门槛（目标模型）

| 层 | 字段 | 说明 |
|----|------|------|
| 最小规划门槛 | `minimumReadiness` | 目的地 + 日期或天数 → 允许生成初步策略 |
| 高质量规划 | `qualityCoverage` | 成员、交通、必去点、预算、节奏等 → 影响准确度，不阻塞 |

C 端示例：

> 已经可以开始规划  
> 补充成员和交通方式，可以让方案更准确。

### 2.4 不负责

路线验证、天气、证件、行程修复、出发门控

---

## 3. 行程可执行性 / 可执行证明（Feasibility）

### 3.1 职责

TripNARA 核心差异化能力。检查**当前计划版本**：

- 时间、路线、交通衔接、POI 开放、预约依赖
- 环境条件、团队适配、缓冲、完整度、体验目标
- 计划修复与替代方案

**绑定：** `tripVersion` · `validatedAt` · `evidenceObservedAt` · `isStale`

### 3.2 C 端命名分层

| 场景 | 表达 |
|------|------|
| 行程顶部状态 | 行程可执行性 |
| 徽章 | 已验证 / 需调整 / 不可执行 / 已过期 |
| 详情页 | 可执行证明 |
| 操作 | 重新验证 / 查看依据 / 查看调整方案 |

### 3.3 三层呈现

1. **行程级状态** — 首页 / 工作台持续显示  
2. **问题与修复** — 必须处理 / 建议调整 / 推荐方案  
3. **专业证明** — 证据、因果、反事实（Decision Checker 四 Tab）

信息顺序：**结论 → 为什么 → 怎么修 → 修完会怎样 → 依据**

### 3.4 权威门控（计划侧）

- 确认行程版本、发布给同行、标记规划完成
- 开始执行当天行程（计划维度）
- AI 自动修改后重新生效

**注意：** `planVerdict` 可执行 ≠ 用户可以出发

### 3.5 API SSOT

| 方法 | 路径 |
|------|------|
| GET | `/api/trips/:tripId/feasibility-report` |
| POST | `/api/trips/:tripId/feasibility-report/validate` |
| GET | `/api/trips/:tripId/decision-checker` |

---

## 4. 出发准备（TravelReadiness）

### 4.1 职责

**用户是否完成出发所需事项** — 任务管理与门控，不是方案可行性评分。

### 4.2 保留内容

| 域 | 示例 |
|----|------|
| 入境与法律 | 签证、护照、许可、驾照 |
| 医疗与保险 | 旅行险、常用药、疫苗 |
| 预订与凭证 | 酒店、租车、活动预约、Permit |
| 装备与穿搭 | 目的地/活动装备、打包清单 |
| 支付与通信 | 银行卡、SIM、插头、离线地图 |
| 应急准备 | 紧急联系人、救援号码 |

### 4.3 分数语义（若展示）

**必要准备事项完成度**，按 blocker / must / should / optional 加权。  
状态优先于数字：尚未开始 · 准备中 · 有阻塞项 · 基本就绪 · 已准备完成

### 4.4 应迁出至 Feasibility 的内容

见 [`READINESS_FEASIBILITY_MIGRATION.md`](../../src/trips/READINESS_FEASIBILITY_MIGRATION.md)

---

## 5. 出发门控（DepartureGate）

### 5.1 职责

**不重新计算规则**，聚合 `planVerdict` + `preparationVerdict` + `evidenceFreshness`。

| 状态 | 含义 |
|------|------|
| `READY` | 可以出发 |
| `BLOCKED_BY_PLAN` | 行程方案需调整或重新验证 |
| `BLOCKED_BY_PREPARATION` | 出发准备有阻塞项 |
| `BLOCKED_BY_BOTH` | 两者皆阻塞 |
| `REVALIDATION_REQUIRED` | 行程已变更，需重新验证 |

### 5.2 API

| 方法 | 路径 |
|------|------|
| GET | `/api/trips/:tripId/departure-gate` |

### 5.3 与 `canStartExecute` 的关系

- `feasibility-report.canStartExecute`：**仅计划侧**（历史字段，逐步 deprecated 为 `planVerdict.canExecutePlan`）
- `departure-gate.canStartExecution`：**计划 + 准备 + 验证时效** 的组合结论

---

## 6. 共享事实，分离结论

同一 prerequisite（如「冰川徒步预约未确认」）：

| 系统 | 投影 |
|------|------|
| 出发准备 | 必须完成：确认预约（deadline） |
| 可执行证明 | Day 4 暂未完全可执行 + 修复选项 |

共享 `prerequisiteId`；底层一条事实，两个 UI 面。

---

## 7. 生命周期主状态

| 阶段 | 主显示 | 辅助 |
|------|--------|------|
| 创建行程 | 规划信息完整度 | — |
| 初步规划 | 行程可执行性 | 规划完整度退后台 |
| 临行前 | 出发准备 | 可执行性：已验证 V12 |
| 行中 | 今日执行状态 | 当日 scoped feasibility |
| 已完成 | 归档 | 三概念不再作主状态 |

---

## 8. API 变更清单（分阶段）

### P0 — 已完成 / 进行中

- [x] `GET /trips/:tripId/departure-gate` — 组合门控读模型
- [x] `PRODUCT_READINESS_MODEL.md` — 本文档
- [x] `READINESS_FEASIBILITY_MIGRATION.md` — 迁移清单

### P1 — Readiness Score 收窄（已完成）

- [x] `/readiness/trip/:id/score` 移除 scheduleFeasibility / transportCertainty / buffers 计算
- [x] 停止 POI Access bridge 向 score 注入 findings
- [x] score 改为 Pack 出发准备六维 + overall
- [x] `feasibility-assembler.buildDimensions` 改从 issues 推导，overallScore 不再读 readiness.score
- [x] `mergeHighSeverityCoverageGapBlockers` 改为 no-op

### P2 — Prerequisite SSOT（已完成）

- [x] 引入 `TripPrerequisite` 实体与 `prerequisiteId` 双投影
- [x] `GET /trips/:tripId/prerequisites` — 共享事实读模型
- [x] Feasibility P0 issues 携带 `prerequisiteId`
- [x] 出发准备 / departure-gate 从 prerequisite 投影（替代 POI Access bridge 双写）
- [ ] Pack 签证/permit 纳入 prerequisite（后续；当前仍走 Pack-only 准备项）

### P3 — C 端阶段化

- [ ] 首页按 lifecycle 只突出一个主卡片
- [ ] `PlanningReadiness` 有完整行程后隐藏

### P4 — Repair Authority（已完成）

- [x] 写库 repair 统一到 `feasibility-report/apply-repair`（`repairAuthority: feasibility`）
- [x] `ReadinessRepairService` 拒绝非 feasibility authority 的方案 mutate
- [x] readiness `repair-options` / `apply-repair` 代理至 feasibility（方案类）或 prep-only
- [x] `/readiness/score` 移除 `cascadeUiHints`（改从 repair-options / causalPreAnalysis）
- [x] feasibility `getRepairOptions` 补全 cascade + guardian enrichment

### P5 — `canStartExecute` 语义拆分

- [ ] `feasibility-report` 增加 `planVerdict` 对象
- [ ] `canStartExecute` 标记 `@deprecated`，文档指向 `departure-gate.canStartExecution`

---

## 9. 战略优先级（面向用户）

```
可执行证明  >  出发准备  >  规划信息完整度
```

---

## 10. 相关文档

- [`src/trips/READINESS_FEASIBILITY_MIGRATION.md`](../../src/trips/READINESS_FEASIBILITY_MIGRATION.md)
- [`src/trips/trip-constraint-solver/TRIP_CONSTRAINT_SOLVER_API.md`](../../src/trips/trip-constraint-solver/TRIP_CONSTRAINT_SOLVER_API.md)
- [`src/trips/trip-constraint-solver/DECISION_CHECKER_API.md`](../../src/trips/trip-constraint-solver/DECISION_CHECKER_API.md)
- [`src/trips/trip-constraint-solver/DEPARTURE_GATE_API.md`](../../src/trips/trip-constraint-solver/DEPARTURE_GATE_API.md)
