# Match Square 前端集成指南

Decision OS · 搭子广场 & 长效互评 · v1.0.0  
本仓库无前端工程，以下为 **API 契约驱动的集成说明**（P0 广场 + P1 申请流）。

---

## 1. 你要改什么（一句话）

**搭子广场**独立 Tab：未完成测评 **只读浏览**；完成测评后可 **发帖 / 申请**；队长在管理面板 **审批申请卡片**（亮点 + 风险叙事，不是裸百分比决策）。

**前置依赖**：用户须先走 [Odyssey Intake v2 Premium](./odyssey-intake/frontend-integration-guide.md)（MBTI 自选 + 背书 + 行中博弈题）。

**Match Engine**：双层撮合 `graph_cluster_csp_v1`，详见 [structural-match-engine.md](./structural-match-engine.md)。

---

## 2. 推荐用户流程

```
进入搭子广场
  → GET  /api/match-square/access              （权限矩阵）
  → GET  /api/match-square/filters/options     （筛选器选项）
  → GET  /api/match-square/posts               （列表 Card + 动态契合度）

发起招募（队长）
  → POST /api/match-square/posts               （自动带入人格称号 / 相处模式）
  → GET  /api/match-square/my/posts            （管理面板）
  → PATCH /api/match-square/posts/:id/status    （下架 / 结束）

申请加入（队员）
  → GET  /api/match-square/posts/:id/apply-preview   （契合度 + 冲突弹窗文案）
  → [若有 conflictPrompt] 展示承诺弹窗
  → POST /api/match-square/posts/:id/applications  （留言 ≤200 字）
  → GET  /api/match-square/my/applications           （我的申请状态）

队长审批
  → GET  /api/match-square/posts/:id/applications?status=pending
        （别名：GET /api/match-square/my/posts/:postId/applications）
  → PATCH /api/match-square/posts/:id/applications/:applicationId
        { "action": "approve" | "reject" }
```

---

## 3. TypeScript 类型（建议复制到前端）

```typescript
export type MatchSquareAccess = {
  canBrowse: boolean;
  canPost: boolean;
  canApply: boolean;
  quizComplete: boolean;
};

export type RecruitmentPostStatus = 'active' | 'hidden' | 'closed';
export type ApplicationStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

export type RecruitmentPostCard = {
  id: string;
  status: RecruitmentPostStatus;
  captainUserId: string;
  captainCardTitle: string;
  captainMbtiType: string;
  captainInteractionMode: string;
  captainInteractionModeLabel: string;
  captainReputationStars: number | null;
  compatibilityPercent: number | null;
  /** v2 Match Engine — 点击 % 气泡展开的抽屉（麦肯锡式三行诊断） */
  matchInsightDrawer?: {
    headline: string;
    lines: Array<{ status: 'ok' | 'warn' | 'neutral'; label: string; detail: string }>;
  } | null;
  structuralMatch?: {
    baseScore: number;
    teamworkFitPoints: number;
    stressFitPoints: number;
    mbtiSynergyPoints: number;
    algorithm: string;
  } | null;
  teamworkMatchBlocked: boolean;
  teamworkBlockReason: string | null;
  recommendationHidden: boolean;
  recommendationHiddenReason: string | null;
  teamworkStyle: 'full_managed' | 'co_planning' | 'casual_play' | null;
  teamworkStyleCapsule: string | null;
  verifiedCredentials: VerifiedCredentialsView | null;
  destination: string;
  departureLabel: string | null;
  startDate: string;
  endDate: string;
  teamStatus: { slotsFilled: number; slotsNeeded: number; slotsRemaining: number };
  teamPuzzle: {
    progressLabel: string;
    algorithm?: 'team_deficit_pomdp_v1';
    slots: Array<{
      kind: 'filled' | 'open';
      slotIndex?: number;
      slotId?: string;
      roleLabel: string;
      occupantLabel?: string;
      aiRationale?: string;
      deficitDimension?: 'energy_balance' | 'risk_resilience' | 'trust_alignment' | 'collaboration_fit' | 'cross_circle_chemistry' | 'preference';
      highlightForViewer: boolean;
      viewerMatchScore?: number;
    }>;
    viewerPuzzleMatch?: {
      isSoulPiece: boolean;
      headline: string;
      matchedSlotIndex: number;
      matchedRoleLabel: string;
      aiRationale: string | null;
    } | null;
  };
  captainMessage: string | null;
  /** 招募愿景小作文（= vibeLlm.visionText，无 Vibe 发布时为 null） */
  recruitmentVision: string | null;
  itinerarySummary: string;
  budgetRange: { minCents: number | null; maxCents: number | null } | null;
  tripMoodTag: 'relax' | 'adventure' | 'healing' | 'social' | null;
  /** 策划协作三档 — 广场 Card 必展示 */
  planningStyle: 'full_managed' | 'co_planning' | 'casual_play' | null;
  planningStyleLabel: string | null;
  planningStyleDescription: string | null;
  travelMode: 'self_drive' | 'public_transit' | 'mixed' | 'other' | null;
  publishedAt: string | null;
  /** PRD 4.3 Vibe 解析区块 — 仅 vibeFreeText 发布时有值 */
  vibeLlm?: VibeLlmPostView | null;
};

export type RecruitmentPostDetailView = MatchSquarePostCard & {
  /** 发布页 parse 快照 — GET /posts/:id 原样回显 */
  vibeParse: VibeLlmParseResponse | null;
  preferenceNotes: string | null;
  vehicleInfo: string | null;
  destinationLat: number | null;
  destinationLng: number | null;
  destinationPoiId: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  isCaptain: boolean;
};

export type VibeLlmPostView = {
  visionText: string | null;
  chips: Array<{ id: string; label: string }>;
  contractHint: string | null;
  /** canonical — 勿直接展示英文 */
  teamworkContractModel: 'Full-Service' | 'Co-Creation' | 'Improvisational';
  /** UI 展示 — 如「一起策划」 */
  teamworkContractModelLabel: string;
  hardGatesSummary: string[];
  behavioralContracts: Array<{ title: string; clauses: string[] }>;
  parseSource: 'llm' | 'rules';
};

export type VibeLlmParseResponse = {
  payload: {
    vibe_chips: Array<{ id: string; label: string }>;
    teamwork_contract_model: 'Full-Service' | 'Co-Creation' | 'Improvisational';
    hard_gates: {
      budget_range?: string | null;
      education_baseline?: 'None' | 'Bachelor' | 'Master' | 'Doctor';
      industry_preference?: string[];
      security_level?: 'Standard' | 'Medium' | 'High';
    };
    slot_definitions: Array<{ slot_id: number; expected_tag: string; reason: string }>;
    derived_fields?: { itinerary_summary: string; captain_message: string };
    contract_hint: string | null;
    parse_version: 'vibe_llm_v1' | 'vibe_llm_v2';
  };
  suggestedPlanningStyle: 'full_managed' | 'co_planning' | 'casual_play';
  suggestedPlanningStyleLabel: string;
  teamworkContractModelLabel: string;
  suggestedItinerarySummary: string;
  suggestedCaptainMessage: string;
  suggestedFields: {
    destination: string | null;
    destinationRegionId: string | null;
    destinationRegionLabel: string | null;
    destinationSubScopeId: string | null;
    destinationSubScopeLabel: string | null;
    departureLabel: string | null;
    budgetMinCents: number | null;
    budgetMaxCents: number | null;
    travelMode: 'self_drive' | 'public_transit' | 'mixed' | 'other' | null;
    tripMoodTag: 'relax' | 'adventure' | 'healing' | 'social' | null;
    preferenceNotes: string | null;
  };
  realtime_ready: boolean;
};

export type VerifiedBadgeMeta = {
  verified: boolean;
  badgeLabel: '已认证';
  badgeMark: '✓';
  renderHint: 'vector_component_watermark';
};

export type VerifiedCredentialsView = {
  headline: {
    displayName: string | null;
    identityHeadline: string | null;
    professionTags: string[];
    educationTags: string[];
    sesameCreditLine: string | null;
    trustAssetLine: string | null;
  };
  dossier: {
    education: {
      displayTag: string;
      degreeLevel: string;
      tierTag: string;
      verified: boolean;
      badge: VerifiedBadgeMeta;
      verificationChannel: 'xuexin_online_code';
    } | null;
    profession: {
      displayTags: string[];
      industryTag: string;
      companyTierTag: string;
      roleLevelTag: string;
      verified: boolean;
      badge: VerifiedBadgeMeta;
      verificationChannel: 'work_email' | 'badge_ocr' | 'oauth_maimai' | 'oauth_linkedin';
    } | null;
    sesameCredit: { score: number | null; label: string | null; tier: string | null; verified: boolean } | null;
    reputationStars: number | null;
    safetyNote: string | null;
  };
};

export type ApplyPreview = {
  canApply: boolean;
  blockReason?: string;
  conflictPrompt?: {
    required: true;
    dimension: 'planning_hardness';
    message: string;
  } | null;
  teamworkCommitmentPrompt?: {
    required: true;
    dimension: 'teamwork_style';
    teamworkStyle: 'full_managed' | 'co_planning' | 'casual_play';
    message: string;
  } | null;
  teamworkMatchBlocked?: boolean;
  compatibilityPercent?: number | null;
  highlights?: string[];
  warnings?: string[];
};

export type RecruitmentApplicationCard = {
  id: string;
  postId: string;
  status: ApplicationStatus;
  applicantUserId: string;
  applicantDisplayName: string;
  applicantCardTitle: string;
  applicantMbtiType: string;
  applicantInteractionMode: string;
  applicantInteractionModeLabel: string;
  applicantReputationStars: number | null;
  compatibilityPercent: number;
  highlights: string[];
  warnings: string[];
  message: string;
  planningCommitmentAccepted: boolean;
  teamworkCommitmentAccepted: boolean;
  createdAt: string;
  decidedAt: string | null;
};
```

