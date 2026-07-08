# TripNARA AI Native 产品定位与收敛战略

**文档版本：** 1.0.0  
**文档状态：** 内部 SSOT（产品 / 架构 / 前端 / 研究共用）  
**生效日期：** 2026-07-04  
**维护原则：** 本文描述 TripNARA **当前能力边界**与**下一阶段产品目标**；工程实施细节以 Decision Runtime Roadmap 为准，研究场景以 Exploration PRD 为准。

**相关文档：**

- [Decision Runtime 成熟度](../../src/decision-runtime/DECISION_RUNTIME_MATURITY.md)
- [Decision Runtime Roadmap](../../src/decision-runtime/DECISION_RUNTIME_ROADMAP.md)
- [Agent 统一接口范围](../../src/agent/delivery/AGENT_UNIFIED_INTERFACE_SCOPE.md)
- [探索规划与可靠性决策闭环 PRD V1.1](../exploration/prd-exploration-reliability-closure-v1.1.md)
- [Travel Decision Contract 前端 API](../../src/trips/trip-constraint-solver/TRAVEL_DECISION_CONTRACT_FRONTEND_API.md)
- [Exploration API 清单](../../src/trips/exploration/EXPLORATION_API.md)
- [RFC-003 Travel Context Protocol](./rfc-travel-context-protocol-v1.md)（含 Harness 一体化 §9）
- [旅行决策基础设施 — 产品叙事与融资框架](./tripnara-decision-infrastructure-narrative-v1.md)（VC 叙事 / Compiler+Runtime / 算法栈）

---

## 1. 一句话定位

### 1.1 当前（对外 / 对内统一口径）

> **TripNARA 是一个 AI 旅行决策与可靠性系统：它不仅生成行程，还会验证约束、识别风险、比较方案，并帮助用户把修改落实到可执行计划中。**

### 1.2 能力本质（对内技术表述）

> **TripNARA 已经具备 AI 原生旅行决策系统的核心骨架，但目前仍是「用户触发的智能决策系统」，还不是「持续对旅行结果负责的自治旅行系统」。**

关键区别不在于 AI 会不会规划、会不会判断，而在于：

| 现在 | 目标 |
|------|------|
| 用户发起请求，系统响应 | 系统持续感知变化，主动推进结果 |
| 多模块各自展示专业能力 | 用户只看到一个旅行闭环 |
| 发现问题 + 给出建议 | 发现 → 修复 → 写回 → 复核 完整闭环 |

### 1.3 不应使用的表述

| 过度承诺（禁止） | 过度降级（禁止） |
|------------------|------------------|
| 「全自动 AI 旅行管家」 | 「AI 行程规划工具」 |
| 「把旅行交给我，我会持续帮你确保它能执行」 | 「和 ChatGPT 一样的行程生成器」 |

---

## 2. 四阶段成熟度模型

| 阶段 | 产品能力 | TripNARA 状态 | 说明 |
|------|----------|---------------|------|
| **Phase 1** | AI 生成内容和行程 | **已完成** | `route_and_run`、Planner、Exploration 候选装配 |
| **Phase 2** | AI 判断风险、比较方案、写回行程 | **基本具备** | Constraint Gateway、DecisionProblem、evaluate → authorize → execute |
| **Phase 3** | AI 持续监控、主动发现问题、触发重规划 | **刚起步** | 检测骨架在；Trigger / Replan 治理未产品化；Exploration PRD 3.3 明确非目标 |
| **Phase 4** | AI 在授权边界内自动执行并对结果负责 | **尚未形成** | `TravelDecisionContract.automation` 有模型，未接入执行链 |

**结论：** TripNARA 不是普通 AI 行程生成器，但也还不能宣称 Phase 3–4 的自治能力。

---

## 3. 当前能力快照（2026-07）

### 3.1 已具备（Phase 1–2）

- 自然语言建行程、Agent 主入口（`route_and_run`）
- 目的地规则、约束评估、BLOCK / CONFLICT / VERIFY 问题生成
- DecisionProblem、多修复方案、方案比较（`comparisonView`）
- 权威写链：evaluate → authorize → execute → Effective Plan（Executor 成熟度 ~4/5）
- Exploration Consumer API：check → issues → options → apply → revalidate（后端 Sprint 0.5–5）
- `TravelDecisionContract`：目标、硬软约束、变化策略、自动化授权模型

