# Nara Contextual Copilot — Page Insight API

**ADR:** [ADR-010](./ADR-010-Nara-Contextual-Copilot-Page-Insight.md)  
**TS 契约:** [`contracts/page-insight.types.ts`](./contracts/page-insight.types.ts) · [`contracts/page-ai-contracts.ts`](./contracts/page-ai-contracts.ts)  
**Schema:** `tripnara.nara_page_insight@v1`

跨页面上下文解释 / 建议 / 执行协助。Web 与 iOS **消费同一响应契约**；Mobile 仅路径加 `/mobile` 前缀。

**本 API 不写入行程。** 写操作只通过 Insight 返回的 `PREVIEW` / `COMMAND` 引用，进入既有 Decision / Action Gateway。

---

## Endpoints

| Method | Path | 说明 |
|--------|------|------|
| POST | `/api/trips/:tripId/copilot/page-insights:evaluate` | 评估当前页上下文，返回主 Insight（或 SILENT） |
| GET | `/api/trips/:tripId/copilot/page-insights/:insightId` | 按 id 读取已生成 Insight |
| POST | `/api/trips/:tripId/copilot/page-insights/:insightId/feedback` | 用户反馈埋点 |

**Mobile 别名（实现时）：**

| Method | Path |
|--------|------|
| POST | `/api/mobile/trips/:tripId/copilot/page-insights:evaluate` |
| GET | `/api/mobile/trips/:tripId/copilot/page-insights/:insightId` |
| POST | `/api/mobile/trips/:tripId/copilot/page-insights/:insightId/feedback` |

**鉴权:** Bearer JWT（与既有 trips API 一致）

---

## 1. Evaluate — `POST .../page-insights:evaluate`

### 为什么用 POST

- 页面状态结构复杂，含 Draft 引用与 recentAction  
- 不适合 query string  
- 语义是**上下文评估**，不是简单资源 GET  
- 服务端**不**执行行程写入

### Request body