---

## 4. Card UI 渲染规范（PRD 2.2）

### 列表 Card（Dark Theme）

```
┌────────────────────────────────────────────────────────┐
│  🎭 {captainCardTitle} · 🤝 {captainInteractionModeLabel}   [{compatibilityPercent}%]│
│  {verifiedCredentials.headline.identityHeadline}        │ ➔ 背书提级外显
│  {verifiedCredentials.headline.trustAssetLine}          │ ➔ 芝麻信用 + 组队风格
│  ────────────────────────────────────────────────────  │
│  📍 {departureLabel} · {destination} · {startDate}月旬   │
│  👥 {teamPuzzle.progressLabel}：{slots 渲染}              │
│  💬 “{captainMessage}”                                   │
└────────────────────────────────────────────────────────┘
```

详情页点击头像展开 **`verifiedCredentials.dossier`**（教育/行业/芝麻/星级，无校名公司全称）。

- `recommendationHidden === true`：队长履约 Hard Gate，列表已过滤；若单独 deep link 详情则展示 `recommendationHiddenReason`
- Loading：Apple 钱包式骨架屏流光，目标 **≤1.5s**（后端列表目标 **<300ms**）

### 4.1 招募详情页信息架构（推荐 · 减噪）

详情页 **无单独接口**，数据来自 `GET /api/match-square/posts/:id` 的 `post` 对象。当前常见问题是把 6 套数据源平铺，叙事重复。推荐 **渐进披露**：

#### 详情页标题层级（目的地 vs 招募愿景）

| 层级 | 字段 | 示例 | 用途 |
|------|------|------|------|
| **主标题** | `destination` (+ 可选 `departureLabel`) | 西北·青甘环线 | 去哪 — 列表 Card 第一行 |
| **招募愿景** | `recruitmentVision` 或 `vibeLlm.visionText` | 自驾环游中国，路上一起做饭穷游… | 怎么玩、要什么人 — 详情 hero 引言 |
| **行程摘要** | `itinerarySummary` | 每日大致路线与核心打卡点… | 结构化行程 facts（≤500 字） |
| **队长寄语** | `captainMessage` | 各位伙伴——6月的冰岛… | 情感化长信，放详情底部 |

**不要**把 `itinerarySummary` 或 `captainMessage` 当作 Vibe 小作文的替代品；发布时 `vibeFreeText` 会持久化为 `source_text`，读帖时通过 `recruitmentVision` 回显。**旧帖无 Vibe 发布时** `recruitmentVision` 为 `null`，详情页仅展示 `destination` + `itinerarySummary`。

#### 数据源与职责（避免重复渲染）

