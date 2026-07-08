# Exploration 端到端对接 Checklist

**Audience:** C 端前端 + QA + 联调  
**后端 SSOT:** [EXPLORATION_API.md](../../src/trips/exploration/EXPLORATION_API.md)  
**API 详解:** [frontend-integration-guide.md](./frontend-integration-guide.md)  
**页面骨架:** [frontend-routes-scaffold.md](./frontend-routes-scaffold.md)  
**TS Client:** [frontend-exploration-api-client.ts](../../src/trips/exploration/dto/frontend-exploration-api-client.ts)  
**类型:** [frontend-exploration-api.types.ts](../../src/trips/exploration/dto/frontend-exploration-api.types.ts)

本清单按 **Hub ①「告诉 AI 我想去哪」** 完整用户路径组织。每项含：页面/API、验收标准、常见失败。

---

## 0. 联调前置（后端 + 基础设施）

### 0.1 后端环境

- [ ] `DECISION_GATEWAY_UNIFIED=1`（issues / options / apply 必需；未开则 503）
- [ ] `EXPLORATION_CONSUMER_MVP_ENABLED=1`（可选，与前端 flag 对齐）
- [ ] `RESEARCH_PROTOCOL_ENABLED=1`（冰岛 protocol）
- [ ] 数据库迁移已执行：`npx prisma migrate dev --name exploration_sprint_4b`
- [ ] Redis 可用（Sprint 5 check job 跨 Pod；无 Redis 时仅单 Pod 内存降级）
- [ ] JWT 鉴权可用：`Authorization: Bearer <token>`

### 0.2 Sprint 4B 支付（可选）

- [ ] `RESEARCH_PAYMENT_COMMITMENT_ENABLED=1`
- [ ] 生产：`STRIPE_SECRET_KEY` 已配置
- [ ] 开发/Staging：`STRIPE_SECRET_KEY` 或 `RESEARCH_PAYMENT_SANDBOX_MODE=1`

### 0.3 前端工程

- [ ] 复制或 symlink `frontend-exploration-api-client.ts` + `frontend-exploration-api.types.ts` 到 `src/features/exploration/api/`
- [ ] API base 指向后端 `/api`（client 已写死 `/api/exploration` 与 `/api/research`）
- [ ] 登录态 token 注入所有 client 调用
- [ ] Feature flags：
  - [ ] `VITE_EXPLORATION_CONSUMER_MVP_ENABLED=1`
  - [ ] `VITE_HUB_EXPLORE_CARD_ENABLED=1`（Hub 卡片 ① 可见）
- [ ] `sessionStorage` 键 `tripnara.exploration.flow` 与 `persistFlowState` / `readFlowState` 接通

---

## 1. Hub 入口

| 项 | 内容 |
|----|------|
| **路由** | `/plan/start` 卡片 ① → `/explore` |
| **页面** | `ExploreHubRedirectPage` |
| **API** | `POST /api/exploration/scenarios` → `startExplorationFromHub` |
| **Body** | `{ researchProtocolId: 'iceland-discovery-v1' }`（默认） |

**验收**

- [ ] 进入 `/explore` 自动创建 Scenario，redirect 到 `/explore/:scenarioId/principles`
- [ ] 响应含 `scenarioId`、`sessionId`、`assignedVariant`（A 或 B）
- [ ] `persistFlowState({ scenarioId, sessionId, assignedVariant })`
- [ ] 埋点：`exploration_session_started`（含 `sessionId`、`scenarioId`、`protocolId`）

**常见失败**

- [ ] 401 → 检查 JWT
- [ ] 卡片 ① 仍显示「即将上线」→ 前端 flag 未开

---

## 2. 原则选择（Sprint 2）

| 项 | 内容 |
|----|------|
| **路由** | `/explore/:scenarioId/principles` |
| **页面** | `ExplorePrinciplesPage` |
| **API** | `GET /principles/catalog` → `fetchPrincipleCatalog` |
| **提交** | `PUT /scenarios/:id/principles` → `savePrinciples` |

**验收**

- [ ] 展示 6 张 Consumer Principle 卡片（非 TravelDecisionContract 原始字段）
- [ ] 最多选 3 条 + 拖拽排序
- [ ] 提交后 Trip 物化（后端 side-effect）；进入 `/routes` 或 `/compare`
- [ ] 埋点：`principles_submitted`

