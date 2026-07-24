# ADR-009: Contextual Same-Day Micro-Planning

## Status

Accepted (2026-07-16)

## Context

Mobile / Web「当天活动推荐」此前别名到 `attraction-explore/recommendations`：全国核心 POI 池 + 软排序，输出景点卡片。这不符合用户心智——落地日问的是「接下来几小时还能做什么」，不是「冰岛必去榜」。

用户正确模型：

- 前端传 **Context Delta**（现场状态与意图）
- 后端拼 **Canonical Context Snapshot**（行程、预订、团队画像、World State）
- **检索 → 约束 → 组合求解 → 排序 → 解释**，输出 1 个主方案 + ≤2 备选

## Decision

### 1. 产品定义

**情境化微规划（SAME_DAY_ACTIVITY）**：在不破坏已确认计划的前提下，利用接下来几小时给出可立即执行的安排。

不是 POI 筛选；不是「猜你喜欢」。

### 2. 职责划分

| 上下文 | 来源 |
|--------|------|
| 当前位置、当前时间、临时疲劳/晕车、此刻意图、可用到何时 | 前端 `contextDelta` |
| 落地日判定、已确认酒店、家庭结构、长期体能、Active Plan、明日早发 | 后端 `tripId` 权威上下文 |
| 天气、道路、关闭 | Travel World State（后续接入） |

### 3. 流水线（MVP → 完整）

```
Intent 规则编译（可选 LLM 精炼）
  → Context Builder（delta ⊕ canonical ⊕ World State 天气 ⊕ 焦点日）
  → Retriever（ETA + 本地 Place）
  → Combination solver（enumeration_v1：模板×候选）
  → Feasibility 硬/软约束（修复或 REJECT）
  → Ranking（gate × 效用分）
  → Narrative（observation + reasonCodes）
  → Commit（门禁后写入 Active Plan）
```

MVP 已含落地日 / 行程中剩余时间窗、意图编译、天气 soft 约束、**轻量组合求解**、可行性校验与 commit 门禁。完整 OR-Tools 仅在需要跨日/多约束全局优化时再接入。

### 4. API

```
POST /api/trips/:tripId/contextual-recommendations
POST /api/mobile/trips/:tripId/planning/contextual-recommendations  （别名）
```

请求：`scenario` + `intent?` + `contextDelta`  
响应：`observation` + `recommendation`（schedule / impact / gate）+ `alternatives[]`

既有 `GET .../activities/recommendations` **保持不变**（景点探索心智），不混用。

### 5. 冰岛 ARRIVAL_DAY 硬规则（MVP）

拒绝（默认）：远距蓝湖绕行、教会山等半岛必看、长徒步、需临时强预约、影响明日早发的晚归。

允许：入住 → 酒店附近晚餐 → 可选短距海滨/哈帕轻散步；或更轻松「晚饭后休息」。

## Consequences

- 前端不再拼装完整旅行世界状态
- 当天推荐与景点探索 API 心智分离
- 后续可插 World State / 路线 ETA / 完整求解器，契约保持稳定
- 「Client Delta ⊕ Canonical Snapshot」原则被 [ADR-010 Page Insight](../copilot/ADR-010-Nara-Contextual-Copilot-Page-Insight.md) 跨页复用；本 ADR 仍只管 SAME_DAY_ACTIVITY，不并入 page-insight
