# 执行页用户叙事契约 — 事实 → 影响 → 建议 → 操作

**状态：** Draft · 2026-07-12  
**受众：** Mobile / BFF / ERC / Slice 4 / TEP  
**关联：** [EXECUTION-ALERTS-AND-ADJUSTMENT-QUEUE-BFF.md](./EXECUTION-ALERTS-AND-ADJUSTMENT-QUEUE-BFF.md)

---

## 1. 问题陈述（产品共识）

当前执行页的主要问题 **不是「数据多」**，而是 **没有回答用户最关心的三件事**：

| # | 用户问题 | 当前失败模式 |
|---|---------|-------------|
| 1 | **发生了什么？** | 「道路 / 可行性」「决策冲突」「ERC Alert」—— 系统分类，不是事实 |
| 2 | **对今天行程有什么具体影响？** | 「1 个行程项受影响」「派生影响」—— 无地点、无时间、无活动名 |
| 3 | **我现在应该怎么选？** | 「保持原计划」+「重新规划」并存；按钮与 `recommendedAction` 方向相反 |

**原则：** 每个真实事件在用户面 **只出现一次**；「为什么」默认折叠，不暴露因果链 / 派生影响等内部概念。

---

## 2. 目标内容模型（用户语言）

### 2.1 示例 — 待调整项

```
发生了什么：
  前往蓝湖温泉的道路预计延误 45 分钟

影响：
  按原计划出发，可能错过 18:00 的预约。

建议：
  提前 30 分钟出发，或改走 Route 1。

操作：
  [ 提前 30 分钟出发 ]  [ 查看其他方案 ]
```

### 2.2 示例 — 风险提醒

```
发生了什么：
  当前路线不建议继续行驶

影响：
  前往蓝湖温泉的道路临时封闭，原路线无法通行。
  受影响：蓝湖温泉预约 · 18:00

建议：
  改走 Route 1，预计增加 25 分钟。

操作：
  [ 采用绕行方案 ]  [ 查看影响详情 ]

（为什么 · 默认折叠）
```

### 2.3 禁止直接展示的词汇（用户面）

| 内部词 | 替换策略 |
|--------|---------|
| 道路 / 可行性 | 具体路段 + 具体原因（封路 / 强风 / 延误） |
| 当前行程无法按原计划执行 | 哪段路 / 哪个活动 / 什么条件下不可行 |
| 决策冲突 / RFC-001 | 折叠进「为什么」；用户面用自然语言 |
| 关联风险 / 派生影响 / ERC Alert | 不展示标签；合并进「影响」一句 |
| 停止执行（孤立标签） | 配合事实句：「…不建议继续行驶」 |

---

## 3. 页面职责（两层 + 折叠层）

```
┌─────────────────────────────────────────┐
│ 风险提醒（execution-alerts）             │
│  回答：发生了什么 + 影响什么（只读）      │
│  不承载完整决策与写回                     │
└─────────────────────────────────────────┘
                    ↓ 需要决定时
┌─────────────────────────────────────────┐
│ 待调整项（adjustment-queue）             │
│  只展示需要用户作决定的具体事项           │
│  每条 = 一个可执行选择                   │
└─────────────────────────────────────────┘
                    ↓ 想了解原因
┌─────────────────────────────────────────┐
│ 为什么（折叠，默认关闭）                  │
│  causalChain / 证据 / 技术 trace         │
└─────────────────────────────────────────┘
```

| 页 | 接口 | 卡片数目标 |
|----|------|-----------|
| 风险提醒 | `execution-alerts` | **1 主事件 + N 真正独立事件**（非同根因不合并，同根因必须合并） |
| 待调整项 | `adjustment-queue` | **= 需要用户确认的事项数**（强风链 4 problem → 1 项，靠 Slice 4） |

---

## 4. API 叙事字段契约（已实现 Phase B 骨架）

在现有 `title` / `reason` / `recommendedAction` 之上，BFF **输出** 四段用户叙事：

```typescript
/** 用户叙事 — 风险提醒与待调整项共用 */
interface ExecutionUserNarrativeDto {
  /** 发生了什么 — 一句事实，含地点/路段/天气/封路等 */
  whatHappened: string;
  /** 对今日行程的影响 — 含活动名、预约时间、延误分钟数 */
  impactOnTrip: string;
  /** 建议 — 一句可执行方案，与主按钮同向 */
  recommendation: string;
  /** 受影响实体（可选结构化，供 UI 高亮） */
  affected?: {
    activities?: Array<{ label: string; time?: string }>;
    route?: string;
    reservation?: { label: string; time: string };
  };
}

/** 与叙事一致的操作按钮 — label 必须来自推荐方案，不得与 recommendation 矛盾 */
interface ExecutionUserActionDto {
  label: string;
  action: string;
  actionId?: string;
  enabled: boolean;
  /** 叙事角色：primary = 推荐方案；secondary = 查看其他/保留原方案 */
  role: 'primary' | 'secondary' | 'defer';
}
```

### 4.1 挂载位置

| DTO | 新增字段 |
|-----|---------|
| `ExecutionAlertDto`（primary + independent） | `userNarrative`, `userActions[]` |
| `ExecutionInterventionDto`（adjustment item） | `userNarrative`, `userActions[]`（与 `actions` 对齐或逐步替代展示用 `actions`） |
| `ExecutionAlertsDto` | 移除用户面 `schemaId` / `projectionSource` / `ERC` 类调试展示 |