**常见失败**

- [ ] 409 `SCENARIO_NOT_MATERIALIZED` 出现在后续接口 → principles 未保存或未物化

---

## 3. 路线候选与分流（Sprint 2）

| 项 | 内容 |
|----|------|
| **路由** | `/explore/:scenarioId/routes` · `/compare` · `/routes/:routeId` |
| **API** | `POST /scenarios/:id/candidates` → `generateCandidates` |
| **比较** | `GET /scenarios/:id/candidates/compare`（可选，compare 页） |
| **选择** | `POST /scenarios/:id/selections` → `selectRoute` |

**验收**

- [ ] `assignedVariant === 'SINGLE_RECOMMENDATION'` → 单推荐 +「查看其他可能」
- [ ] `assignedVariant === 'THREE_ROUTE_COMPARISON'` → 直接三路线比较
- [ ] 三策略均可见（含 `remote-highlands-south`）
- [ ] 选路线时收集 `selectionReason` / gain / sacrifice（研究字段）
- [ ] `persistFlowState({ selectedRouteId })`
- [ ] 埋点：`route_selected`

**冰岛 QA 路线**

- [ ] 选择 `route_remote-highlands-south` 以触发 F208 BLOCK 场景

---

## 4. 可执行性检查（Sprint 3 + 5）

| 项 | 内容 |
|----|------|
| **路由** | `/explore/:scenarioId/routes/:routeId/check` |
| **页面** | `ExploreRiskPage` |
| **API 同步** | `POST /scenarios/:id/check` `{}` → `runFeasibilityCheck(token, id)` |
| **API 异步** | `POST /check` `{ async: true }` → 202 + `jobId` |
| **轮询** | `GET /check-jobs/:jobId` → `pollCheckJob` / `waitForCheckJob` |

**验收 — 同步路径（默认）**

- [ ] HTTP 200，`mode: 'sync'`，含 `job` + `issues`
- [ ] `issues.displayedIssues[0].source.gatewayAssessmentBatchId` 存在
- [ ] `issueId` 与 Decision Center 一致（非 BFF 自造）
- [ ] Loading >3s 时分阶段文案（无假进度条）

**验收 — 异步 + 轮询（推荐生产）**

- [ ] HTTP 202，`jobId` + `status: PENDING`
- [ ] `waitForCheckJob` 直至 `COMPLETED` 或 `FAILED`
- [ ] `COMPLETED` 时 poll 响应含 `issues`
- [ ] 多 Pod：创建 job 的 Pod 与轮询 Pod 可不同（Redis 持久化）
- [ ] `FAILED` 时展示 `job.error`

**验收 — 空问题**

- [ ] `totalIssueCount === 0` → 展示「暂无阻断问题」，勿伪造 issue
- [ ] 研究模式记录 `NO_ELIGIBLE_ISSUE` 事件（可选）

**埋点**

- [ ] `feasibility_check_completed`
- [ ] Risk 页 mount → `consumer_issue_viewed`

**常见失败**

- [ ] 503 → `DECISION_GATEWAY_UNIFIED` 未开
- [ ] 404 check job → job TTL 过期（24h）或 Redis 未共享且跨 Pod

---

## 5. 问题与修复决策（Sprint 3）

| 项 | 内容 |
|----|------|
| **路由** | `/explore/:scenarioId/decisions/:problemId` |
| **页面** | `ExploreDecisionPage` |
| **问题列表** | `GET /scenarios/:id/issues` → `fetchIssues`（refresh 用） |
| **方案** | `GET .../issues/:issueId/options` → `fetchRepairOptions` |
| **提交** | `POST .../decisions/:problemId/submit` → `submitDecision` |
| **应用** | `POST .../decisions/:problemId/apply` → `applyDecision` |

**验收**

- [ ] `problemId` 使用 issue 的 canonical id（与 Gateway 一致）
- [ ] 修复卡片含 preserves / sacrifices / impact
- [ ] submit 后再 apply；apply 响应含 `originalProblem.resolved`
- [ ] apply 后 `issues` 列表更新（问题减少或 severity 变化）
- [ ] `persistFlowState({ activeProblemId })` 便于刷新恢复
- [ ] 埋点：`repair_option_selected`、`decision_applied`

