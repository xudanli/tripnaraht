# 规划阶段 — 自动编排接口文档

> 目标 UI：日程编排 Dock「自动编排」、`AISchedulingSchemeView`、添加活动页「自动编排」  
> 原则：**只出 Proposal 草案，用户确认后再 Apply**；禁止默认 `direct` 直写  
> **不要**实现旧路径 `POST .../planning/ai-optimize`  
> 更新：2026-07-16

---

## 1. 产品流程

```
候选池 / 已排行程
    ↓
① 生成草案（auto-arrange 或 ai-actions）
    ↓
② 方案页预览（schemePreview / diff / validation）
    ↓
③ Apply 写入  或  Discard 丢弃
    ↓
④ 刷新 schedule-timeline
```

| 入口 | 调用 |
|------|------|
| Dock / 添加活动「自动编排」 | `POST .../attraction-explore/auto-arrange` |
| 方案页「优化当日路线」 | `POST .../arrange-itinerary/ai-actions`（`optimize_route`） |
| 确认写入 | `POST .../arrange-itinerary/proposals/{id}/apply` |
| 放弃草案 | `POST .../arrange-itinerary/proposals/{id}/discard` |

---

## 2. 自动编排候选 → Proposal

### 2.1 请求

```
POST /api/trips/{tripId}/attraction-explore/auto-arrange
Authorization: Bearer <token>
X-Trip-Id: <tripId>          # 可选但推荐
Content-Type: application/json
```

**HTTP：** `202 Accepted`（信封仍看 `success: true`）

**Mobile 别名（契约相同，强制 proposal）：**

```
POST /api/mobile/trips/{tripId}/planning/auto-arrange
```

Mobile 响应额外带 `requestId` / `tripId` / `serverTime`。

### 2.2 Body

空对象合法：`{}`

```typescript
{
  candidateIds?: string[]     // 仅编排这些候选；缺省 = 候选池全部
  dayIndex?: number           // 1-based，优先从该天起排；缺省 = 从第 1 天均匀分配
  mode?: "proposal"           // 若传则强制草案
  commitMode?: "proposal" | "direct"  // 默认 proposal；iOS 勿用 direct
  options?: {
    respectNoNightDrive?: boolean   // 默认按 true 处理（17 点后换日）
    maxDailyDriveMinutes?: number   // 提示字段，写入 source.payload
    preferWeekendBuffer?: boolean   // 周末上午从 10:00 起排
  }
}
```

### 2.3 成功响应

```json
{
  "success": true,
  "data": {
    "mode": "proposal",
    "tripId": "…",
    "orchestrationState": {
      "tripId": "…",
      "phase": "AWAITING_CONFIRMATION",
      "activeProposalId": "proposal_…",
      "contextVersion": 2680722676,
      "updatedAt": "2026-07-15T16:39:16.876Z"
    },
    "proposal": {
      "proposalId": "proposal_…",
      "tripId": "…",
      "intent": "AUTO_ARRANGE",
      "basePlanVersion": 13,
      "contextVersion": 2680722676,
      "affectedDays": [1],
      "changes": [
        {
          "operation": "ADD",
          "candidateId": "…",
          "placeId": 381084,
          "dayIndex": 1,
          "startTime": "09:00",
          "endTime": "11:00",
          "label": "黄金瀑布",
          "itemType": "ACTIVITY",
          "note": "[景点探索] 黄金瀑布",
          "removeFromCandidates": true
        },
        {
          "operation": "REMOVE_CANDIDATE",
          "candidateId": "…",
          "dayIndex": 1,
          "label": "黄金瀑布"
        }
      ],
      "benefits": { "itemsAdded": 2 },
      "tradeoffs": ["自动编排按优先级均匀分配到各天，确认后可再微调"],
      "validation": {
        "status": "PASS",
        "warnings": [],
        "conflicts": []
      },
      "diff": {
        "summary": "将新增 2 个行程项",
        "timelineChanges": [
          {
            "operation": "ADD",
            "label": "新增：黄金瀑布",
            "dayIndex": 1,
            "to": "1 09:00-11:00",
            "impact": "low"
          }
        ]
      },
      "schemePreview": {
        "analysisSteps": [
          { "id": "scan_candidates", "title": "扫描候选与已排行程", "completed": true },
          { "id": "allocate_slots", "title": "分配日期与时段", "completed": true },
          { "id": "validate", "title": "校验冲突与驾驶负荷", "completed": true }
        ],
        "suggestions": ["已为 2 个候选生成自动编排草案，请预览后确认写入。"],
        "comparison": {
          "currentDriving": "—",
          "optimizedDriving": "待确认后统计"
        },
        "executableItems": [
          {
            "id": "cand-ac2c9fdd-…",
            "title": "Day 1 · 黄金瀑布",
            "defaultEnabled": true
          }
        ],
        "timelinePreview": [
          {
            "id": "cand-ac2c9fdd-…",
            "dayIndex": 1,
            "time": "09:00",
            "title": "黄金瀑布",
            "status": "insertSlot"
          }
        ]
      },
      "requiresConfirmation": true,
      "status": "AWAITING_CONFIRMATION",
      "answer": "已为 2 个候选生成自动编排草案，请预览后确认写入。",
      "createdAt": "…",
      "expiresAt": "…",
      "source": { "type": "auto_arrange", "payload": {} },
      "decisionPack": {}
    }
  }
}
```

**硬性约束**

- 必为 `mode: "proposal"` + `requiresConfirmation: true`
- 未 Apply 前 Active Plan / `schedule-timeline` **不变**
- 有候选为空时不要返回空 `proposal`，见 §5

### 2.4 `schemePreview` 字段（方案页优先用）

