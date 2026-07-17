# ADR-010: Nara Contextual Copilot — Page Insight Architecture

## Status

Accepted (2026-07-17) — 工程契约冻结；**DECISION_SPACE + ACTIVITY_EDITOR + ITINERARY_DAY_EDITOR + PLANNING_OVERVIEW Vertical Slice 已实现**（见本目录 `CopilotModule`）。

## Context

TripNARA 已具备 Travel Context / Constraint / Decision Runtime / Action Gateway，以及行中 `causalChain`、ADR-009 情境推荐等局部「Observe → Explain → Suggest → Execute」表面。产品侧已明确需要跨页的 **Nara Contextual Copilot**：在用户当前工作现场解释现状、指出值得注意处、给出可验证建议，并在确认后执行。

当前缺口不是概念扩展，而是统一工程契约尚未冻结：

| 未决问题 | 风险 |
|----------|------|
| 谁组装页面上下文 | 前端拼文案 → 过期 / 注入 / 前后端不一致 |
| 谁判断 AI 是否出现 | 每页各写启发式 → 打扰或沉默不统一 |
| Insight 实时算还是读缓存 | 成本高、闪烁、建议不稳定 |
| 页面可注册哪些动作 | LLM 自由参数直写行程 |
| Draft 如何与 Canonical 合并 | 未保存编辑被忽略或被当成权威 |
| Insight 失效后如何处理 | 过期建议误导用户 |
| Web / iOS 是否同契约 | 双端分叉，无法共享反馈与缓存 |

继续让五个页面分别开发「页内 AI」会固化体验分裂，与 [TRIPNARA_AI_NATIVE_POSITIONING](../../../internal-docs/product/TRIPNARA_AI_NATIVE_POSITIONING.md) 的收敛战略相悖。

## Decision

建设统一的 **Page Insight 层**（产品名：Nara Contextual Copilot）。  
**不**为每个页面新建独立 Agent；**不**把 Copilot 做成新的决策引擎。

### 1. 架构与职责边界（不可违反）

```text
Travel World / Constraint / Decision Runtime
                    ↓
          Page Insight Orchestrator
                    ↓
       Explain / Suggest / Present
                    ↓
           Preview / Confirm
                    ↓
             Action Gateway / Decision Write Path
```

| 组件 | 可以 | 不可以 |
|------|------|--------|
| **Page Context Assembler** | 用 ClientPageState 引用重取权威数据；合并 Draft Delta | 信任前端正文为事实；把 UI 文案当 Evidence |
| **Page Insight Orchestrator** | 聚合上下文；选最重要问题；生成解释与结构化建议；绑定已有动作 | 创造安全规则；绕过 Decision Core；直接改 Canonical Plan；将 LLM 结论当权威证据 |
| **LLM（可选）** | 组织叙事、排序候选解释、润色 recommendation 文案 | 硬约束判定、可行性权威结论、自由参数写行程 |
| **Page AI Contract** | 声明焦点维度、触发策略、允许的 insight/action 类型 | 替代约束引擎；在 Prompt 文件里藏业务红线 |
| **Action Gateway / 既有写链** | Preview → Validate → Confirm → Ledger | 被 Insight 绕过 |

**三条工程红线：**

1. **Contextual** — 不是通用聊天入口的页面复刻。  
2. **Evidence-grounded** — 判断来自 Constraint / Decision / World / Readiness；LLM 只解释。  
3. **Confirmable execution** — Insight 不静默改行程；写操作必须走既有 Preview → Confirm。

### 2. Page Context 两段式（对齐 ADR-009）

**不要**把前端提交物称为完整 Page Context。

```text
ClientPageState          （前端提交：引用 + 临时 UI + draftRef）
        ↓
AuthoritativePageContext （服务端组装：Trip / World / Constraint / Decision / Readiness / Entities / DraftDelta / AvailableActions）
        ↓
推理输入 = Canonical Snapshot ⊕ Draft Context Delta ⊕ Current Page Focus
```

| 层 | 所有者 | 内容 |
|----|--------|------|
| `ClientPageState` | 客户端 | `pageId`、`lifecycle`、`selectedRefs`、`viewport`、`draftRef`、`recentAction` |
| `AuthoritativePageContext` | 服务端 | `tripSnapshot`、`relevantWorldState`、`constraintAssessments`、`decisionProblems`、`readinessProjection?`、`selectedEntities`、`draftDelta?`、`availableActions` |

Draft 合并规则：

- `draftRef` 仅标识草稿身份与 revision；**内容由服务端按 draftId 读取**，不接受前端内联全文 Plan。  
- 无 `draftRef` 或 revision 过期 → `draftDelta` 为空，按 Canonical 评估。  
- Draft 与 Canonical 冲突时，Insight 必须标明「基于未保存草稿」；写回仍经 Gateway，不得把 draft 静默提升为 Canonical。