| 区块（UI 名） | API 字段 | 回答的问题 | 与谁可能重复 |
|---------------|----------|------------|--------------|
| 头部 + 契合度 % | `compatibilityPercent` | 我和这队合不合 | 点开后的决策翻译 |
| 车队拼图进度 | `teamPuzzle` | **还缺什么角色** | Vibe chips / 拼图 open slot |
| **决策翻译** | `matchInsightDrawer` | **我作为队员合不合**（双人诊断） | `teamPuzzle.viewerPuzzleMatch`、highlights |
| Vibe 旅行愿景 | `vibeLlm` | 队长发帖时要的 vibe / 契约 | `planningStyleLabel`、`teamPuzzle` 协作位 |
| HARD GATES | `budgetRange` + `travelMode` + `planningStyle` + `vibeLlm.hardGatesSummary`（含 **🏃 体能门槛** Level 4+） | 硬门槛（预算/出行/授信/**物理**） | Vibe `contractHint` |
| 行程正文 | `itinerarySummary` + `captainMessage` | 去哪、怎么玩 | — |

**无单独拼图接口**：`teamPuzzle` 内嵌在 Card/Detail，见 [structural-match-engine.md](./structural-match-engine.md) §5。

#### 「决策翻译」= `matchInsightDrawer`

前端可将该区块命名为「决策翻译」，但 **必须映射后端 `matchInsightDrawer`**，不是 Vibe LLM，也不是 `teamPuzzle`。

**生成条件**：请求带有效 token，且浏览者 `quizComplete === true`；引擎对比 **队长 vs 当前用户**（`graph_cluster_csp_v2`）。

**结构**：

```typescript
post.matchInsightDrawer?: {
  headline: string; // 固定倾向："团队结构稳定性报告"
  lines: Array<{
    status: 'ok' | 'warn' | 'neutral';
    label: string;   // 如 "团队契约分工" / "行中审美/品质分歧"
    detail: string;  // 完整解释，建议折叠区展示
  }>;
} | null;
```

**`lines[]` 与算法分量对应关系**（实现见 `buildMatchInsightDrawer()`）：

| line.label（示例） | 算法依据 |
|--------------------|----------|
| 圈层沟通带宽 | 学历/职级/芝麻 `socialScore` 档位差 |
| 破圈化学反应 · … | `cross_circle_chemistry` 剧本命中 |
| 行业 Anti-Clustering / 行业同质化风险 | 同/跨行业加减分 |
| 团队契约分工 | `teamworkFitPoints` × `planningStyle` |
| 行中审美/品质分歧 | Premium 博弈题埋点 `aQualityAmbiguity` 差距 |
| MBTI 角色拼图 | `mbti-synergy-matrix` 协同加成 |

**UI 摘要映射（可选）**——若只做两行摘要，建议：

| UI 行 | 取数规则 |
|-------|----------|
| 同频亮点 | 第一条 `status === 'ok'` 的 `label`（或合并多条 ok 的短 label） |
| 需留意 | 第一条 `status === 'warn'` 的 `label` |

点击「契合度 %」或「查看完整诊断」时 **展开全部 `lines[].detail`**，不要在列表 Card 与详情页各展示一套不同文案。

**注意**：`GET .../apply-preview` 的 `highlights[]` / `warnings[]` 与 drawer **有重叠**（消费观、体力、审美等规则叙事）。详情页 **只展示 drawer**；申请预览页再展示 highlights/warnings + 承诺弹窗即可。

未登录：`compatibilityPercent`、`matchInsightDrawer`、`viewerPuzzleMatch` 均为 `null`——决策翻译整块隐藏或展示「登录并完成测评后查看契合诊断」。

#### 推荐布局（默认展开 vs 折叠）

**P0 默认展开**

1. 标题 · 日期 · `teamStatus`（缺 N 人）
2. **`teamPuzzle`**（含 `viewerPuzzleMatch` 灵魂拼图条，若有）
3. **HARD GATES 一行摘要**（合并去重，见下）

**P1 点击展开**

4. 契合度 % → **`matchInsightDrawer` 全文**（决策翻译）
5. **`vibeLlm`** — 仅当 `post.vibeLlm != null`：chips + 一条 `contractHint`（勿再重复 `planningStyleCapsule` 长文）
6. 头像 → **`verifiedCredentials.dossier`**
7. 底部 · **`captainMessage` / `itinerarySummary`**

**HARD GATES 合并规则**（避免与 Vibe 重复）

```typescript
function buildHardGatesSummary(post: RecruitmentPostCard) {
  const rows: string[] = [];
  if (post.budgetRange) rows.push(/* 预算 */);
  if (post.travelMode) rows.push(/* 出行方式 + vehicleInfo */);
  if (post.planningStyleLabel) rows.push(`组队风格：${post.planningStyleLabel}`);
  const vibe = post.vibeLlm?.hardGatesSummary ?? [];
  for (const line of vibe) {
    if (!rows.some((r) => r.includes(line.slice(0, 4)))) rows.push(line);
  }
  return rows;
}
```

#### 前端兜底逻辑（与后端优先级）

| 场景 | 行为 |
|------|------|
| 有 `post.teamPuzzle.slots` | **信任后端**，不要再用本地 `generateConstraintSlotLabels()` 叠一层 |
| 有 `post.vibeLlm` | 拼图 open slot 已由后端 `slot_definitions` 优先；Vibe 区块只展示 chips/契约 |
| 无 `matchInsightDrawer` | 不渲染决策翻译；勿用 mock 文案冒充 |
| `structuralMatch` | 仅 dev/debug 面板；正式 UI 不展示 |

#### 详情页线框（推荐）

```
┌────────────────────────────────────────────────────────┐
│  西北·青甘环线                          [ 55% ▾ ]      │  ← destination 主标题
│  「自驾环游中国，路上一起做饭穷游…」                    │  ← recruitmentVision（有则展示）
│  🎭 队长称号 · 🤝 相处模式 · 背书 headline            │
├────────────────────────────────────────────────────────┤
│  车队拼图进度                                          │  ← teamPuzzle（P0）
│  [队长] [建议补位·E人/气氛组] […]                      │
│  💡 viewerPuzzleMatch.headline（可选）                 │
├────────────────────────────────────────────────────────┤
│  🛡️ HARD GATES：¥3k–6k · 自驾 · 一起策划 · 本科+     │  ← 合并一行（P0）
├────────────────────────────────────────────────────────┤
│  ▶ Vibe 旅行愿景（仅 vibeLlm 存在时）                  │  ← P1 折叠
│  ▶ 信任档案（dossier）                                 │
├────────────────────────────────────────────────────────┤
│  行程安排 · captainMessage                             │  ← P1 底部
└────────────────────────────────────────────────────────┘
```

### 队长审批 Card（PRD 4.2）

必渲染字段：

| 区域 | 字段 |
|------|------|
| 头部 | `applicantDisplayName`、`compatibilityPercent`、`applicantReputationStars` |
| 人格行 | `applicantCardTitle`、`applicantInteractionModeLabel` |
| ✅ | `highlights[]` |
| ⚠️ | `warnings[]` |
| 🤖 | **`decisionBrief`**（PRD 3.13）— 拼图槽位旁决策引擎单行提示 |
| 留言 | `message` |
| 操作 | 拒绝 / 询问更多（IM 占位）/ 通过 → `PATCH ... { action }` |

**PRD 3.13 `decisionBrief`**（`GET .../applications` 每条申请）：

| 字段 | UI |
|------|-----|
| `narrativeLine` | 审批卡片 🤖 决策引擎提示（**建议**非 Hard Gate） |
| `inTripCollaborationNoisePercent` | 可选徽章，如「行中噪音 18%」 |
| `suggestedSceneRoleLabel` | 建议角色锚定，如 `🧩 盲盒跟从者` |
| `mitigatingTaskTemplateIds[]` | 成团后将自动派发的前置任务（Phase 1 只读预览） |

```typescript
if (application.decisionBrief?.narrativeLine) {
  renderDecisionEngineHint(application.decisionBrief.narrativeLine);
}
```

详见 [decision-engine-recruitment-task-flywheel-3.13.md](./decision-engine-recruitment-task-flywheel-3.13.md)。

---

## 5. 权限矩阵（PRD 2.1）

| 用户状态 | 浏览 | 发帖 | 申请 |
|---------|------|------|------|
| 未完成测评 | ✅ | ❌ | ❌ |
| 已完成测评 | ✅ | ✅ | ✅ |

```bash
curl "$API/api/match-square/access" -H "Authorization: Bearer $TOKEN"
```

```json
{
  "success": true,
  "data": {
    "canBrowse": true,
    "canPost": true,
    "canApply": true,
    "quizComplete": true
  }
}
```

未完成测评时 POST 发帖 / 申请返回 `FORBIDDEN`；引导跳转 Odyssey 5 题流程。

---

## 6. 筛选器（PRD 2.3）

```bash
curl "$API/api/match-square/posts?destination=西北&dateFrom=2026-06-01&dateTo=2026-06-30&personaQuadrants=NT,NF&interactionModes=deep_learning,easy_companion"
```

| Query | 说明 |
|-------|------|
| `destination` | 模糊匹配 |
| `dateFrom` / `dateTo` | 日期范围重叠过滤 |
| `personaTypes` | 逗号分隔 MBTI，如 `INTJ,ENFP` |
| `personaQuadrants` | 逗号分隔 `NT,NF,SP,SJ` |
| `interactionModes` | 逗号分隔，`deep_learning` / `easy_companion` / `independent` |
| `planningStyles` | 逗号分隔，`full_managed` / `co_planning` / `casual_play` |
| `limit` / `offset` | 分页，默认 20 |

选项池：`GET /api/match-square/filters/options` → 含 **`destinationRegions[]`**（大区 + `subScopes[]`，id 与 parse `suggestedFields` 对齐）

---

### 6.1 出发时间 DatePicker（前端样式必检）

广场顶栏「出发时间」筛选只传 **`dateFrom` / `dateTo`（YYYY-MM-DD）** 给列表 API；**日期组件样式问题不在后端**。

若日历数字挤成一串（如 `21222324252627`、Su/Mo 列对不齐），通常是 **日历 grid 样式未加载或被全局 CSS 覆盖**：

| 常见原因 | 修复 |
|---------|------|
| `react-day-picker` 未引入官方 CSS | `import 'react-day-picker/style.css'`（v9）或 `dist/style.css`（v8） |
| 全局 `table`/`td` 被改成 `display:block` / `inline` | 对 `.rdp-month_grid` 恢复 `display: table` + `table-layout: fixed`，或改用 `grid-template-columns: repeat(7, 1fr)` |
| Popover 宽度不足 | 双月面板 `min-width: 560px`（单月 ≥ 280px） |
| Tailwind preflight 清空 table 间距 | 给 day cell 设 `width: 2.25rem; height: 2.25rem; text-align: center` |
| 自定义 flex 行未分 7 列 | 日期容器用 **7 列 grid**，不要单行 flex 不设 `flex-basis` |

**推荐结构（示意）**

```css
.rdp-month_grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0;
}
.rdp-day {
  width: 2.25rem;
  height: 2.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

选中后把区间写入 query：`dateFrom=2026-06-07&dateTo=2026-07-15`（与帖 `startDate`/`endDate` 重叠即命中）。

---

## 7. 发起招募（PRD 3.x）

### 7.0 Vibe LLM 动态意图解析（PRD 4.3 · 发布页小作文）

用户自由输入旅行愿景时，前端 **debounce（建议 400–600ms）** 调用实时解析；**vibe 标签、行程概述、队长寄语** 随键入自动填充到表单对应字段。

**实时解析**

```bash
curl -X POST "$API/api/match-square/vibe-llm/parse" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "freeText": "打算自驾环游中国，想搞个做饭穷游组，路上露营，晚上 vibe coding"
  }'
```

响应 `data` 结构：

| 字段 | 说明 |
|------|------|
| `payload.vibe_chips[]` | `{ id, label }` — 淡入滑出的胶囊标签，如 `🍳 炊事合伙人` |
| `suggestedItinerarySummary` | **自动填充 `itinerarySummary`** — 客观行程/玩法/条件（≤500字） |
| `suggestedCaptainMessage` | **自动填充 `captainMessage`** — 对搭子的期待/门槛/寄语（≤500字） |
| `suggestedFields.destination` | **自动填充 `destination`** — 如 `西北·青甘大环` |
| `suggestedFields.destinationRegionId` | **自动填充「目的地大区」下拉** — 如 `domestic_northwest` |
| `suggestedFields.destinationRegionLabel` | 展示文案 — 如 `国内 · 西北` |
| `suggestedFields.destinationSubScopeId` | **自动填充「细分范围」下拉** — 如 `qinggan_great_loop` |
| `suggestedFields.destinationSubScopeLabel` | 展示文案 — 如 `青甘大环` |
| `suggestedFields.departureLabel` | 自动填充出发地标签（识别「从杭州出发」等） |
| `suggestedFields.budgetMinCents` / `budgetMaxCents` | 自动填充人均预算（分），如 3w → `3000000` |
| `suggestedFields.travelMode` | `self_drive` / `public_transit` / `mixed` |
| `suggestedFields.tripMoodTag` | `relax` / `adventure` / `healing` / `social` |
| `suggestedFields.preferenceNotes` | 圈层/学历偏好摘要 → `preferenceNotes` |
| `suggestedFields.recruitmentScriptId` | 命中剧本 id — 如 `chuanxi_heavy_trek`（Premium Trekking 等） |
| `suggestedFields.recruitmentSceneCategory` | 场景大类 — `premium_trekking` 时联动左侧 **🏃 徒步** 入口 |
| `payload.recruitment_script_id` | 与 `suggestedFields.recruitmentScriptId` 同值，持久化在 `_vibeLlm` |
| `GET /filters/options` → `premiumTrekkingScene` | `{ id, menuId: "hiking", label, scriptIds[] }` — 发布页从徒步入口带入时预置场景 |

**PRD 3.10 深度联动**（Vibe → TripNARA 徒步 → DNA）：见 [trekking-dna-integration-3.10.md](./trekking-dna-integration-3.10.md)

| 字段 | 说明 |
|------|------|
| `trekkingOrchestration` | parse 响应 / GET 详情 — World Model 路线候选、离线 DEM、公摊装备、DYL 工具链、DNA 权重提示 |
| `_trekkingOrchestration` | 发帖时写入 `captainPersonaSnapshot`，供 spawn-trip 编排器读取 |

### Spawn Trip API（PRD 3.10 Phase 2）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/match-square/posts/:id/spawn-trek-trip/preview` | 队长预览：live/planned 路线、`canSpawn`、blockReason |
| POST | `/match-square/posts/:id/spawn-trek-trip` | 队长执行 spawn；body 可选 `{ tripId }` 复用已有 Trip |

响应 `trekkingSpawnResult` / spawn 返回值含：`tripId`, `hikePlanId`, `offlinePack`, `dnaEvolutionScheduled`。
详情 GET 同时返回 `trekkingOrchestration` + `trekkingSpawnResult`（若已 spawn）。

**PRD 3.11 路线模板双向喂养**：见 [route-template-matching-integration-3.11.md](./route-template-matching-integration-3.11.md)

| 字段 | 说明 |
|------|------|
| `routeTemplateMatch` | parse 响应 — 意图→模板检索计划；无匹配时为 `null` |
| `routeTemplateMatch.associationHint` | Hard Gates 旁动态提示，如 `🗺️ AI 已为你一键关联最佳路线模板：《…》` |
| `routeTemplateMatch.primaryMatch` | 最佳模板：`catalogId`, `routeDirectionName`, `matchPercent`, `confidence` |
| `routeTemplateMatch.primaryMatch.confidence` | `highlight`（≥85%）/ `suggest` / `low` |
| `routeTemplateMatch.primaryMatch.launchRecruitmentAction` | `confirm_template` — 展示「确认关联」CTA |
| `routeTemplateMatch.primaryMatch.slotAugmentations[]` | 模板驱动的拼图 augmentation（叠加 3.10 slot） |

**链路 A — 从路线模板发起招募（已实现）**

```typescript
const launched = await POST(`/api/match-square/route-templates/${templateId}/launch-recruitment`, {
  startDate: '2026-07-01',
  endDate: '2026-07-04',
  slotsNeeded: 3,
  planningStyle: 'full_managed',
  captainMessage: '以此官方模板组队，里程碑与 Vault 已锁定',
});
// launched.recruitmentPostId → 跳转搭子广场详情
// launched.post.routeTemplateBinding.catalogId 强绑 catalog
// launched.routeTemplateMatch.primaryMatch.slotAugmentations[] 驱动拼图
```

**链路 B（情绪 → 模板）**：parse 响应 `routeTemplateMatch` 仍用于发布页确认关联。

**PRD 3.12 成团转流**：满员 `closed` 后自动尝试 `instantiate-trip`（或队长手动调用）

**PRD 3.15 队长强制成团**：未满员时队长可 **锁死阵容**（裁剪空缺位、拒绝 pending、缩编 `slotsNeeded`）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/match-square/posts/:id/force-lock/preview` | `canForceLock`, `currentCrew`, `droppedOpenSlots`, `physicalDeficits`, `vaultRecalc`, `confirmLines` |
| POST | `/match-square/posts/:id/force-lock` | body `{ note?, skipInstantiate? }`；默认链式实例化 Active Trip |

详情 GET 回显：`post.sovereignLock`（已锁团时非 null）。规范：[prd-3.15-sovereign-force-lock.md](./prd-3.15-sovereign-force-lock.md)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/match-square/posts/:id/instantiation/preview` | 预览策略、`plan.canInstantiate`、`existingResult`、**`collaborativeTaskPreview`** |
| POST | `/match-square/posts/:id/instantiate-trip` | 实例化 Active Trip；body `{ skipIfExists?: boolean }` |

响应字段：`tripId`, `activeTripPath`（如 `/trips/{id}/active`）, `plan.strategy`, `plan.contextualCardIds[]`  
实例化后 `Trip.metadata.collaborativeTaskFlywheel.tasks[]` 含行前协同任务（PRD 3.13）  
详情 GET：`tripInstantiationResult` — 见 [group-formation-trip-instantiation-3.12.md](./group-formation-trip-instantiation-3.12.md)

**PRD 3.13 决策引擎 × 任务飞轮**：见 [decision-engine-recruitment-task-flywheel-3.13.md](./decision-engine-recruitment-task-flywheel-3.13.md)

| 阶段 | API / 字段 | 说明 |
|------|------------|------|
| 拼团审批 | `applications[].decisionBrief` | World Model CSP 预演 + 角色锚定 |
| 成团预览 | `instantiation/preview.collaborativeTaskPreview` | 将派发的任务清单 |
| 成团落库 | `Trip.metadata.collaborativeTaskFlywheel` | `tasks[]`：`title`, `assigneeUserId`, `status: pending` |
| 行中（Phase 2） | `GET /trips/:id/collaborative-tasks` | 任务列表 + `behaviorLog` |
| 行中（Phase 2） | `POST /trips/:id/collaborative-tasks/:taskId/events` | `{ action: confirm \| rollback \| ack_timeout }` → DNA |
| 行中（Phase 2） | `GET /trips/:id/decision-events` | Rollback 提案 + `eventLog` |
| 行中（Phase 2） | `POST /trips/:id/decision-events` | `route_rollback` propose / confirm / protest |

**Active Trip 任务卡（Phase 2）**

```typescript
const { data } = await GET(`/api/trips/${tripId}/collaborative-tasks`);
for (const task of data.tasks) {
  renderTaskCard(task); // status: pending | confirmed | rolled_back | timed_out
}

// 负责人确认装备清单
await POST(`/api/trips/${tripId}/collaborative-tasks/${taskId}/events`, {
  action: 'confirm',
  evidenceRefs: ['gear-checklist-upload-id'],
});

// 队长回滚修订
await POST(`/api/trips/${tripId}/collaborative-tasks/${taskId}/events`, {
  action: 'rollback',
  note: '涉水杖型号需统一为 Black Diamond',
});
```

**Active Trip 路线 Rollback（PRD 3.12）**

```typescript
// 轮询或 WS：是否有待队员确认的 Plan B
const state = await GET(`/api/trips/${tripId}/decision-events`);
if (state.pendingRollback && isMember) {
  showRollbackConfirmSheet(state.pendingRollback);
}

// 队长发起 Plan B（全托管 INTJ 场景）
await POST(`/api/trips/${tripId}/decision-events`, {
  type: 'route_rollback',
  action: 'propose',
  planBRef: 'rain-shelter-detour-v2',
  milestoneId: 'day2_blind_nav',
  evidenceRefs: ['weather-alert-id'],
});

// 队员确认 / 异议
await POST(`/api/trips/${tripId}/decision-events`, {
  type: 'route_rollback',
  action: 'confirm', // 或 'protest'
  note: '同意改线',
});
// 全员 confirm 后 pendingRollback=null，dnaScheduled=true
```

### 7.2 Active Trip Dashboard（聚合首屏）

成团跳转 `/trips/{tripId}/active` 后 **单次 GET**：

```bash
curl "$API/api/trips/$TRIP_ID/active" -H "Authorization: Bearer $TOKEN"
```

| 区块 | 字段 | 说明 |
|------|------|------|
| 行程摘要 | `trip` | name / dates / status |
| 当前用户 | `viewer` | `role`, `awaitingViewerAction`, `canProposeRollback` |
| Match Square 来源 | `matchSquare` | 非搭子成团则为 `null` |
| 场景工具箱 | `contextualCards[]` | 配置驱动卡片，含 `toolRoute` |
| 车队 DNA | `crewDnaPanel[]` | MBTI + 称号 + 互评星 |
| 协同任务 | `collaborativeTasks[]`, `taskSummary` | 行中任务飞轮 |
| Rollback | `pendingRollback` | 待队员确认的 Plan B |
| Vault 契约 | `routeContractLock` | Phase 3 里程碑授权（`viewerCanAuthorize`） |
| 子 API | `apiPaths` | tasks / decision-events / route-contract-lock / **decision-replay** / **template-backflow** / **physical-fitness-events** |

**Route Contract Lock（Phase 3）**

```typescript
// 队员签署 Vault 里程碑
await POST(`/api/trips/${tripId}/route-contract-lock/authorize`, {
  milestoneId: 'fjordungakvisl_ford', // 省略则一次签全部待签项
});

// 全托管队长调整顺序（锁定前）
await POST(`/api/trips/${tripId}/route-contract-lock/reorder`, {
  milestoneIds: ['fjordungakvisl_ford', 'hut_landmannalaugar', 'hut_thorsmork'],
  note: '先过涉水再进 hut',
});
```

`viewer.awaitingViewerAction === 'authorize_vault_milestone'` 时展示授权 CTA。

完整契约见 [active-trip-dashboard-integration.md](./active-trip-dashboard-integration.md)。

**Decision Replay（Abu 叙事）**

```typescript
const replay = await GET(`/api/trips/${tripId}/decision-replay`);
renderTimeline(replay.timeline);
renderAbuSection(replay.abuNarrative);
renderPersonas(replay.personaSections); // abu / drDre / neptune

// PRD 3.13 — 预测 vs 观测 fingerprint 对撞（有 collab_flywheel_audit_snapshots 时返回）
if (replay.flywheelAuditReport) {
  const audit = replay.flywheelAuditReport;
  renderAuditBadge(audit.match ? '预测已印证' : '预测待观察');
  renderAssertionList(audit.assertions); // { id, passed, message }[]
  // audit.signals.noisePredictionValidated / roleAnchorObserved 等
}

// 行后模板范例回流预览（不写 DB）
const backflow = await GET(`/api/trips/${tripId}/template-backflow/preview`);

// 队长确认提交至 RouteTemplate 范例库（幂等）
const committed = await POST(`/api/trips/${tripId}/template-backflow/commit`, {
  note: '团队共识良好，可作为涉水+hut 范例',
  skipIfExists: true,
});
if (committed.alreadyCommitted) {
  showToast('已提交过回流范例');
}
```

| `payload.derived_fields` | 同上两字段的嵌套副本 `{ itinerary_summary, captain_message }` |
| `payload.teamwork_contract_model` | canonical 枚举（算法用，**勿直接展示**） |
| `teamworkContractModelLabel` | **UI 展示** — `全托管` / `一起策划` / `一起随便玩` |
| `payload.hard_gates.budget_range` | 如 `¥2000-5000 / 人`、`经济弹性` |
| `payload.hard_gates` | `education_baseline` / `industry_preference` / `security_level`（含 `Medium`） |
| `payload.parse_version` | `vibe_llm_v2` — 可忽略，仅调试 |
| `payload.slot_definitions[]` | 拼图补位：`expected_tag` + `reason` |
| `payload.behavioral_contracts[]` | 申请 Bottom Sheet 行为条款 |
| `payload.contract_hint` | 输入框底部微缩提示文案 |
| `suggestedPlanningStyle` | 映射为 `full_managed` / `co_planning` / `casual_play` |
| `realtime_ready` | 是否已有可展示 chips |

**前端自动填充（推荐）**

```typescript
const { data } = await parseVibeFreeText(freeText);
if (data.suggestedItinerarySummary && !userEdited.itinerary) {
  setItinerarySummary(data.suggestedItinerarySummary);
}
if (data.suggestedCaptainMessage && !userEdited.captain) {
  setCaptainMessage(data.suggestedCaptainMessage);
}
if (data.payload.vibe_chips) setVibeChips(data.payload.vibe_chips);
if (data.suggestedPlanningStyle && !userEdited.planning) {
  setPlanningStyle(data.suggestedPlanningStyle);
}
const sf = data.suggestedFields;
if (sf.destinationRegionId && !userEdited.destinationRegion) {
  setDestinationRegionId(sf.destinationRegionId);
}
if (sf.destinationSubScopeId && !userEdited.destinationSubScope) {
  setDestinationSubScopeId(sf.destinationSubScopeId);
}
if (sf.destination && !userEdited.destination) setDestination(sf.destination);
if (sf.departureLabel && !userEdited.departure) setDepartureLabel(sf.departureLabel);
if (sf.budgetMinCents != null && !userEdited.budget) setBudgetMinCents(sf.budgetMinCents);
if (sf.budgetMaxCents != null && !userEdited.budget) setBudgetMaxCents(sf.budgetMaxCents);
if (sf.travelMode && !userEdited.travelMode) setTravelMode(sf.travelMode);
if (sf.tripMoodTag && !userEdited.mood) setTripMoodTag(sf.tripMoodTag);
if (sf.preferenceNotes && !userEdited.preference) setPreferenceNotes(sf.preferenceNotes);
setTeamworkPreviewLabel(data.teamworkContractModelLabel);
// 硬门槛预览：data.payload.hard_gates.budget_range + hardGatesSummary 逻辑
// teamPuzzle 预览：payload.slot_definitions（reason 已带「AI: 」前缀）
```

用户手动改过某字段后，建议对该字段设 `userEdited` 标记，后续 parse 不再覆盖。

**发布提交**：在 `POST /posts` 增加可选字段 `vibeFreeText`（≤2000 字）与 **`vibeParse`**（parse 响应快照）。`itinerarySummary` 可留空（有 vibe 时服务端自动补全）。服务端会：

1. **优先**使用 `vibeParse` 落库至 `captainPersonaSnapshot._vibeParse` + `_vibeLlm`（不再丢弃客户端 parse）
2. 缺省时用 `suggestedItinerarySummary` / `suggestedCaptainMessage` 写入帖子
3. 用 `suggestedPlanningStyle` **覆盖** `planningStyle`（传了 `vibeFreeText` 或 `vibeParse` 时）
4. `GET /posts/:id` 返回 **`post.vibeParse`**（与发布时快照同构）+ `vibeLlm` + `recruitmentVision` + 拼图优先 `slot_definitions`

Card/Detail 新增 `vibeLlm`：

```json
{
  "recruitmentVision": "自驾环游中国，路上一起做饭穷游和露营…",
  "vibeLlm": {
    "visionText": "自驾环游中国，路上一起做饭穷游和露营…",
    "chips": [{ "id": "cooking_partner", "label": "🍳 炊事合伙人" }],
    "contractHint": "💡 AI 已为你自动生成…",
    "teamworkContractModel": "Co-Creation",
    "teamworkContractModelLabel": "一起策划",
    "hardGatesSummary": ["预算范围：¥2000-5000 / 人", "学历门槛：Bachelor 及以上", "授信等级：High（需身份认证）"],
    "behavioralContracts": [{ "title": "炊事合伙人行为契约", "clauses": ["…"] }],
    "parseSource": "rules"
  }
}
```

**申请预览**：`GET /posts/:id/apply-preview` 额外返回 `vibeBehavioralContracts[]`；若未满足 AI 硬门槛则 `canApply: false`（学历/授信）。

环境变量（**默认 LLM 主路径 + 规则校准**；纯规则回退：`VIBE_LLM_ENABLED=false`）：`VIBE_LLM_PROVIDER=deepseek|openai|vllm`

完整 Prompt 规范（含 Few-Shot Example 1–8 与 Gold Dataset 剧本）：[vibe-llm-prompt.md](./vibe-llm-prompt.md) · 源码 `src/match-square/config/vibe-llm-system-prompt.config.ts` · 剧本配置 `vibe-recruitment-scripts.config.ts`

#### 7.0.1 前端改动清单（Vibe LLM v2）

| 区域 | 必做 | 说明 |
|------|------|------|
| **发布页 · 招募愿景输入** | ✅ | 新增 `vibeFreeText` 多行输入；debounce 调用 `POST /vibe-llm/parse` |
| **发布页 · 自动填充** | ✅ | 解析结果写入 `itinerarySummary`、`captainMessage`、`planningStyle`；用户手动编辑过的字段设 `userEdited` 不再覆盖 |
| **发布页 · Vibe 预览** | ✅ | 渲染 `payload.vibe_chips[]` 胶囊；底部 `contractHint`；组队风格用 **`teamworkContractModelLabel`**（中文） |
| **发布页 · 硬门槛预览** | 推荐 | 展示 `hard_gates.budget_range` + 学历/圈层/授信（`Medium` 不阻断申请，仅展示） |
| **发布页 · 拼图预览** | 推荐 | 本地用 `payload.slot_definitions` 渲染 open slot；`expected_tag` + `reason`（已含 `AI:` 前缀） |
| **发布提交** | ✅ | `POST /posts` 增加 `vibeFreeText`；`itinerarySummary` 可留空（有 vibe 时服务端补全） |
| **列表 Card** | 可选 | 有 `vibeLlm` 时在 chips 区展示前 3–4 个 `vibeLlm.chips`；组队仍用现有 `teamworkStyleCapsule` |
| **详情页 hero** | ✅ | 有 `recruitmentVision` 时作为引言/副标题；**不要**用 `itinerarySummary` 替代 |
| **详情页 · Vibe 折叠区** | ✅ | `vibeLlm != null` 时展示 chips + `contractHint` + `hardGatesSummary`；组队标签读 **`teamworkContractModelLabel`** |
| **详情页 · 行程/寄语** | ✅ | `itinerarySummary` = 客观行程；`captainMessage` = 对搭子期待；与 `recruitmentVision` 分开展示（见 §4.1） |
| **详情页 · 拼图** | ✅ | 有 Vibe 帖时 open slot 已由后端 `slot_definitions` 驱动；直接渲染 `post.teamPuzzle.slots` |
| **申请预览** | ✅ | `GET /posts/:id/apply-preview` 读 `vibeBehavioralContracts`；`canApply: false` 时展示 blockReason（学历/High 授信） |
| **类型定义** | ✅ | 卡片增加 `recruitmentVision`、`vibeLlm`；解析响应增加 `teamworkContractModelLabel`、`suggestedItinerarySummary` 等（见文首 TS） |

**展示约定**

- `teamworkContractModel`（英文 canonical）仅用于调试或埋点；用户可见文案统一 **`teamworkContractModelLabel`** 或 Card 已有 **`planningStyleLabel` / `teamworkStyleCapsule`**。
- `recruitmentVision` ≡ `vibeLlm.visionText`；旧帖两者均为 `null`，详情只展示 destination + itinerary。
- Vibe chips 带 emoji 前缀（如 `🍳 炊事合伙人`），直接渲染 `label` 即可。

#### 7.0.2 预算 / 费用展示规范（PM 定稿）

**「预算全包」「预算无上限」等费用承诺 ≠ Vibe chip**，走 **Hard Gate / 契约层**；勿在 chips 区单独做「预算全包」胶囊。

| 语义 | 展示层 | API 字段 | 列表示例 |
|------|--------|----------|----------|
| 费用承担 / 人均区间 | **Hard Gates 一行** | `post.budgetRange` + `vibeLlm.hardGatesSummary[]` 中含 `预算范围：` 的行 | `💰 预算无上限` / `💰 ¥15000–30000 / 人` |
| 体验档次 / luxury 圈层 | **Vibe chip（可选）** | `vibeLlm.chips[]` 中 `luxury_tier` | `💎 高净值顶配` |
| 分工 / 服从 / 队长主导 | **Vibe chip + 组队风格** | `captain_full_service` chip + `teamworkStyleCapsule` | `🎯 队长全包指挥` + `🛡️ 组队风格：全托管` |
| 玩法气质 | **Vibe chip** | 其余 `vibe_chips` | `🌊 冲浪/跳伞` · `🎵 海滩电音节` |

**列表 Card 推荐布局**

```
海南万宁或者清迈 · 杭州 · 6月下旬
💰 预算全包 · 🛡️ 组队风格：全托管          ← Hard Gates（P0，合并去重）
深度松弛 · 跨界高能 · 音乐狂欢 · 极限 Adrenaline   ← vibe chips（体验向，≤4）
队长 · 泛科技·产品总监 · …
```

**前端硬性要求**

1. **禁止**从 `vibeLlm.chips` 中再筛「全包 / 预算 / 费用」类文案冒充预算展示。
2. 预算只读 `post.budgetRange` 与 `vibeLlm.hardGatesSummary`（或 parse 时的 `hard_gates.budget_range`）。
3. Chips 区只展示 **体验 / 气质 / 分工** 标签；与 Hard Gate 重复的行（如既有 `预算无上限` hard gate 又有同义 chip）应去重，**保留 Hard Gate**。
4. `💎 高净值顶配` 与 `💰 预算无上限` **可并存**：前者是 luxury 圈层信号，后者是费用契约，语义不重复。
5. `🎯 队长全包指挥` 仅当小作文表达 **行中服从 / 不用动脑 / 闭眼跟** 时出现；纯「我出钱全包」不触发该 chip（后端 lexicon 已收窄）。

**详情页**：Hard Gates 与 Vibe 折叠区分列；`contractHint` 可写「队长承担主要费用，队员默认签署行中服从条款」（当 `captain_full_service` 或 `full_managed` 命中时）。

**发布页预览**：`hard_gates.budget_range` 展示在「硬门槛预览」区，与 `vibe_chips` 分区，勿合并为一列。

```typescript
/** 列表 Card — Hard Gates 优先，chips 不含预算文案 */
function buildListCardGates(post: RecruitmentPostCard): string[] {
  return buildHardGatesSummary(post); // 见 §4.1
}

function filterExperienceChips(chips: VibeChip[]): VibeChip[] {
  const budgetLike = /^(💰|预算|费用|全包|¥|\d+[wW万])/;
  return chips.filter((c) => !budgetLike.test(c.label.replace(/\s/g, '')));
}
```

#### 7.0.3 徒步 Layer 0 体能硬约束（PRD 3.14）

Premium Trekking 剧本（如 `iceland_laugavegur_heavy_trek`）激活 **Layer 0 物理熔断**，优先于 MBTI / 学历 / 圈层。

**HARD GATES 外显（队长发布 / 列表 Card）**

```
🏃 体能门槛：Level 4 · 重装进阶
系统将自动拦截无重装/高海拔经验的申请者
```

读 `post.vibeLlm.hardGatesSummary[]`，后端已合并，勿前端拼。

**申请预览** `GET .../apply-preview`

| 字段 | 说明 |
|------|------|
| `physicalFitnessGate.blocked` | `true` → 只展示 `blockReason`，**隐藏申请表单** |
| `physicalSurvivalQuiz[]` | Level 4+ 且未拦截 — 2 道户外生存题 |
| `physicalFitnessGate.report` | 通过时的拟合摘要（可选） |

**申请提交** — Level 4+ 必传：

```json
{ "physicalSurvivalQuizAnswers": { "river_ford_gear_order": "a" } }
```

未达标或答错 → **不会进入队长待审列表**。

**队长审批** — `applications[].physicalFitnessReport` / `decisionBrief.physicalFitnessReport`：拟合度 %、`evidenceLabel`、分项 lines。

**行后负反馈（Active Trip）**

```typescript
// 队长/协作者上报体能风控 → 调低队员 baseline + 异步 Decision DNA
await POST(`/api/trips/${tripId}/physical-fitness-events`, {
  eventType: 'mid_trip_evacuation', // route_rollback | rescue_called | member_fitness_collapse
  subjectUserId: '<队员 userId>',
  evidenceLabel: 'D2 高反下撤',
});

// 协同任务 rollback 时可附带 fitnessSubjectUserId 自动联动
await POST(`/api/trips/${tripId}/collaborative-tasks/${taskId}/events`, {
  action: 'rollback',
  note: '队员体能崩溃',
  fitnessSubjectUserId: '<队员 userId>',
});
```

规范全文：[prd-3.14-physical-hard-gates-trekking.md](./prd-3.14-physical-hard-gates-trekking.md)

---

### 7.1 组队风格契约 Teamwork Style（PRD 3.4.4 · 必选）

解决「责任边界 / 期望管理」——与 `tripMoodTag`（放松/冒险）和 `captainInteractionMode`（相处模式，自动带入）**独立**。

| `teamworkStyle` / `planningStyle` | 胶囊文案 | 行为边界 |
|-----------------------------------|----------|----------|
| `full_managed` | 🛡️ 组队风格：全托管 | 队长主导；队员体验为主、高服从 |
| `co_planning` | 🛡️ 组队风格：一起策划 | 共创分工；民主决策 |
| `casual_play` | 🛡️ 组队风格：一起随便玩 | 无硬日程；可即兴脱队 |

选项池（推荐）：`GET /filters/options` → **`teamworkStyles[]`**（含 `boundary` / `algorithmMapping` / `contractCapsule`）

Card 字段：
- `teamworkStyleCapsule` — 直接渲染胶囊，如 `🛡️ 组队风格：全托管`
- `teamworkMatchBlocked` + `teamworkBlockReason` — 算法 Hard Gate 熔断时隐藏契合度

**3.5.1 算法规则（已实现）**

| 组合 | 效果 |
|------|------|
| 全托管 + 甩手掌柜型队员 | 契合度 **+15%** |
| 全托管 + 也想深度策划 | **-20%** + 冲突预警 |
| 随便玩 + 强 J 人 | **Hard Gate 熔断**，`canApply: false` |
| 随便玩 + 高 P 人 | **+10%** |

**申请承诺（PRD 防雷卡点）**

`GET /posts/:id/apply-preview` 返回 `teamworkCommitmentPrompt` 时，提交需：

```json
{ "message": "...", "teamworkCommitmentAccepted": true }
```

三档承诺文案见 preview 的 `message` 字段；与 `planningCommitmentAccepted`（计划硬度）可同时存在。

```bash
curl -X POST "$API/api/match-square/posts" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "destination": "西北环线",
    "planningStyle": "co_planning",
    "startDate": "2026-07-01",
    "endDate": "2026-07-10",
    "itinerarySummary": "每日大致路线与核心打卡点……",
    "slotsNeeded": 1
  }'
```

兼容 snake_case：`planning_style`；响应同时含 `teamworkStyle` / `planningStyle`（同值）

### 7.2 完整表单示例

```bash
curl -X POST "$API/api/match-square/posts" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "destination": "西北环线",
    "departureLabel": "杭州出发",
    "startDate": "2026-07-01",
    "endDate": "2026-07-10",
    "itinerarySummary": "每日大致路线与核心打卡点……",
    "budgetMinCents": 300000,
    "budgetMaxCents": 500000,
    "slotsNeeded": 1,
    "planningStyle": "co_planning",
    "tripMoodTag": "relax",
    "travelMode": "self_drive",
    "vehicleInfo": "坦克300，剩余2座",
    "captainMessage": "希望搭子对人文历史有兴趣，不赶路"
  }'
```

**校验**：

- `startDate` ≥ 今天；`endDate` ≥ `startDate`
- `slotsNeeded` ∈ [1, 6]
- `planningStyle` **必填**（三档之一）
- `itinerarySummary` ≤ 500 字
- `travelMode === "self_drive"` 时 `vehicleInfo` 必填

**自动带入**（无需前端传）：`captainCardTitle`、`captainInteractionMode`、人格快照 JSON。

**响应结构（重要）**：

```json
{
  "success": true,
  "data": {
    "id": "57afc700-0207-4f12-9962-141e971377f7",
    "post": { "id": "57afc700-...", "status": "active", "...": "..." }
  }
}
```

- 发帖成功后请读 **`data.id`** 或 **`data.post.id`**（不要读 `data.postId` 或裸 `data` 当 post）
- 广场列表必须调 **`GET /api/match-square/posts`**，不是 `GET /posts/:id`
- 发布后刷新列表示例：`POST /posts` → `GET /posts?limit=20`

**常见坑**：若日志出现 `GET /api/match-square/posts/undefined`，说明前端 `id` 取错，列表也不会更新。

**生命周期**：

```bash
curl -X PATCH "$API/api/match-square/posts/$POST_ID/status" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"status":"hidden"}'
```

`active` | `hidden` | `closed`

---

## 8. 申请加入（PRD 4.3）

### Step 1 — 预览（含冲突弹窗）

```bash
curl "$API/api/match-square/posts/$POST_ID/apply-preview" \
  -H "Authorization: Bearer $TOKEN"
```

若 `conflictPrompt` 非空，展示 PRD 弹窗：

> 检测到你们对「计划硬度」的认知存在差异，你是否愿意向队长做出不迟到、配合核心行程的承诺声明？

用户确认后 Step 2 传 `planningCommitmentAccepted: true`。

若 `teamworkCommitmentPrompt` 非空（如队长选「一起随便玩」且你 J 维偏高），展示组队风格承诺弹窗，确认后传 `teamworkCommitmentAccepted: true`。

### Step 2 — 提交

```bash
curl -X POST "$API/api/match-square/posts/$POST_ID/applications" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Danny 你好！我被你的西北路线吸引了……",
    "planningCommitmentAccepted": true,
    "teamworkCommitmentAccepted": true,
    "targetSlotIndex": 1,
    "targetSlotId": "puzzle-slot-1",
    "targetSlotLabel": "建议补位 · 会开车的摄影师"
  }'
```

- `message` 必填，**≤200 字**
- `targetSlotIndex` / `targetSlotId` / `targetSlotLabel` **可选但推荐**：与详情 `post.teamPuzzle.slots[]` 对齐（用户点某一 open 位申请时传入）
  - snake_case 别名：`target_slot_index`、`target_slot_id`、`target_slot_label`（后端均接收；响应为 camelCase）
  - `slotId` 格式：`puzzle-slot-{n}` 或 Vibe 帖 `vibe-slot-{slot_id}`
  - `slotIndex` 为成员位 **1..slotsNeeded**（0 为队长，不可申请）
  - `targetSlotLabel` 通常传 `slots[].roleLabel`；未传时后端按槽位推导
- **响应**（201）含 `targetSlotIndex`、`targetSlotId`、`targetSlotLabel`（与请求一致或后端推导值）
- 未确认承诺且存在冲突 → `VALIDATION_ERROR`
- 槽位已被占用或已有 pending 申请 → `VALIDATION_ERROR`
- `teamworkMatchBlocked: true` 时预览直接 `canApply: false`，勿展示申请表单

### 队长审批

```bash
# 待审批列表（两路径等价）
curl "$API/api/match-square/posts/$POST_ID/applications?status=pending" \
  -H "Authorization: Bearer $TOKEN"

curl "$API/api/match-square/my/posts/$POST_ID/applications?status=pending" \
  -H "Authorization: Bearer $TOKEN"

# 通过（满员后帖子自动 closed）
curl -X PATCH "$API/api/match-square/posts/$POST_ID/applications/$APP_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"action":"approve"}'

# 拒绝
curl -X PATCH "$API/api/match-square/posts/$POST_ID/applications/$APP_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"action":"reject"}'
```

**approve 响应**：`{ application, teamPuzzle }` — `teamPuzzle.slots` 中对应位变为 `kind: "filled"` 并带 `occupantLabel`。  
申请列表/卡片字段：`targetSlotIndex`, `targetSlotId`, `targetSlotLabel`（申请时绑定；approve 后帖子详情拼图同步更新）。

---

## 9. 与 Odyssey Intake 的关系

| | Odyssey Intake | Match Square |
|--|----------------|--------------|
| 用途 | 5 题测评、名片、trust | 招募帖、申请、审批 |
| 入口 | My Profile 头部 | 搭子广场 Tab |
| 路径 | `/api/odyssey-intake/*` | `/api/match-square/*` |

Match Square **硬依赖** Odyssey 测评完成；`compatibilityPercent` 与申请 `highlights/warnings` 共用底层人格向量。

---

## 10. Reputation OS（P2 已实现）

详见 [reputation-os/frontend-integration-guide.md](../reputation-os/frontend-integration-guide.md)。

- 行程 `endDate + 48h` → `GET /api/reputation-os/pending-surveys`
- 五星问卷 → `POST /api/reputation-os/surveys/submit`
- 个人主页 → `GET /api/reputation-os/profile/me`
- 队长审批已注入 `applicantReputationStars`（实时）、`safetyWarning` 与 **`decisionBrief`**（PRD 3.13）

---

## 11. Match Learning（P3 已实现）

撮合 Soft Weights 每周自迭代，详见 [match-learning/frontend-integration-guide.md](../match-learning/frontend-integration-guide.md)。

---

## 12. Swagger

本地开发：`GET /api/docs` → 标签 **match-square**

---

## 13. PRD 3.7 智能撮合与动机促进（已实现）

### 13.1 拼图化需求展示（Team Deficit POMDP v1）

列表 Card 的 **`teamPuzzle`** 由队长人格快照 + 行程约束 + 背书画像动态计算缺位，**禁止**写死「拼图位 1/2/3」。

| 缺位维度 | 算法依据 | 示例标签 |
|----------|----------|----------|
| `energy_balance` | 队长 I 偏高 → 补 E 对外沟通 | 建议补位 · 满血复活的社交气氛组 |
| `risk_resilience` | 队长低不确定性容忍 → 补 T 应急 | 建议补位 · 硬核理性应急担当 |
| `trust_alignment` | 自驾/高背书 → 同圈层成熟队友 | 建议补位 · 泛科技圈/高信用背书的老司机 |

```typescript
type TeamPuzzleSlot = {
  kind: 'filled' | 'open';
  slotIndex?: number;
  slotId?: string;            // puzzle-slot-{n} | vibe-slot-{id}
  roleLabel: string;        // "建议补位 · …" 或 "队长"
  occupantLabel?: string;
  aiRationale?: string;     // 第二行小字：AI 依据
  deficitDimension?: 'energy_balance' | 'risk_resilience' | 'trust_alignment' | 'preference';
  highlightForViewer: boolean;
  viewerMatchScore?: number;
};

type TeamPuzzle = {
  progressLabel: string;
  algorithm?: 'team_deficit_pomdp_v1';
  slots: TeamPuzzleSlot[];
  viewerPuzzleMatch?: {
    isSoulPiece: boolean;
    headline: string;       // "你正是本队缺少的灵魂拼图"
    matchedSlotIndex: number;
    matchedRoleLabel: string;
  } | null;
};
```

渲染示例（ISFJ 队长）：

```
🧩 车队拼图进度
[🧑‍✈️ 队长 · 秩序维护的质感旅行者]
  + [🧩 建议补位 · 满血复活的社交气氛组]
      (AI：队长偏内向，建议 E 人带飞)
  + [🧩 建议补位 · 硬核理性应急担当]
  + [🧩 建议补位 · 会开车的摄影师]
```

- `highlightForViewer === true` → 呼吸灯 + 可选全卡 shimmer
- `viewerPuzzleMatch.isSoulPiece === true` → 顶部横幅「你正是本队缺少的灵魂拼图」

### 13.2 灵魂旅伴闪送卡（Match Flash）

`GET /api/match-square/posts` 在 **登录 + 完成测评 + offset=0** 时额外返回：

| 字段 | 说明 |
|------|------|
| `feedItems` | 混合流：`{ kind: 'post', post }` 与 `{ kind: 'match_flash', flash }` |
| `matchFlash` | 最佳闪送卡（可为 `null`）；匹配度 ≥88% 且 warnings ≤1 |

闪送卡 UI：

- 背景：`theme: 'shimmer_gradient'`（微弱流光渐变，区别于白底 Card）
- 文案：AI 判词 `headline` + `aiVerdict` + `bullets[]`
- 按钮：`ctaPrimary` →「⚡️ 闪速补位」(`flash_apply`)，`ctaSecondary` →「💬 勾搭一下」(`chat_captain`)
- 插入位置：第 1 张普通 Card 之后（`insertAfterIndex: 1`）

前端推荐：**优先渲染 `feedItems`**；`posts` 仍保留以兼容旧逻辑。

### 13.3 意图反向触达（橄榄枝）

#### 队员 — 挂起旅行意向

个人主页旅行人格卡片下方状态，对应 API：

```bash
# 挂起/更新
curl -X POST "$API/api/match-square/my/travel-intent" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "destinationScope": "6月下旬·西北或新疆",
    "startDate": "2026-06-20",
    "endDate": "2026-07-05",
    "budgetFlex": "flexible",
    "openToCarpool": true,
    "note": "希望拼车，预算可高可低"
  }'

# 读取
curl "$API/api/match-square/my/travel-intent" -H "Authorization: Bearer $TOKEN"

# 暂停
curl -X PATCH "$API/api/match-square/my/travel-intent/status" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"status":"paused"}'
```

#### 队长 — 雷达 + 投递橄榄枝

发布招募后，`GET /api/match-square/my/posts` 每条 active 帖可带 **`radarHint`**：

```json
{ "eligibleCount": 3, "topPickDisplayName": "王小野" }
```

详情雷达：

```bash
curl "$API/api/match-square/posts/$POST_ID/radar" -H "Authorization: Bearer $TOKEN"
```

响应含 `picks[]`（匹配度 ≥85%）、`systemHint`（系统红点文案模板）。

投递橄榄枝：

```bash
curl -X POST "$API/api/match-square/posts/$POST_ID/olive-branch" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "inviteeUserId": "USER_UUID", "inviteMessage": "看到你的旅行人格很契合" }'
```

#### 队员 — 收件箱与回应

```bash
curl "$API/api/match-square/my/olive-branch-invitations" -H "Authorization: Bearer $TOKEN"

curl -X PATCH "$API/api/match-square/olive-branch-invitations/$INVITATION_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"action":"accept"}'
```

接受后 `nextAction: "view_post_and_apply"`，跳转 `GET /posts/:id` → 常规申请流。

---

## 14. PRD 3.1.2 / 3.1.3 身份背书资产（Verified Credentials）

授信 API 与隐私规范见 [odyssey-intake/frontend-integration-guide.md](../odyssey-intake/frontend-integration-guide.md) §8–§9 及 [prd-3.1.3-asset-verification-privacy.md](../odyssey-intake/prd-3.1.3-asset-verification-privacy.md)。

**前端硬性要求**：标签必须用 `dossier.*.badge.renderHint === 'vector_component_watermark'` 的矢量/水印组件渲染；禁止让用户手动填写未授信的社会背景。

### 广场 Card 字段 `verifiedCredentials`

| 路径 | 用途 |
|------|------|
| `headline.identityHeadline` | 列表第二行：姓名 · 职业 · 学历 |
| `headline.trustAssetLine` | 列表第三行：芝麻信用 · 组队风格 |
| `dossier` | 详情页「信任档案」抽屉 |

### 他人信任档案 API

队长详情页已内嵌 `post.verifiedCredentials`；查看**申请人**、**雷达候选人**等非 Card 场景：

```bash
curl "$API/api/match-square/users/$USER_ID/credentials" \
  -H "Authorization: Bearer $TOKEN"

# 查看队长且需组队风格胶囊时附带 postId
curl "$API/api/match-square/users/$CAPTAIN_USER_ID/credentials?postId=$POST_ID" \
  -H "Authorization: Bearer $TOKEN"
```

**响应**：

```json
{
  "success": true,
  "data": {
    "userId": "...",
    "cardTitle": "规划型探索者",
    "mbtiType": "INTJ",
    "verifiedCredentials": { "headline": {}, "dossier": {} }
  }
}
```

- 需登录且完成测评（与申请流相同门槛）
- 本人完整编辑走 Odyssey `GET /credentials/me`；本接口为**只读**他人视图

### 3.5.1 圈层同频度（已实现）

- 行业相近：**+10%**
- 学历带宽对齐：**+8%**
- 弱交集：**+2%**
- 队长芝麻极低 / 放鸽子高风险：**Hard Gate**，列表不展示该帖（`recommendationHidden`）

---

## 15. 常见坑（联调速查）

| 现象 | 原因 | 处理 |
|------|------|------|
| `GET /posts/undefined` | 发帖后读了 `data.postId` 或裸 `data` | 用 `data.id` 或 `data.post.id` |
| 发帖后列表空 | 调了 `GET /posts/:id` 而非列表 | `GET /api/match-square/posts?limit=20` |
| `travel-intent` 500 / trim 报错 | body 字段名不匹配 | 用 camelCase 或 snake_case 别名（见 §13） |
| 队长看不到申请 404 | 路径写错 | `GET /posts/:id/applications` 或别名 `GET /my/posts/:postId/applications` |
| Card 无背书行 | captain 未认证 | Odyssey `GET /credentials/me` → 引导 §8 认证 |
| 申请人无 dossier | 审批页只读了 application 卡片 | `GET /users/:userId/credentials` |
| 申请 400 | 缺承诺勾选 | 读 `apply-preview` 的 `conflictPrompt` / `teamworkCommitmentPrompt` |
| 列表无某帖 | Hard Gate | 检查 `recommendationHidden`；勿强行渲染隐藏帖 |
| Match Flash 不出现 | 非首页 offset | 仅 `GET /posts?offset=0` 返回 `feedItems` + `matchFlash` |
| 详情页信息重复 / 决策翻译来源不清 | 平铺 teamPuzzle + vibeLlm + drawer + 本地兜底 | 见 **§4.1**；决策翻译只绑 `matchInsightDrawer` |
| 决策翻译为空 | 未登录或未完成测评 | 带 token；`quizComplete` 为 true 后才有 drawer |