### 3.2 结构性问题（收敛前不可加功能掩盖）

> **能力不是不够，而是没有形成一条默认、连续、对用户可感知的主链。**

| 分裂类型 | 表现 |
|----------|------|
| **编排分裂** | `route_and_run`、Exploration、Planning Assistant、Decision Center 并存 |
| **状态分裂** | Planner / Gateway / JourneyState / Decision Center 各读各的上下文 |
| **约束事实分裂** | Canonical Gateway vs Legacy boolean vs 前端启发式 `feasibilityScore` |
| **体验分裂** | 用户需进入规划页、可行性报告、约束中心、决策中心、Plan B、行中助手 |

继续增加 Agent、评分、规则、Decision Problem 类型、Destination Pack、研究模块，会让后端更强，但用户仍感觉：**「我需要进入不同页面，自己理解系统，再决定该做什么。」**

---

## 4. 下一阶段战略：收敛，而非扩能力

### 4.1 产品目标（下一阶段）

> **从「用户触发的旅行决策系统」，升级为「持续感知变化、主动维护行程可执行性的 AI Native 旅行系统」。**

### 4.2 三件核心事（完成后用户才能「感受到」AI Native）

| # | 核心事 | 一句话 |
|---|--------|--------|
| 1 | **统一入口** | 所有用户意图经同一 Intent → Gateway 主链 |
| 2 | **Trip World State** | 所有规划 / 验证 / 修复 / 重规划从同一 Snapshot 开始 |
| 3 | **监控—修复—写回—复核闭环** | 有限变量上跑通一条完整变化闭环 |

---

## 5. 五件收敛优先级（P0–P1）

### 5.1 建立唯一的旅行 AI 主入口

**无论用户说：**

- 帮我规划冰岛
- 第三天太累
- 明天下雨怎么办
- 这个行程能走吗
- 帮我换一个住宿
- 有哪些问题需要处理

**都应进入同一条内部主链：**

```text
User Intent
  → Trip Context Snapshot
  → Canonical Decision Gateway
  → Plan / Validate / Repair / Explain
  → Decision Queue
  → Apply（authorize → execute）
```

**用户不应感知到的内部模块（仅作路由）：**

- `route_and_run`
- Exploration Flow Orchestrator
- Planning Assistant
- Readiness
- Decision Center
- Legacy Decision Semantics

**工程落点：**

| 组件 | 路径 / 状态 |
|------|-------------|
| Decision Trigger Gateway | `src/decision-runtime/trigger/decision-trigger.gateway.service.ts`（P1 骨架） |
| Agent 统一入口 | `POST /api/agent/route_and_run` |
| Exploration Orchestrator | `src/trips/exploration/`（研究壳，非终态 UX） |
| Provider 收敛 | [DECISION_RUNTIME_ROADMAP §3 Layer 1 — Agentic](../../src/decision-runtime/DECISION_RUNTIME_ROADMAP.md) |

**验收：** 任意上述用户语句经同一 Gateway 产出 `DecisionRunRequest`；前端只有一个对话 / 意图入口 + 一个「我的旅行」状态页。

---

### 5.2 建立真正的 Trip World State

**现状：** 多状态模型并存（`TripContextState`、`DecisionState`、`AgentMemoryContext`、`TravelDecisionContract`、`JourneyState`），缺强制「所有链路默认读同一份 Snapshot」契约。

**World State 至少统一包含：**

| 域 | 说明 |
|----|------|
| Trip Goal | 用户目标与原则排序 |
| Members | 成员与决策权限 |
| Preferences | 偏好画像 |
| Hard / Soft Constraints | 来自 `TravelDecisionContract` |
| Effective Plan | 当前可执行行程 |
| Bookings | 预订与预约状态 |
| Budget | 预算与已花费 |
| World Facts | 道路、天气、POI 营业时间等 |
| Uncertainties | 待核实项 |
| Open Decisions | 待处理 DecisionProblem |
| Monitoring Items | 监控订阅与上次复核 |
| Decision History | 决策账本 |
| Automation Authorization | 自动化授权级别 |

**关键原则：** 不是再建一张表，而是规定——**所有规划、验证、修复和重规划，都必须从同一个 Trip Context Snapshot 开始。**

**工程落点：**

| 组件 | 路径 |
|------|------|
| World State Snapshot | `src/decision-runtime/snapshot/`、`guardian-decision-core/evidence/world-state-store.service.ts` |
| Travel Decision Contract SSOT | `src/trips/trip-constraint-solver/` |
| Agent Memory Contract | `src/agent/memory/interfaces/agent-memory-context.interface.ts` |