类型 SSOT：[`contracts/page-insight.types.ts`](./contracts/page-insight.types.ts)。

### 3. Page AI Contract（代码/可版本化配置，非 Prompt）

每个页面注册一份 `PageAIContract`：

- `userGoal`、相关投影与实体类型、是否含 Draft Delta  
- `focusDimensions`、`supportedInsightTypes`、`allowedActionTypes`  
- `proactivePolicy`（attention / intervention 触发、`maxVisibleInsights`、cooldown）  
- `presentation.defaultSurface`  
- **`pageContractVersion`** — 进入 `contextHash`

新增页面 = 接 ClientPageState + 注册 Contract + 声明允许动作 + 接呈现组件。  
**P0 Vertical Slice：** `DECISION_SPACE`（见 [`contracts/page-ai-contracts.ts`](./contracts/page-ai-contracts.ts)）。

### 4. Insight 计算与缓存（contextHash）

**禁止**对整份 Authoritative JSON 做 hash（无关字段抖动会导致反复触发）。

```text
contextHash = hash(
  pageContractVersion
  + pageId
  + lifecycle
  + selectedEntityRefs   （规范化排序后的 refs）
  + relevantTripProjectionVersion
  + relevantConstraintVersion
  + relevantDecisionWorkspaceVersion
  + relevantWorldStateVersion
  + draftRevision
)
```

相关字段集合由 **该页 PageAIContract** 决定（例如团队页不含 mapBounds；地图页不含用户头像）。

| 触发 evaluate | 不触发（复用缓存） |
|---------------|-------------------|
| 首次进入页面 | `contextHash` 未变 |
| 切换日期 / 选中对象 | 无关 viewport 抖动（合同未声明） |
| 增删移活动、行程版本变更 | |
| 约束评估 / Decision Workspace / World 版本变更 | |
| 用户主动「问 Nara」或解释某对象（可带 `forceRefresh`） | |

缓存策略：

- `contextHash` 命中且未过期 → 返回已存 Insight（含 `mode: SILENT`）。  
- `expiresAt` 到期或权威版本超前 → `STALE`；客户端应重新 `evaluate`，**不得**继续展示可执行 COMMAND。  
- LLM 不可用时：Orchestrator 可返回基于规则的 SILENT / 最小 EXPLANATION；**页面主体功能不受影响**。

### 5. 展示模式与优先级

| mode | 产品态 | 典型触发 |
|------|--------|----------|
| `SILENT` | 轻量「问 Nara」入口 | 无问题；或决策空间队列已展示的常规待决（无额外洞察） |
| `ATTENTION` | 轻提示，点击展开 | 方案实质分歧、证据过期；或用户显式「问 Nara」 |
| `INTERVENTION` | 主动展示建议 | 阻塞决策、安全相关 |

**Decision Space 特例：** 单独的「有未解决 DecisionProblem」**不**构成 proactive ATTENTION（列表即表面）。Contract `attentionTriggers` 以 `MATERIAL_OPTION_DIVERGENCE` / `STALE_EVIDENCE` / `EXPLICIT_ASK` 为准（`decision_space@1.1`）。

| priority | 展示倾向 |
|----------|----------|
| `P0` | 顶部 / 强制可见 |
| `P1` | 页内洞察卡 / Rail |
| `P2` | 仅「问 Nara」面板 |

默认：**一次 evaluate 最多返回一个主 Insight**（`maxVisibleInsights` 由 Contract 收紧，默认 1）。  
无有效建议 → **必须** `mode: SILENT`，禁止强行生成闲聊。

### 6. Action 三类分离

Insight **只绑定引用**，不返回可直写的自由参数：

| kind | 含义 | 写行程？ |
|------|------|----------|
| `NAVIGATION` | 跳转页面 / 聚焦实体 | 否 |
| `PREVIEW` | 打开既有 Preview / Compare / What-if / Decision | 否（只读或预览） |
| `COMMAND` | 引用已有 `commandRef`；`requiresConfirmation` + `validationRequired` 恒为 true | 是，且仅经 Action Gateway / Decision 写链 |

禁止：前端根据 LLM 生成的自由字段拼 `APPLY` body。

### 7. API 面（Web / iOS 同一契约）

| Method | Path | 作用 |
|--------|------|------|
| `POST` | `/api/trips/:tripId/copilot/page-insights:evaluate` | 上下文评估；不写行程 |
| `GET` | `/api/trips/:tripId/copilot/page-insights/:insightId` | 恢复 / 多端同步 / 证据与动作状态 |
| `POST` | `/api/trips/:tripId/copilot/page-insights/:insightId/feedback` | 用户反馈（支撑后续个性化） |