**常见失败**

- [ ] options 空 → Gateway 未返回 allowed actions
- [ ] apply 后 issue 仍在 → 检查 revalidate；可引导用户再看 Risk 页

---

## 6. 商品包装（Sprint 4A）

| 项 | 内容 |
|----|------|
| **路由** | `/explore/:scenarioId/continue` |
| **页面** | `ExploreContinuePage` |
| **商品** | `GET /scenarios/:id/continue/packages` → `fetchContinuePackages` |
| **反馈** | `POST /scenarios/:id/continue/feedback` → `submitPackageFeedback` |

**验收**

- [ ] 4 张商品卡按 `presentationOrder`（拉丁方，因 session 而异）
- [ ] 价值/信任 1–5 分、`packageRankings` 拖拽序
- [ ] 开放价格 `acceptablePriceUsd: { min, max, currency: 'USD' }`
- [ ] 埋点：`package_card_viewed`、`package_rank_submitted`

---

## 7. 行为承诺（Sprint 4A）

| 项 | 内容 |
|----|------|
| **API** | `POST /api/research/sessions/:sessionId/commitments` |
| **Client** | `submitCommitment` |

**验收 — NOTIFY_ME**

- [ ] Body: `{ commitmentType: 'NOTIFY_ME', email }`（email 或 phone 至少一项）
- [ ] 成功 message + `commitmentId`
- [ ] 埋点：`commitment_option_selected`、`notify_me_submitted`

**验收 — SELF_CHECK**

- [ ] Body: `{ commitmentType: 'SELF_CHECK' }`
- [ ] 埋点：`self_check_selected`

**禁止**

- [ ] 勿直接 POST `{ commitmentType: 'DEPOSIT' | 'PRICE_LOCK' }` → 400，须走 §8 支付 API

---

## 8. 支付验证（Sprint 4B，条件启用）

| 项 | 内容 |
|----|------|
| **法务** | `GET /api/research/payments/catalog` → `fetchPaymentCatalog` |
| **订金** | `startResearchDeposit` → Stripe Element → `confirmResearchDeposit` |
| **退款** | `refundResearchDeposit` |
| **价格锁定** | `submitPriceLock` |

**验收 — 订金**

- [ ] 展示 `legal.depositBody`（产品尚在开发、无条件退款）
- [ ] `start` 返回 `clientSecret` + `displayAmount`（$19）
- [ ] 沙箱：无 Stripe 时 `confirm` 即成功
- [ ] 成功后自动产生 `DEPOSIT` commitment
- [ ] 埋点：`deposit_started`、`deposit_completed`

**验收 — 退款**

- [ ] `refund` 后 status `REFUNDED`

**验收 — 价格锁定**

- [ ] `submitPriceLock({ lockedPriceUsd, email? })` 无支付
- [ ] 展示 `legal.priceLockBody`
- [ ] 埋点：`price_lock_submitted`

---

## 9. 研究埋点（全链路）

每条事件 payload 建议含：`sessionId`、`protocolId`、`scenarioId`、`tripId`、`timestamp`、`currentStep`。

- [ ] `exploration_session_started`
- [ ] `principles_submitted`
- [ ] `route_selected`
- [ ] `feasibility_check_completed`
- [ ] `consumer_issue_viewed`
- [ ] `repair_options_viewed`（可选）
- [ ] `repair_option_selected`
- [ ] `decision_submitted`（可选，submit 时）
- [ ] `decision_applied`
- [ ] `package_card_viewed`
- [ ] `package_rank_submitted`
- [ ] `commitment_option_selected`
- [ ] `notify_me_submitted` / `self_check_selected`
- [ ] 4B：`deposit_started` / `deposit_completed` / `price_lock_submitted`

**API:** `batchResearchEvents(token, sessionId, events)`

---

## 10. 错误与边界