**验收：** 新增链路 PR 须声明读取的 Snapshot 版本；Planner / Gateway / Monitoring 对同一 trip 的约束视图一致。

---

### 5.3 把「持续监控」缩成一个可落地 MVP

**不需要**一开始做全球实时自治系统。

**MVP 监控变量（5 类）：**

1. 道路关闭  
2. 严重天气预警  
3. 航班取消或延误  
4. POI 临时关闭  
5. 预约状态变化  

**最小闭环：**

```text
世界状态变化
  → 找出受影响的行程项
  → 生成 Decision Problem
  → 生成 2–3 个修复方案
  → 根据 Automation Authorization 决定自动处理或请求确认
  → 写回 Effective Plan
  → 重新验证
```

**工程落点：**

| 组件 | 状态 |
|------|------|
| `RealtimeWorldStateService.detectChanges` | 检测骨架 ✅ |
| `DecisionKernelService.shouldReplan` | 触发判断 ✅ |
| `AutoRepairService` | 替换逻辑 TODO ⚠️ |
| ReplanningTriggerPolicy | 待 Sprint 7 |
| Exploration PRD §3.3 | 当前为非目标 — **Phase 3 启动须改 scope** |

**验收：** 至少 1 条端到端 fixture（如冰岛 F208 封闭 / 强风预警）完成上述闭环；含自动授权与需确认两条路径。

---

### 5.4 用户只看到「需要我决定什么」

**现在：** Decision Center 像系统问题列表（BLOCKER、engineId、flow、canonicalSummary…）。

**目标：** Consumer Decision Queue — 例如：

```text
今天需要你决定 2 件事

① 冰川徒步可能受强风影响
   系统建议：调整到第 4 天
   · 保留冰川体验 · 不增加预算 · 增加 35 分钟驾驶

   [接受推荐]  [保留原计划]  [查看其他方案]
```

**内部语义**（Gateway 命中、flow 类型、resolution route）存在于「查看依据」，**不出现在主界面**。

**工程落点：**

| 组件 | 说明 |
|------|------|
| Unified Decision ReadModel | `UnifiedDecisionProblemReadModelService` |
| Consumer 投影 | Exploration `ConsumerExplorationIssuesService`（研究期参考） |
| 待建 BFF | `GET /trips/:id/travel-status` 或 `decision-queue` consumer 投影 |

**验收：** 主界面零 engineering 术语；用户 30 秒内理解「要决定什么」和「推荐方案取舍」。

---

### 5.5 定义 AI 的自动化权限边界

`TravelDecisionContract.automation` 已有四级模型；需**产品化并接入 authorize / execute 链**。

**建议简化为三级（对用户）：**

| 级别 | 行为 | 示例 |
|------|------|------|
| **自动完成** | 无需确认直接执行 | 重新计算、更新风险状态、补充 Plan B、调整提醒、标记待确认 |
| **自动建议，用户确认** | 生成方案 + 一键接受 | 调整活动顺序、替换 POI、修改出发时间、改变单日路线 |
| **必须明确授权** | 阻断直到用户显式授权 | 更换酒店、增加预算、取消预约、删除核心体验、接受明显风险 |

**验收：** `AuthorizationPolicyGateway` 读取 contract.automation；自动完成类问题 closure_rate 可统计且无需用户进入 Decision Center。

**工程落点：**

- [Travel Decision Contract API §automation](../../src/trips/trip-constraint-solver/TRAVEL_DECISION_CONTRACT_FRONTEND_API.md)
- `AuthorizationPolicyGateway`（待建，见 [DECISION_RUNTIME_ROADMAP §Authorization](../../src/decision-runtime/DECISION_RUNTIME_ROADMAP.md)）

---

## 6. 目标产品体验：「我的旅行」单一闭环

**现在（多中心）：**

```text
规划页 → 可行性报告 → 约束中心 → 决策中心 → Plan B → 行中助手
```

**目标（单页汇总）：**

```text
我的旅行
├── 当前状态（是否可执行）
├── AI 已完成的工作
├── 需要我决定的事情        ← Consumer Decision Queue
├── 即将自动复核的事项      ← Monitoring MVP
└── 当前可执行行程          ← Effective Plan 投影
```