| 字段 | 说明 |
|------|------|
| `analysisSteps[]` | 分析步骤进度 |
| `suggestions[]` | 3~5 条人话建议 |
| `comparison` | 驾驶/准备度对比文案 |
| `executableItems[]` | 可开关执行项；`id` 给 Apply `enabledItemIds` |
| `timelinePreview[]` | 预览时间轴；`status`: `confirmed` \| `planned` \| `insertSlot` \| `conflict` |

无 `schemePreview` 时回退渲染 `diff` + `validation.warnings`。

### 2.5 `validation.status`

服务端枚举：`PASS` \| `WARN` \| `BLOCK`  
（与部分旧文档 `OK` / `BLOCKED` 同义时，以本字段为准）

---

## 3. 优化当日路线 → Proposal

### 3.1 请求

```
POST /api/trips/{tripId}/arrange-itinerary/ai-actions
```

探索页等价：`POST .../attraction-explore/ai-actions`  
**日程编排推荐统一走 `arrange-itinerary/ai-actions`。**

```json
{
  "action": "optimize_route",
  "dayIndex": 1,
  "candidateIds": null,
  "commitMode": "proposal"
}
```

### 3.2 合法 `action`（必须小写蛇形）

| action | 用途 | UI |
|--------|------|----|
| `optimize_route` | 优化当日驾驶/顺序 | 「优化当日路线」 |
| `fill_gaps` | 用候选补空档 | 可挂添加活动页 |
| `arrange_lunch` | 安排午餐 | 可选 |
| `reduce_intensity` | 降低行程强度 | 可选 |
| `reduce_driving` | 压缩驾驶负荷 | 映射 `optimize_route` |
| `resolve_conflicts` | 消解当日冲突 | 映射 `optimize_route` |

`OPTIMIZE_ROUTE`（大写）→ **400**。

响应外壳与 §2.3 相同（`mode` / `proposal` / `orchestrationState`），另可有 `answer`、`suggestedActions`。

---

## 4. Apply / Discard

### 4.1 Apply

```
POST /api/trips/{tripId}/arrange-itinerary/proposals/{proposalId}/apply
```

```json
{
  "contextVersion": 2680722676,
  "force": false,
  "enabledItemIds": ["cand-ac2c9fdd-…"],
  "comment": "采用自动编排草案"
}
```

| 字段 | 说明 |
|------|------|
| `contextVersion` | **强烈建议带回**；与生成时不一致 → 409 |
| `force` | `true` 时忽略 `WARN`；`BLOCK` 仍需处理 |
| `enabledItemIds` | 可选；对应 `schemePreview.executableItems[].id`；缺省应用全部 |
| `comment` | 可选备注 |

成功：`status = APPLIED`，`orchestrationState.phase` 离开 `AWAITING_CONFIRMATION`，`contextVersion` 更新。  
有 `removeFromCandidates: true` 的 ADD 写入后会从候选池删除对应候选。

### 4.2 Discard

```
POST /api/trips/{tripId}/arrange-itinerary/proposals/{proposalId}/discard
```

Body 可空。成功返回草案，`status = DISCARDED`。

---

## 5. 错误码

| 场景 | HTTP | code / errorCode | 客户端 |
|------|------|------------------|--------|
| 无候选可编排 | 400 | `NO_CANDIDATES` | Toast：先添加候选 |
| 无行程日 | 400 | `NO_TRIP_DAYS` | 提示补齐行程日期 |
| 版本冲突 | 409 | `CONTEXT_VERSION_CONFLICT` | 拉新 `contextVersion` 后重试 |
| 草案 BLOCK 且未 force | 400 | — | 展示 `validation.conflicts` |
| 未选任何 executableItem | 400 | — | 至少开一项再确认 |
| 非成员 | 403 | — | 常规会话 |
| 行程不存在 | 404 | — | — |

---

## 6. iOS 接入要点

1. Dock「自动编排」→ `attraction-explore/auto-arrange`（或 mobile 别名）
2. 方案页优先读 `proposal.schemePreview`，否则 `diff` + `validation`
3. 确认 → `apply` 带回 `contextVersion`；可选 `enabledItemIds`
4. 放弃 → `discard`
5. Apply 后刷新 `GET .../schedule-timeline`；若空间 Tab 已打开，同步刷新 [`spatial-route`](../../mobile/SPATIAL_ROUTE_API.md)
6. **不要**接 `planning/ai-optimize`

Repository 对照：

| 能力 | 建议方法 |
|------|----------|
| 自动编排 | `autoArrangeAttractionCandidates` |
| 优化当日 | `runAIAction(.optimizeRoute)` |
| Apply / Discard | `applyProposal` / `discardProposal` |

---

## 7. 验收

- [x] 空候选 → `NO_CANDIDATES`；有候选 → `intent=AUTO_ARRANGE` proposal  
- [x] 未 Apply 前正式时间轴不变  
- [x] Apply 后日程出现新增点；`removeFromCandidates` 时候选移除  
- [x] `contextVersion` 冲突返回 `CONTEXT_VERSION_CONFLICT`  
- [x] `optimize_route` 小写稳定；文档列出全部 action  
- [x] `schemePreview` 可供方案页展示  
- [x] discard 路径稳定：`.../proposals/{id}/discard`

---

## 8. 相关文件

- 实现：`AttractionExploreArrangeController.autoArrange`  
- Builder：`PlanProposalBuilderService.buildAutoArrangeProposal`  
- Preview：`scheme-preview.projection.util.ts`  
- 总文档：`ARRANGE_ITINERARY_API.md` / `ARRANGE_ITINERARY_IOS_HANDOFF.md`  
- 空间路线（规划 Tab，Apply 后需刷新几何）：[`SPATIAL_ROUTE_API.md`](../../mobile/SPATIAL_ROUTE_API.md)