```json
{
  "pageId": "DECISION_SPACE",
  "lifecycle": "PLANNING",
  "selectedRefs": [
    {
      "entityType": "DECISION_PROBLEM",
      "entityId": "dp_abc123"
    }
  ],
  "viewport": {
    "activeTab": "options",
    "selectedDayId": null
  },
  "draftRef": null,
  "recentAction": {
    "type": "OPEN_DECISION",
    "targetRef": {
      "entityType": "DECISION_PROBLEM",
      "entityId": "dp_abc123"
    }
  },
  "forceRefresh": false,
  "locale": "zh-CN"
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `pageId` | 是 | 见 `PageId`；live：`DECISION_SPACE`、`ACTIVITY_EDITOR`、`ITINERARY_DAY_EDITOR`、`PLANNING_OVERVIEW`、`EXECUTION_HOME` |
| `lifecycle` | 是 | `PLANNING` \| `TRAVELING` \| `COMPLETED` |
| `pageMode` | 活动/日程/概览/执行必填 | `ACTIVITY_EDITOR` \| `ITINERARY_DAY_EDITOR` \| `PLANNING_OVERVIEW` \| `EXECUTION_HOME` |
| `insightScope` | 同上 | `ACTIVITY` \| `ITINERARY_DAY` \| `TRIP` \| `EXECUTION`；须与 pageMode 对齐 |
| `selectedRefs` | 否 | 实体引用；服务端重取投影，不信任客户端描述文案 |
| `viewport` | 否 | 临时 UI；活动页可用 `selectedDayIndex`（1-based） |
| `draftRef` | 否 | `{ draftId, revision }`；正文由服务端加载 |
| `draftRevision` | 否 | 顶层草稿版本（可与 draftRef.revision 同值） |
| `recentAction` | 否 | 刚发生的用户操作提示（非权威事实） |
| `forceRefresh` | 否 | 默认 false；true 时忽略未过期缓存（「问 Nara」） |
| `locale` | 否 | 叙事语言；不影响决策结论 |

**活动编辑页 evaluate 示例：**

```json
{
  "pageId": "ACTIVITY_EDITOR",
  "pageMode": "ACTIVITY_EDITOR",
  "insightScope": "ACTIVITY",
  "lifecycle": "PLANNING",
  "selectedRefs": [
    { "entityType": "POI", "entityId": "12345" },
    { "entityType": "DAY", "entityId": "3" }
  ],
  "viewport": { "selectedDayIndex": 3 },
  "forceRefresh": false
}
```

`PREVIEW_ADD_ACTIVITY` 的 `payloadRef` 形如 `plan-proposal:{proposalId}`，用 `resolvePlanProposalFromPayloadRef` 打开现有 arrange-itinerary proposal。详见 [ACTIVITY_EDITOR_AI_POLICY.md](./ACTIVITY_EDITOR_AI_POLICY.md)。

**日程编排页 evaluate 示例：**

```json
{
  "pageId": "ITINERARY_DAY_EDITOR",
  "pageMode": "ITINERARY_DAY_EDITOR",
  "insightScope": "ITINERARY_DAY",
  "lifecycle": "PLANNING",
  "selectedRefs": [{ "entityType": "DAY", "entityId": "3" }],
  "viewport": { "selectedDayIndex": 3 },
  "forceRefresh": false
}
```

详见 [ITINERARY_DAY_EDITOR_AI_POLICY.md](./ITINERARY_DAY_EDITOR_AI_POLICY.md)。查因看 `evaluation.dayPlanStatus`（`INCOMPLETE` / `BLOCKED` / `TIGHT` / `OPTIMIZABLE` / `READY`）；按钮只跟 `insight.actions[]`。

**规划概览 evaluate 示例：**

```json
{
  "pageId": "PLANNING_OVERVIEW",
  "pageMode": "PLANNING_OVERVIEW",
  "insightScope": "TRIP",
  "lifecycle": "PLANNING",
  "forceRefresh": false
}
```

详见 [PLANNING_OVERVIEW_AI_POLICY.md](./PLANNING_OVERVIEW_AI_POLICY.md)。仅导航动作，不返回选项选择。

**执行首页 evaluate 示例：**

```json
{
  "pageId": "EXECUTION_HOME",
  "pageMode": "EXECUTION_HOME",
  "insightScope": "EXECUTION",
  "lifecycle": "TRAVELING",
  "forceRefresh": false
}
```

详见 [EXECUTION_HOME_AI_POLICY.md](./EXECUTION_HOME_AI_POLICY.md)。动作：`ACKNOWLEDGE_RISK` / `PREVIEW_PLAN_CHANGE` / `OPEN_DECISION`；查因看 `evaluation.execSeverity` 等。

**禁止客户端提交：** 完整行程 JSON、约束结论、自然语言「页面全文」、可写动作参数。

### 顾问短文 `advisorCopy`

非 `SILENT` 时 Insight 会带 `advisorCopy: { title, body, advice }`（Nara 顾问角色，限字）。前端**只渲染这三行**；`observation` / `recommendation` 为兼容字段，勿再铺满 causal 卡。无重要问题时 LLM/规则可强制 `SILENT`（`modeReason=ADVISOR_SILENT`）。

**租车保险 / 车型：** Context Builder 组装行程事实。车型缺 `ROUTE_SUMMARY`/`ROAD_EXPOSURE`、保险缺路线或车辆 → `modeReason=CONTEXT_MISSING`，**不调 LLM**。查因：`evaluation.vehicleContextGate` / `insuranceContextGate`。

保险档位由行程暴露决定；**禁止**因「涉水各档均不保」推荐基础 CDW。RAG / 结构化条款仅作解释补充（`InsuranceClauseKnowledgeService`），命中为空时用 checklist 降级，**不决定档位**。

### 为何是 SILENT（排查 `evaluation`）

前端在 `insight.mode === SILENT` 时只保留「问 Nara」入口，这是预期。查因看同包 `evaluation`：

| 字段 | 含义 |
|------|------|
| `modeReason` | 规则结论：`QUEUE_ALREADY_SURFACES` / `NO_OPEN_PROBLEM` / `CACHE_HIT` / `SELECTED_NOT_IN_QUEUE` / `SELECTED_TERMINAL` / `MATERIAL_OPTION_DIVERGENCE` / `BLOCKING_DECISION` / `EXPLICIT_ASK` / `CONTEXT_MISSING` … |
| `insuranceContextGate` | 租车保险：`ok` / `missing` / `confirmedFactCount`（Context Builder 确定性完整性） |
| `vehicleContextGate` | 车型：`ok` / `containsFRoad` / `recommendedVehicleType` |
| `caseAiSemanticKey` / `caseAiMode` | Decision Case AI Contract（见 [`DECISION_CASE_AI_POLICY.md`](./DECISION_CASE_AI_POLICY.md)） |
| `validatedPreviewCount` / `validatedResolvedCount` | 午餐等通用冲突：Context Builder 预览数 / 已通过门禁数 |
| `focusResolveStatus` | Assembler 如何解析 selectedRefs：`MATCHED_PROBLEM_ID` / `MATCHED_INSTANCE_KEY` / `SELECTED_NOT_IN_QUEUE` / `SELECTED_TERMINAL` / `FALLBACK_MOST_IMPORTANT` |
| `clientSelectedRef` | 前端传入的 entityId（可能是 `problemId` 或 `instanceKey`） |
| `focusMatchedVia` | `problemId` \| `instanceKey` \| `fallback` \| `none` |
| `openProblemIdsSample` / `openInstanceKeysSample` | Gateway open 集合抽样，对照 FE focused |
| `workspacePresentForFocused` | DecisionWorkspace **是否有行**（仅修订指纹；**不是** open 队列） |
| `cacheHit` | true 时本次未重算，沿用缓存 Insight（modeReason 常为 `CACHE_HIT`） |
| `explicitAsk` | 是否带了 `forceRefresh` |
| `focusedProblemId` / `focusedInOpenQueue` | Builder 是否认到 focused，且仍在 open 队列 |
| `focusedRequiresAction` / `focusedWorkflowStatus` / `focusedEnforcement` | 开放/可行动状态（**可行动 ≠ 主动 ATTENTION**） |
| `allowedOptionCount` | 当前 options 数；分歧判定看非 DEFER 的 allowed |
| `triggers.*` | Orchestrator 触发器快照 |
| `execSeverity` / `execDelayMinutes` / `execTopRiskId` | 执行首页：严重度 / 晚点分钟 / 主风险 |

**判定顺序（Decision Space）：**

0. **Focus 解析**：`selectedRefs.entityId` 先对 `problemId`，再对 `instanceKey`。显式选中但未进 Gateway open → `SELECTED_NOT_IN_QUEUE`（**不再静默换题**）。已 RESOLVED/DECIDED/DISMISSED → `SELECTED_TERMINAL`。  
1. 无 focused / open 为空 → `NO_OPEN_PROBLEM` → SILENT  
2. `BLOCKING` / `MUST_CONFIRM` / `enforcement=BLOCK` → INTERVENTION  
3. 安全相关 → INTERVENTION  
4. 方案实质分歧 / 证据 STALE → ATTENTION  
5. `forceRefresh` → ATTENTION（`EXPLICIT_ASK`）  
6. 否则即使 open + actionable → **`QUEUE_ALREADY_SURFACES` → SILENT**（队列已展示）  
7. 同 `contextHash` 未 forceRefresh → 缓存命中，不改 mode  

**关于 `dp_travel:same_day_travel:…`：**  
Copilot open = `GET .../decision-problems`（queueOnly）过滤后的集合，**不是** DecisionWorkspace 行表。iOS 列表 `id` 若用 `instanceKey`，`selectedRefs` 必须能被 Assembler 按 `problemId` **或** `instanceKey` 命中（现已支持两者）。

要大卡片：点「问 Nara」带 `forceRefresh: true`，或等阻塞/分歧触发。

### Response 200

```json
{
  "success": true,
  "data": {
    "schema": "tripnara.nara_page_insight@v1",
    "evaluation": {
      "contextHash": "ctxh_9f3a…",
      "cacheHit": false,
      "authoritativeAssembledAt": "2026-07-17T08:41:00.000Z",
      "llmUsed": false,
      "modeReason": "MATERIAL_OPTION_DIVERGENCE",
      "explicitAsk": false,
      "focusedProblemId": "dp_abc123",
      "openProblemCount": 1,
      "focusedInOpenQueue": true,
      "focusedRequiresAction": true,
      "focusedWorkflowStatus": "WAITING_DECISION",
      "focusedEnforcement": "REQUIRE_ADJUSTMENT",
      "allowedOptionCount": 3,
      "triggers": {
        "blockingDecision": false,
        "safetyRelated": false,
        "materialOptionDivergence": true,
        "staleEvidence": false,
        "unresolvedDecision": true
      }
    },
    "insight": {
      "id": "ins_01J…",
      "tripId": "trip_…",
      "pageId": "DECISION_SPACE",
      "mode": "ATTENTION",
      "priority": "P1",
      "insightType": "DECISION_REQUIRED",
      "title": "方案取舍不同",
      "advisorCopy": {
        "title": "方案取舍不同",
        "body": "各选项耗时、费用与强度不同，比选后再确认。",
        "advice": "选「短线」"
      },
      "observation": {
        "summary": "各选项耗时、费用与强度不同，比选后再确认。",
        "factRefs": ["decision-problem:dp_abc123", "plan-version:v12"]
      },
      "explanation": {
        "summary": "",
        "causalChainRefs": ["causal:cc_…"]
      },
      "impacts": [],
      "recommendation": {
        "summary": "选「短线」",
        "rationale": "选「短线」",
        "recommendedOptionId": "opt_b"
      },
      "actions": [
        {
          "kind": "PREVIEW",
          "label": "打开决策预览",
          "actionType": "OPEN_DECISION",
          "payloadRef": "decision-preview:dp_abc123"
        },
        {
          "kind": "NAVIGATION",
          "label": "查看全部待决",
          "target": {
            "pageId": "DECISION_SPACE"
          }
        }
      ],
      "confidence": 0.93,
      "evidenceRefs": [
        "decision-problem:dp_abc123",
        "constraint:time-window-233",
        "plan-version:v12"
      ],
      "context": {
        "contextHash": "ctxh_9f3a…",
        "tripVersion": "v12",
        "worldStateVersion": "ws_44",
        "decisionWorkspaceVersion": "dw_7",
        "draftRevision": null,
        "pageContractVersion": "decision_space@1"
      },
      "generatedAt": "2026-07-17T08:41:00.000Z",
      "expiresAt": "2026-07-17T10:41:00.000Z"
    }
  }
}
```

**SILENT 示例（无有效建议）：**

```json
{
  "success": true,
  "data": {
    "schema": "tripnara.nara_page_insight@v1",
    "evaluation": {
      "contextHash": "ctxh_silent…",
      "cacheHit": true,
      "authoritativeAssembledAt": "2026-07-17T08:40:00.000Z",
      "llmUsed": false
    },
    "insight": {
      "id": "ins_silent_…",
      "tripId": "trip_…",
      "pageId": "DECISION_SPACE",
      "mode": "SILENT",
      "priority": "P2",
      "insightType": "EXPLANATION",
      "title": "当前页面无需主动提醒",
      "observation": {
        "summary": "暂无需要在本页主动提示的决策或风险。",
        "factRefs": []
      },
      "explanation": {
        "summary": "可随时点「问 Nara」获取本页说明。"
      },
      "impacts": [],
      "actions": [],
      "confidence": 1,
      "evidenceRefs": [],
      "context": {
        "contextHash": "ctxh_silent…",
        "tripVersion": "v12",
        "pageContractVersion": "decision_space@1"
      },
      "generatedAt": "2026-07-17T08:40:00.000Z",
      "expiresAt": "2026-07-17T10:40:00.000Z"
    }
  }
}
```

### 错误

| HTTP | code | 何时 |
|------|------|------|
| 400 | `PAGE_CONTRACT_NOT_FOUND` | 未注册 live PageAIContract |
| 400 | `INVALID_CLIENT_PAGE_STATE` | 字段非法 |
| 404 | `TRIP_NOT_FOUND` | |
| 409 | `DRAFT_REVISION_CONFLICT` | draftRef.revision 落后于服务端草稿 |
| 403 | 与 trips 一致 | 无权限 |

LLM 失败 **不**返回 5xx 阻断页：降级为规则 Insight 或 SILENT，并在 `evaluation.llmUsed=false` + 可选 `evaluation.degradedReason`。

---

## 2. Get Insight — `GET .../page-insights/:insightId`

用于页面恢复、多端同步、证据与动作状态查询。

### Response 200

与 evaluate 的 `data.insight` 同构，外加：

```json
{
  "success": true,
  "data": {
    "schema": "tripnara.nara_page_insight@v1",
    "insight": { "...": "..." },
    "status": "ACTIVE"
  }
}
```

| `status` | 含义 | 客户端 |
|----------|------|--------|
| `ACTIVE` | 未过期且 context 仍匹配 | 可展示；COMMAND 可引导确认 |
| `STALE` | `expiresAt` 已过或权威版本已超前 | 隐藏 COMMAND；提示重新 evaluate |
| `SUPERSEDED` | 同 page+focus 已有更新 Insight | 改用新 id |
| `NOT_FOUND` | — | 404 |

---

## 3. Feedback — `POST .../page-insights/:insightId/feedback`

```json
{
  "type": "DISMISSED",
  "actionRef": null,
  "note": null,
  "clientTimestamp": "2026-07-17T08:45:00.000Z"
}
```

| `type` | 说明 |
|--------|------|
| `OPENED` | 用户展开洞察 |
| `DISMISSED` | 关闭 |
| `SNOOZED` | 稍后提醒（尊重 Contract cooldown） |
| `ACTION_PREVIEWED` | 点击了 PREVIEW |
| `ACTION_ACCEPTED` | 用户在下游确认了 COMMAND（写成功后回传） |
| `ACTION_REJECTED` | 用户拒绝确认 |
| `NOT_RELEVANT` | 标记无关 |

`actionRef`：当 type 与动作相关时，填 Insight 内 action 的稳定键（如 `payloadRef` / `commandRef`）。

**P0：** 只持久化反馈，不改变当次 Insight 内容。  
**P3：** 用于打扰成本与建议价值学习。

---

## 契约摘要

### ClientPageState → AuthoritativePageContext

| 客户端 | 服务端 |
|--------|--------|
| `selectedRefs` | → `selectedEntities`（权威投影） |
| `draftRef` | → `draftDelta`（服务端读草稿） |
| `viewport` / `recentAction` | → 焦点与叙事线索；非 Evidence |
| — | `tripSnapshot`、`constraintAssessments`、`decisionProblems`、`relevantWorldState`、`readinessProjection?`、`availableActions` |

### InsightAction

| kind | 字段 | 写入 |
|------|------|------|
| `NAVIGATION` | `target.pageId` + optional `entityRef` | 否 |
| `PREVIEW` | `actionType` + `payloadRef` | 否 |
| `COMMAND` | `actionType` + `commandRef`；确认与校验必开 | 是（既有写链） |

`payloadRef` / `commandRef` 由服务端签发，指向已存在的 Decision Preview / Plan Proposal / Acknowledge 资源。

### contextHash

由 PageAIContract 声明的相关字段计算；详见 ADR-010 §4。  
evaluate 响应中的 `evaluation.contextHash` 与 `insight.context.contextHash` 必须一致。

---

## P0 Vertical Slice — 决策空间

| 步骤 | 行为 |
|------|------|
| 1 | 客户端提交 `pageId: DECISION_SPACE` + 可选 `DECISION_PROBLEM` ref |
| 2 | Assembler 读 Trip Snapshot + Decision Workspace（可复用 decision-space-bundle 投影） |
| 3 | Orchestrator 选最重要开放问题；无则 SILENT |
| 4 | 返回结构化 Insight；`PREVIEW` → 现有 Decision Preview / Bundle |
| 5 | **不**新增 APPLY / execute 通道 |

日程编排等页的 Draft Delta 在本 slice **之后**接入。

---

## 与相邻 API 的关系

| API | 关系 |
|-----|------|
| Decision Space Bundle | P0 权威读面之一；Insight 解释其问题，不替代 Bundle |
| Contextual Recommendations (ADR-009) | 同日微规划专用；不并入 page-insight，但共享「Delta ⊕ Canonical」原则 |
| `/agent/actions/*` / Decision execute | COMMAND 的下游；Copilot 只持有 ref |
| Execution advisory / causalChain | 执行页 Insight 的证据来源（后续页） |

---

## 实现状态

| 项 | 状态 |
|----|------|
| ADR + 本契约 + TS types | 已冻结 |
| Nest `CopilotModule` + Page Insight Orchestrator | **Live：决策空间 + 活动编辑 + 日程编排 + 规划概览** |
| contextHash + in-memory cache + feedback store | 已实现 |
| Mobile 别名路由 | 未实现（可直接消费 `/api/trips/...` 同契约） |
| Insight 持久化（跨进程） | 未实现（进程内缓存） |
| COMMAND 写通道 | **故意不做**（P0） |