| HTTP / 场景 | 前端处理 |
|-------------|----------|
| 401 | 跳转登录 |
| 403 | 无权限 / 4B 支付未启用 |
| 404 scenario / job | 提示会话过期，回 `/explore` 重建 |
| 409 `SCENARIO_NOT_MATERIALIZED` | 回 principles 或触发 materialize |
| 503 Gateway | 提示环境未就绪，禁伪造 issue |
| check `FAILED` | 展示 `job.error`，允许重试 POST /check |
| check 轮询超时 | 提示稍后重试；可保存 `jobId` 续 poll |
| issues 空 | 正常态，非 error |
| commitments DEPOSIT 400 | 改用 §8 支付 API |

---

## 11. 端到端黄金路径（QA 脚本）

### 11.1 最小闭环（4A，无支付）

1. [ ] `/plan/start` → 卡片 ① → `/explore`
2. [ ] Principles：选 3 条 → 继续
3. [ ] Compare：选 **`route_remote-highlands-south`**
4. [ ] Check：见至少 1 个 BLOCK（F208 相关）
5. [ ] Decision：选修复方案 → apply → `resolved: true` 或 issues 变化
6. [ ] Continue：package 排序 + 评分 + 价格区间
7. [ ] Commitment：`NOTIFY_ME` + email
8. [ ] 全链路埋点 batch 无 4xx

### 11.2 异步 Check（Sprint 5）

1. [ ] `runFeasibilityCheck(token, scenarioId, true)` → 202
2. [ ] `CheckProgressSteps` 展示分阶段文案
3. [ ] `waitForCheckJob` → COMPLETED + issues
4. [ ] （Staging）重启/切换 Pod 后轮询同一 `jobId` 仍成功

### 11.3 支付路径（4B，Staging）

1. [ ] `fetchPaymentCatalog` 展示 disclaimer
2. [ ] `startResearchDeposit` → `confirmResearchDeposit`（沙箱）
3. [ ] `getResearchDepositStatus` → SUCCEEDED
4. [ ] `refundResearchDeposit` → REFUNDED

---

## 12. 页面 ↔ API 速查

| 页面 | 关键 Client 函数 |
|------|------------------|
| `ExploreHubRedirectPage` | `startExplorationFromHub`, `persistFlowState` |
| `ExplorePrinciplesPage` | `fetchPrincipleCatalog`, `savePrinciples` |
| `ExploreRoutesEntryPage` / `ExploreComparePage` | `generateCandidates`, `selectRoute` |
| `ExploreRouteDetailPage` | （展示为主，选路线在 compare/detail） |
| `ExploreRiskPage` | `runFeasibilityCheck`, `waitForCheckJob`, `pollCheckJob` |
| `ExploreDecisionPage` | `fetchRepairOptions`, `submitDecision`, `applyDecision` |
| `ExploreContinuePage` | `fetchContinuePackages`, `submitPackageFeedback`, `submitCommitment` |
| Continue 4B 区块 | `fetchPaymentCatalog`, `startResearchDeposit`, `confirmResearchDeposit`, `refundResearchDeposit`, `submitPriceLock` |
| 全局 | `batchResearchEvents`, `readFlowState` |

---

## 13. 联调完成定义（Definition of Done）

- [ ] §0 环境项全部打勾
- [ ] §11.1 黄金路径在 Staging 通过
- [ ] §11.2 异步 check 通过（若多 Pod）
- [ ] Hub ① 与 Guide-to-Plan（卡片 ②）路由互不干扰
- [ ] 同一 `tripId` 在 Exploration 与 Plan Studio 的 `issueId` 一致（抽样 1 条）
- [ ] 无前端自造 issueId / 假 Gateway 数据
- [ ] sessionStorage 刷新后可恢复至 principles 之后任一步（至少 scenarioId + sessionId）
- [ ] 4B 仅在 flag + 法务文案展示后启用（可选）

---

## 14. 相关文档索引

| 文档 | 用途 |
|------|------|
| [prd-exploration-reliability-closure-v1.1.md](./prd-exploration-reliability-closure-v1.1.md) | 产品需求 SSOT |
| [frontend-integration-guide.md](./frontend-integration-guide.md) | 请求/响应示例 |
| [frontend-routes-scaffold.md](./frontend-routes-scaffold.md) | 组件与目录结构 |
| [EXPLORATION_API.md](../../src/trips/exploration/EXPLORATION_API.md) | 后端 API 清单 |