### 4.2 字段生成优先级（后端）

| 段 | 来源优先级 |
|----|-----------|
| `whatHappened` | Advisory `causalStory` → Environment 事件标题 → `affectedRoute` + hazard → **禁止** `semanticKey` / `RFC-001` 直出 |
| `impactOnTrip` | `affectedActivities` + `actionDeadline` / 预约窗 → TEP `recoveryGraph` 影响句 → memberImpacts |
| `recommendation` | Top `recommendation.label`（含路线名、+N 分钟）→ **禁止** 与 `executionGate=STOP` 并存的「保持原计划」 |
| `userActions[].label` | 与 `recommendation` 同源；`STOP` 时 primary = 绕行/改方案，不是「重新规划」泛化词 |

### 4.3 一致性规则（后端强制）

| 规则 | 行为 |
|------|------|
| R-1 | `executionGate === STOP` 时 `recommendation` 不得含「保持原计划」 |
| R-2 | `userActions[primary].label` 与 `recommendation` 语义同向 |
| R-3 | 同一 `rootCauseKey` / Slice4 cluster 在用户面只产出 **1** 条 `userNarrative` |
| R-4 | `impacts[]` / `consequenceImpacts[]` 合并进 `impactOnTrip` 文案，**不**单独成卡 |
| R-5 | 统计 `pendingCount` / `headline` / `items.length` **必须同源** |

---

## 5. 当前 API 与目标差距

| 能力 | 现状 | 目标 |
|------|------|------|
| 地点/活动名 | `affectedActivities[]` 有，但未编入主文案 | 编入 `whatHappened` / `impactOnTrip` |
| 预约时间 | `actionDeadline` 有，展示为「6:00 PM」无上下文 | `受影响：蓝湖温泉 · 18:00` |
| 具体方案 | `recommendation` / TEP `recoveryGraph` 部分有 | 按钮 = 方案名（「提前 30 分钟出发」） |
| 一事件一卡 | ERC 按 problem 1:1；Slice4 未切 | Slice4 Primary + ERC 合并 |
| 用户叙事块 | 无 `userNarrative`；前端拼 `title+reason` | 后端输出四段结构 |
| 为什么 | `causalChain` 默认外露 | 仅 `GET …/causal-trace` 或折叠区 |

---

## 6. 实施顺序（建议冻结）

```
Phase A — 文案与一致性（可立即，不改接口形状）
  · STOP 抑制「保持原计划」✅ 已做
  · adjustment 统计与 headline 同源 ✅ 已做
  · 单 risk cluster 不覆盖决策原标题 ✅ 已做
  · impacts 英文本地化 ✅ 已做
  · buildClusterTitle 改为地点+原因模板

Phase B — userNarrative 字段（BFF 契约扩展）
  · execution-alerts / adjustment-queue 增加 userNarrative + userActions ✅ 骨架已接入
  · 前端改读四段结构；旧 title/reason 标记 deprecated 展示

Phase C — 一事件一卡（Slice 4 Visible Cutover）
  · 强风链 wind/slip/night/infeasible → 1 Primary
  · 待调整项条数下降；风险页 independent 下降

Phase D — TEP Recovery 深集成
  · recoveryGraph option → userActions.primary.label
  · 「改走 Route 1，+25 分钟」来自真实 RecoveryOption
```

---

## 7. 前端职责（读契约后的 UI 规则）

| 做 | 不做 |
|----|------|
| 渲染 `userNarrative` 四段 | 拼接 `type` / `semanticKey` / `riskType` |
| 主按钮 = `userActions[primary]` | 用 `requiredAction` 硬编码「重新规划」 |
| 「为什么」折叠，点开展 causalChain | 默认展示「决策冲突」「派生影响」 |
| `pendingCount !== items.length` 时信 items | 盲信 headline 与 tab 数字 |
| 副标题用用户句 | 展示 `ERC Alert · 1 主风险 · 3 派生` |

---

## 8. 验收用例（Canary 强风链）

| # | 通过标准 |
|---|---------|
| N-1 | 风险主卡 `whatHappened` 含 **路段或活动名**，不是「道路/可行性」 |
| N-2 | `impactOnTrip` 含 **时间或预约窗**，不是「1 个行程项受影响」 |
| N-3 | `recommendation` 与主按钮 **同向**，无「保持原计划」+「重新规划」并存 |
| N-4 | 待调整项强风链 **≤1 张** 需决定卡（Slice 4 切向后） |
| N-5 | headline 数字 = 列表项数 = pendingCount |
| N-6 | 用户面无「ERC」「派生影响」「关联风险」标签 |

---

## 9. 参考

| 文档 | 路径 |
|------|------|
| BFF 接口 | [EXECUTION-ALERTS-AND-ADJUSTMENT-QUEUE-BFF.md](./EXECUTION-ALERTS-AND-ADJUSTMENT-QUEUE-BFF.md) |
| Slice 4 | [SLICE-4-INTERNAL-DUAL-READ-BFF-HANDOFF.md](./SLICE-4-INTERNAL-DUAL-READ-BFF-HANDOFF.md) |
| TEP 演示目标 | [TEP-PHASE0-STATUS.md](../product/TEP-PHASE0-STATUS.md) §11 |
| Native API | [EXECUTE_NATIVE_API.md](../../src/auth/EXECUTE_NATIVE_API.md) |