Mobile 别名（实现时）：`/api/mobile/trips/:tripId/copilot/...`，**响应 schema 与 Web 相同**。

完整请求/响应见 [PAGE_INSIGHT_API.md](./PAGE_INSIGHT_API.md)。

### 8. P0 范围与非目标

**P0 做：**

1. 冻结本 ADR 六部分契约：`ClientPageState`、`AuthoritativePageContext`、`NaraPageInsight`、`PageAIContract`、`contextHash`、`InsightAction`。  
2. Vertical Slice：**决策空间** — 进入页 → 组装权威上下文 → 结构化 Insight → 解释/推荐 → 打开**现有** Decision Preview；**不新增写入通道**。  
3. Web / iOS 共用同一 Insight schema。

**P0 不做：**

- 五个页面并行接入  
- 页面专属 Agent / 万能 Prompt  
- LLM 不可用时阻塞页面  
- 产品 SSOT 全文（待差距清单与契约稳定后再冻结）  
- P3 个性化模型（仅落 feedback 埋点）

**建议后续页面顺序：**  
决策空间 → **活动编辑（对象级）** → 日程编排（日期级）→ 规划概览（行程级）→ 执行首页（实时）。地图路线另排。

客户端须提交互斥的 `pageMode` + `insightScope`，避免上下文串页：

| pageId | pageMode | insightScope |
|--------|----------|--------------|
| `ACTIVITY_EDITOR` | `ACTIVITY_EDITOR` | `ACTIVITY` |
| `ITINERARY_DAY_EDITOR` | `ITINERARY_DAY_EDITOR` | `ITINERARY_DAY` |
| `PLANNING_OVERVIEW` | `PLANNING_OVERVIEW` | `TRIP` |
| `EXECUTION_HOME` | `EXECUTION_HOME` | `EXECUTION` |

### 9. P0 验收标准

1. 同一 `contextHash` 重复 evaluate → 稳定结果（同一 insight 语义 / 可复用 id）。  
2. 客户端只提交引用与临时 UI 状态。  
3. 服务端按引用重读权威 Trip / Decision / Constraint 数据。  
4. 返回结构化 `NaraPageInsight`，前端不解析 Markdown 作主交互。  
5. Insight 可追溯到 `evidenceRefs` / Decision Problem / causal chain refs。  
6. AI / Orchestrator 不直接执行写操作。  
7. 所有写操作复用既有 Preview → Validate → Confirm → Ledger。  
8. 无有效建议 → `SILENT`，不强行生成段落。  
9. Web 与 iOS 使用同一 Insight 契约。  
10. LLM 不可用时，页面主体功能不受影响。

## Consequences

### Positive

- 跨页 AI 能力收敛到一条 Orchestrator，避免五套页内 Agent。  
- 与 ADR-006/007/009、Travel Context Protocol 边界一致：解释在上、决策与写入在下。  
- feedback + contextHash 为后续个性化与成本控制留接口。

### Negative / Trade-offs

- 首版需先投契约与 Assembler，页面「可见 AI」会晚于愿景文案。  
- Draft Delta 合并语义需与日程编排草稿系统对齐（P0 决策空间可先不含 draft）。  
- SILENT 为主时，产品需接受「多数时候只有轻入口」——这是刻意的打扰控制。

### Follow-ups

1. 首批五页差距矩阵（第二优先，本 ADR 合入后）。  
2. 产品 SSOT：Nara Contextual Copilot 定义与三原则（第三优先）。  
3. 实现模块落点建议：`src/trips/copilot/`（本目录）；编排读 `decision-runtime` / readiness / constraint，写仅转发既有 Gateway。

## Related

- [PAGE_INSIGHT_API.md](./PAGE_INSIGHT_API.md)  
- [ADR-009 Contextual Same-Day Micro-Planning](../contextual-recommendations/ADR-009-Contextual-Same-Day-Micro-Planning.md)  
- [ADR-007 Decision Runtime v2](../../decision-runtime/ADR-007-Decision-Runtime-v2.md)  
- [RFC-003 Travel Context Protocol](../../../internal-docs/product/rfc-travel-context-protocol-v1.md)  
- [TRIPNARA_AI_NATIVE_POSITIONING](../../../internal-docs/product/TRIPNARA_AI_NATIVE_POSITIONING.md)  
- [DECISION_SPACE_BUNDLE_API](../decision-semantics/DECISION_SPACE_BUNDLE_API.md)（P0 slice 复用读面）  
- [AGENT_UNIFIED_INTERFACE_SCOPE](../../agent/delivery/AGENT_UNIFIED_INTERFACE_SCOPE.md)（Action Execution 写面；Copilot 不替代）