Decision Center、Readiness、Exploration 降级为**子视图或 deep link**，不是用户主路径。

**待建读模型（示意）：**

```text
GET /trips/:id/travel-status
  ← Effective Plan 投影
  ← Unified Decision Problem Queue（consumer 投影）
  ← Monitoring Items（MVP 5 类）
  ← Automation Authorization 摘要
  ← AI 已完成工作 / 待复核事项
```

---

## 7. 核心指标（替代 Agent 调用成功率）

| 指标 | 定义 | 目标方向 |
|------|------|----------|
| **用户干预率** | 用户必须亲自进入模块手动处理的 problem 数 / 总 problem 数 | ↓ 非零；用户只参与高价值、不可替代的决定 |
| **旅行闭环覆盖率** | 完成「发现 → 解释 → 替代 → 确认/授权 → 写回 → revalidate」的 problem 数 / 总 problem 数 | ↑ |

**不应再作为主要成功指标：** 生成行程成功率、Decision Problem 数量、Constraint 命中率、Agent 调用成功率（只能说明后端忙，不能说明 AI Native 成熟）。

**埋点建议（Exploration 研究协议扩展）：**

| 事件 | 用途 |
|------|------|
| `decision_problem_detected` | 闭环起点 |
| `decision_closure_completed` | 写回 + revalidate 成功 |
| `user_intervention_required` | 用户进入 Decision Center 手动处理 |
| `automation_auto_applied` | 自动授权路径完成 |

现有 `batchResearchEvents`（`decision_applied`、`feasibility_check_completed` 等）可扩展，见 [Exploration 前端集成](../exploration/frontend-integration-guide.md)。

---

## 8. Exploration 与研究期的定位说明

**Exploration MVP 是 Phase 2 可靠性验证壳，不是 Phase 3+ 的最终交互形态。**

| 维度 | Exploration（研究期） | AI Native（目标期） |
|------|----------------------|---------------------|
| 入口 | 结构化原则卡片 + 路线比较 | 自然语言 Intent → 统一 Gateway |
| 目的 | 验证 H1–H5（探索 / 取舍 / 可靠性 / 决策 / 商业承诺） | 持续维护行程可执行性 |
| 后端 | 复用 Canonical Runtime + Unified ReadModel | 同左，加 Monitoring 闭环 |
| 前端 | 独立页面流（见 [frontend-routes-scaffold](../exploration/frontend-routes-scaffold.md)） | 「我的旅行」单页 |

**避免误区：** 不要把 Exploration 卡片流当成终态产品 UX；研究完成后入口应收敛到 §5.1 统一 Intent 链。

---

## 9. 与工程 Roadmap 的对齐

本文（产品层）与 [DECISION_RUNTIME_ROADMAP](../../src/decision-runtime/DECISION_RUNTIME_ROADMAP.md)（工程层）表述一致：

| 产品优先级 | 工程 Roadmap |
|------------|--------------|
| 统一入口 | P1 Decision Trigger Gateway + Agent Provider 收敛 |
| Trip World State | Canonical WorldStateSnapshot 强制契约 |
| 监控 MVP | P2/P3 Monitoring + ReplanningTriggerPolicy |
| 用户决策队列 | Consumer BFF + Unified ReadModel 投影 |
| 自动化边界 | P2 Authorization Policy Gateway |

**工程当前阶段：** Production Transition — 证明六层成为生产默认链路，而非继续搭建骨架。

---

## 10. AI Native 闭环（目标形态）

```text
理解意图 → 生成方案 → 验证可执行性 → 发现问题 → 给出替代 → 用户确认/自动授权 → 持续监控 → 自动重规划
```

| 环节 | 当前 | 目标 |
|------|------|------|
| 理解意图 | ~65% | 统一 NL 入口 |
| 生成方案 | ~75% | 保持，收敛 Provider |
| 验证可执行性 | ~60% | Gateway 默认 ON |
| 发现问题 | ~65% | 保持 |
| 给出替代 | ~60% | Repair Provider 统一 |
| 用户确认 / 自动授权 | ~70% / ~20% | automation 接入执行链 |
| 持续监控 | ~25% | MVP 5 类变量 |
| 自动重规划 | ~20% | 一条 fixture 闭环 |

---

## 11. 变更记录

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0.0 | 2026-07-04 | 初版：四阶段定位、五收敛优先级、两核心指标、Exploration 关系、Roadmap 对齐 |
