# 执行阶段 · 快速操作与成员状态 · 接口要求（P0）

> 产品：执行 Dock「快速操作」= **我的状态** + **行程操作**（上下文面板）  
> iOS：`ExecutionQuickActions*` / `ExecutionMemberStatus*`  
> **样式不跟稿**：只锁 API 契约、枚举、生命周期与是否进决策空间。  
> **状态：** P0 已落地 Mobile BFF（`Trip.metadata.mobileExecution`）；iOS 可替换本地 Store。  
> **最后更新：** 2026-07-20

**相关：**

- [`IN_TRIP_HOME_API.md`](../in-trip-home/IN_TRIP_HOME_API.md) — heading / 关键节点 / 提醒（本能力**不**替代）
- [`EXECUTE_NATIVE_API.md`](../../auth/EXECUTE_NATIVE_API.md) — presence / SOS / 团队状态读模型
- 活跃风险与待调整项 — 仅当硬时间窗受影响时才生成调整确认

**实现：**

| 文件 | 职责 |
|------|------|
| `src/mobile/services/mobile-execution-quick-actions.service.ts` | 读/写 + 生命周期 |
| `src/mobile/utils/execution-quick-actions.projection.util.ts` | 场景 / 建议 / 文案投影 |
| `src/mobile/dto/mobile-execution-quick-actions.types.ts` | DTO |
| `MobileExecutionController` | routes under `execution/...` |

---

## 0. 能力边界（先读）

| 能力 | 回答的问题 | 是否进 Decision Space |
|------|------------|------------------------|
| **我的状态上报** | 我身体/位置/参与上怎么了？ | **默认否** → 成员状态 + 执行建议 |
| **行程操作上报** | 现场与系统假设不一致 / 执行进度变化 | **默认否**；影响硬时间窗才生成调整确认 |
| **成员状态详情** | 这条需求处理到哪一步了？ | 否 |
| **领队代报** | 谁替谁记了什么？ | 否（必须区分来源） |

**禁止：**

- 把「需要上厕所 / 需要休息」只写成群消息而不给可执行建议  
- 在团队页每个人头像下铺一排快捷按钮  
- 把「上厕所」与「需要休息」合成同一 `needCode`（选点逻辑不同）

---

## 1. 产品一句话

> **面向当前执行上下文的状态上报与行动入口：全员报个人需求；领队/驾驶员/授权成员才能改行程级状态。系统把需求变成可执行建议，并管理生命周期，避免三小时前的「想上厕所」一直标红。**

---

## 2. 通用约定

### 2.1 路径（相对 `baseURL`，已含 `/api`）

```
mobile/trips/{tripId}/execution/quick-actions/context
mobile/trips/{tripId}/execution/member-status-reports
mobile/trips/{tripId}/execution/member-status-reports/{reportId}
mobile/trips/{tripId}/execution/member-status-reports/{reportId}/transition
mobile/trips/{tripId}/execution/trip-field-reports
mobile/trips/{tripId}/execution/trip-field-reports/{reportId}/resolve
```

完整前缀：`/api/mobile/trips/{tripId}/execution/...`  
P0 **无** canonical `/api/trips/...` 双写要求。

### 2.2 响应信封

与行中首页一致：

```json
{
  "success": true,
  "data": { },
  "requestId": "uuid",
  "tripId": "trip-xxx",
  "contextVersion": 142,
  "serverTime": "2026-07-20T08:30:00Z"
}
```

写操作必须带回新 `contextVersion`（根级和/或 `data` 内）。

### 2.3 请求头

| Header | 读 | 写 | 说明 |
|--------|----|----|------|
| `Authorization: Bearer <token>` | 必填 | 必填 | |
| `X-Client-Version` | 建议 | 建议 | |
| `Idempotency-Key` | — | **必填** | 创建上报 / transition / trip-field；UUID；重放 → `replay: true` |
| `If-Match: <contextVersion>` | — | 建议（行程级写强建议） | 冲突 → `CONTEXT_VERSION_CONFLICT` |

### 2.4 错误码

| code | 场景 | iOS |
|------|------|-----|
| `UNAUTHORIZED` / `FORBIDDEN` | 未登录 / 非成员 / 无代报权限 | 常规鉴权 |
| `NOT_FOUND` | trip / report 不存在 | 提示并返回 |
| `VALIDATION_ERROR` | 枚举非法 / 非法生命周期跳转 | 检查请求 |
| `CONTEXT_VERSION_CONFLICT` | `If-Match` 不匹配 | 重拉后再试 |
| `REPORT_ALREADY_TERMINAL` | 已 `RESOLVED` / `CANCELLED` 再改 | 刷新详情 |
| `PROXY_NOT_ALLOWED` | 无代报权限 | Toast |
| `SUBJECT_CANNOT_BE_SELF_FOR_PROXY` | 代报 `subjectMemberId == 自己` 且 `source=PROXY` | 改走自报 |

### 2.5 WebSocket

`trip_context_changed` 的 `changedSections` 建议含：

| section | 客户端动作 |
|---------|------------|
| `member_status` | 重拉 open reports / team-status / 首页成员关注条 |
| `execution` | 重拉 in-trip-home（建议点可能变） |
| `adjustment_queue` | 仅当本次上报触发了调整确认时 |

---

## 3. 接口一览

| 优先级 | 方法 | 路径 | 用途 |
|--------|------|------|------|
| **P0** | `GET` | `.../quick-actions/context` | 当前场景 + 可见操作集（按角色） |
| **P0** | `GET` | `.../member-status-reports` | 列表（默认 open；可滤成员） |
| **P0** | `POST` | `.../member-status-reports` | 自报 / 代报 |
| **P0** | `GET` | `.../member-status-reports/{reportId}` | 详情 + 建议 + 时间线 |
| **P0** | `POST` | `.../member-status-reports/{reportId}/transition` | 生命周期流转 |
| **P0** | `POST` | `.../trip-field-reports` | 行程操作现场上报 |
| P1 | `POST` | `.../trip-field-reports/{id}/resolve` | 关闭行程现场报告 |
| P1 | 扩展 | `GET .../execution/team-status` | 成员卡嵌入 `activeReport` 摘要 |

---

## 4. GET 快速操作上下文

```
GET /api/mobile/trips/{tripId}/execution/quick-actions/context
```

`data.schemaId` = `tripnara.execution_quick_actions_context@v1`

### 4.1 `data` Schema

| 字段 | 类型 | 说明 |
|------|------|------|
| `scene` | enum | `DRIVING` \| `AT_POI` \| `DELAY_RISK` |
| `sceneLabelZh` | string | 展示文案 |
| `viewerRole` | object | 见下 |
| `myStatusActions` | string[] | 允许的 `needCode` |
| `tripActions` | string[] | 允许的 `tripActionCode`（按 scene 过滤后） |
| `openReportCount` | int | 当前用户相关未关闭报告数（可选角标） |

`viewerRole`：

```json
{
  "isLeader": true,
  "isOrganizer": false,
  "isCurrentDriver": false,
  "canManageTrip": true,
  "canProxyReport": true
}
```

**裁定：**

- `scene` 由服务端根据 live 执行态（在途 / 到点 / 硬窗风险）计算，客户端**不要**自行发明业务规则（本地启发式仅作离线降级）。
- `canManageTrip` / `canProxyReport`：领队、Organizer、被授权同行成员。

### 4.2 示例

```json
{
  "schemaId": "tripnara.execution_quick_actions_context@v1",
  "scene": "DRIVING",
  "sceneLabelZh": "驾驶途中",
  "viewerRole": {
    "isLeader": true,
    "isOrganizer": false,
    "isCurrentDriver": false,
    "canManageTrip": true,
    "canProxyReport": true
  },
  "myStatusActions": [
    "NEED_TOILET", "NEED_REST", "CARSICK", "HUNGRY", "TOO_COLD",
    "UNWELL", "FELL_BEHIND", "NEED_HELP", "ARRIVED", "WAIT_FOR_ME",
    "SHARE_LOCATION", "SKIP_NEXT", "RETURN_EARLY", "LOWER_INTENSITY", "CAN_CONTINUE"
  ],
  "tripActions": [
    "NEED_REST", "CHANGE_DRIVER", "LOW_FUEL", "ROAD_MISMATCH",
    "VEHICLE_ISSUE", "SAFE_STOP", "PAUSE_TRIP"
  ],
  "openReportCount": 1
}
```

---

## 5. 成员状态报告（我的状态）

### 5.1 `needCode`（P0 必支持）

| code | 中文 | 选点/响应提示 |
|------|------|----------------|
| `NEED_TOILET` | 需要上厕所 | 有厕所且可能营业的设施 |
| `NEED_REST` | 需要休息 | 安全停车即可；驾驶员疲劳升权 |
| `CARSICK` | 晕车 | 尽快安全停车 |
| `HUNGRY` | 饿了 | 顺路补给 |
| `TOO_COLD` | 太冷 | 装备 / 提前室内 |
| `UNWELL` | 身体不舒服 | 尽快停车；可升 `NEED_HELP` |
| `FELL_BEHIND` | 掉队 | 共享位置 + 集合点 |
| `NEED_HELP` | 需要帮助 | 可并行打开 SOS 通道，但仍先落报告 |
| `ARRIVED` | 我已到达 | 更新成员位置态 |
| `WAIT_FOR_ME` | 等我一下 | 团队协调 |
| `SHARE_LOCATION` | 请求共享位置 | 触发/强化 location share |
| `SKIP_NEXT` | 我不参加下一项 | 参与状态 |
| `RETURN_EARLY` | 我想提前回酒店 | 参与状态 |
| `LOWER_INTENSITY` | 降低活动强度 | 参与状态 |
| `CAN_CONTINUE` | 我可以继续 | 通常直接关闭同类 open 报告 |

### 5.2 生命周期 `lifecycleStatus`

```
REPORTED → TEAM_AWARE → ARRANGED → RESOLVED
                ↘ CANCELLED
         任意非终态也可 → CANCELLED（本人或有权限者）
```

| status | 中文 | 谁可转入 |
|--------|------|----------|
| `REPORTED` | 已上报 | 创建时默认 |
| `TEAM_AWARE` | 团队已知晓 | 领队/授权；或系统在推送送达后自动 |
| `ARRANGED` | 已安排处理 | 领队/授权（需带安排摘要） |
| `RESOLVED` | 已解决 | 本人 / 领队/授权；到达建议点后可弹确认 |
| `CANCELLED` | 已取消 | 本人（含纠正代报）/ 领队 |

**规则：**

- 首页「成员状态」**只展示非终态**（`REPORTED` / `TEAM_AWARE` / `ARRANGED`）。
- 超过服务端配置 TTL（建议默认 3h）仍未关闭 → 自动 `CANCELLED` 或降为低优先级归档（P1；P0 至少不要继续标红）。
- **驾驶员**上报 `NEED_REST` / `UNWELL` / `CARSICK` → `priority = SAFETY_HIGH`，建议文案强调尽快停靠 + 更换驾驶员 CTA。

### 5.3 POST 创建报告

```
POST /api/mobile/trips/{tripId}/execution/member-status-reports
Idempotency-Key: <uuid>
```

**Body：**

```json
{
  "needCode": "NEED_REST",
  "source": "SELF",
  "subjectMemberId": null,
  "note": null,
  "clientContext": {
    "lat": 63.4,
    "lng": -19.0,
    "accuracyM": 25,
    "reportedAt": "2026-07-20T08:28:00Z"
  }
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `needCode` | 是 | 见 §5.1 |
| `source` | 是 | `SELF` \| `PROXY` |
| `subjectMemberId` | 代报时必填 | 被记录成员；`SELF` 时忽略，服务端用当前用户 |
| `note` | 否 | ≤ 200 字 |
| `clientContext` | 建议 | 位置；无 GPS 时服务端可用最近 presence |

**代报裁定：**

- 仅 `canProxyReport=true`
- 展示文案必须区分：  
  - 自报：`阿音报告：需要休息`  
  - 代报：`Danny 为阿音记录：需要休息`
- 本人可 `CANCELLED` 或用新报告纠正

**响应 `data`：** 完整 `MemberStatusReport`（含 `suggestion`，见 §5.5）。  
若评估会影响硬时间窗：

```json
"itineraryImpact": {
  "affectsHardWindow": true,
  "hardWindowLabelZh": "冰川徒步 · 18:10 集合",
  "adjustmentQueueItemId": "adj-xxx",
  "requiresUserConfirm": true
}
```

`affectsHardWindow=false` 时：**不要**创建 DecisionProblem；最多挂执行建议。

### 5.4 GET 列表

```
GET .../member-status-reports?scope=open&memberId=&limit=50
```

| Query | 默认 | 说明 |
|-------|------|------|
| `scope` | `open` | `open` \| `all` \| `mine` |
| `memberId` | — | 过滤 subject |
| `limit` | 50 | |

### 5.5 GET 详情

```
GET .../member-status-reports/{reportId}
```

`MemberStatusReport` 核心字段见 DTO。`suggestion` / `arrangement` / `allowedTransitions` 由服务端投影。

### 5.6 POST 生命周期流转

```
POST .../member-status-reports/{reportId}/transition
Idempotency-Key: <uuid>
```

```json
{
  "toStatus": "ARRANGED",
  "arrangement": {
    "summaryZh": "18 分钟后在 Dyrhólaey 停靠",
    "placeId": "poi-xxx",
    "etaMinutes": 18
  },
  "note": null
}
```

非法跳转 → `VALIDATION_ERROR`。

---

## 6. 行程操作（现场 / 执行进度）

### 6.1 `tripActionCode` 与场景

| scene | 典型 actions |
|-------|----------------|
| `DRIVING` | `NEED_REST`, `CHANGE_DRIVER`, `LOW_FUEL`, `ROAD_MISMATCH`, `VEHICLE_ISSUE`, `SAFE_STOP`, `PAUSE_TRIP` |
| `AT_POI` | `ARRIVED`, `START_ACTIVITY`, `EXTEND_STAY`, `END_EARLY`, `SKIP_PLACE`, `CONTACT_MERCHANT` |
| `DELAY_RISK` | `VIEW_ADJUST_PLAN`, `CONTACT_MERCHANT`, `NAVIGATE_MEETING`, `CANCEL_ACTIVITY`, `ADD_STOP`, `VIEW_ALTERNATIVES` |

领队额外常驻（任意 scene，服务端可并入 `tripActions`）：  
`PAUSE_TRIP`, `SKIP_PLACE`, `EXTEND_STAY`, `ADJUST_REMAINING`, `CONTACT_MERCHANT`, `ADD_STOP`

### 6.2 POST 行程现场报告

```
POST /api/mobile/trips/{tripId}/execution/trip-field-reports
Idempotency-Key: <uuid>
If-Match: <contextVersion>   # 建议
```

多数操作是「更新 World State / 执行进度」，**不是**立刻改行程。  
`followUp.type`：`NONE` \| `OPEN_ADJUSTMENT_QUEUE` \| `OPEN_RUNBOOK` \| `OPEN_NAVIGATION` \| `OPEN_CONTACT` \| `PROMPT_CHANGE_DRIVER`

---

## 7. 与团队状态 / 首页的投影

- 首页「成员状态」只展示非终态；点击进详情 Sheet。  
- `PUT .../members/{id}/presence` 继续负责位置心跳；本报告**不替代** presence。
- **P1 已落地：** `GET .../execution/team-status` 成员卡可含：

```json
{
  "activeReport": {
    "reportId": "msr-xxx",
    "needCode": "NEED_REST",
    "needLabelZh": "需要休息",
    "lifecycleStatus": "REPORTED",
    "priority": "SAFETY_HIGH",
    "updatedAt": "2026-07-20T08:28:00Z"
  },
  "needsAttention": true,
  "distanceToTeamLabelZh": "与团队同行"
}
```

无 open 报告的成员**不**返回 `activeReport`（不要铺空按钮）。

---

## 8. 推荐调用流

### 8.1 成员自报「需要上厕所」

```
1. GET quick-actions/context
2. POST member-status-reports { needCode: NEED_TOILET, source: SELF }
3. 展示 suggestion（厕所 / ETA / 绕行 / 是否影响硬窗）
4. 领队打开详情 → transition TEAM_AWARE → ARRANGED
5. 到达后 → RESOLVED
```

### 8.2 curl 联调示例

```bash
BASE=http://192.168.8.153:8080/api
TOKEN=<accessToken>
TRIP=<tripId>
IDEM=$(uuidgen)

# 快速操作上下文
curl -s "$BASE/mobile/trips/$TRIP/execution/quick-actions/context" \
  -H "Authorization: Bearer $TOKEN" | jq

# 自报：需要上厕所
curl -s -X POST "$BASE/mobile/trips/$TRIP/execution/member-status-reports" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEM" \
  -d '{"needCode":"NEED_TOILET","source":"SELF","clientContext":{"lat":63.4,"lng":-19.0}}' | jq

REPORT_ID=<上一步 data.id>

# 列表（默认 open）
curl -s "$BASE/mobile/trips/$TRIP/execution/member-status-reports?scope=open" \
  -H "Authorization: Bearer $TOKEN" | jq

# 详情
curl -s "$BASE/mobile/trips/$TRIP/execution/member-status-reports/$REPORT_ID" \
  -H "Authorization: Bearer $TOKEN" | jq

# 领队：团队已知晓 → 已安排
curl -s -X POST "$BASE/mobile/trips/$TRIP/execution/member-status-reports/$REPORT_ID/transition" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"toStatus":"TEAM_AWARE"}' | jq

curl -s -X POST "$BASE/mobile/trips/$TRIP/execution/member-status-reports/$REPORT_ID/transition" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"toStatus":"ARRANGED","arrangement":{"summaryZh":"18 分钟后在 Dyrhólaey 停靠","placeId":"poi-toilet-dyrholaey","etaMinutes":18}}' | jq

# 本人：标记已解决
curl -s -X POST "$BASE/mobile/trips/$TRIP/execution/member-status-reports/$REPORT_ID/transition" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"toStatus":"RESOLVED"}' | jq

# 行程操作：路况不符（领队/驾驶员）
curl -s -X POST "$BASE/mobile/trips/$TRIP/execution/trip-field-reports" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "If-Match: <contextVersion>" \
  -d '{"actionCode":"ROAD_MISMATCH","payload":{"roadIssue":"SNOW","note":"能见度差"}}' | jq

# 延误：打开待调整（可不建 report）
curl -s -X POST "$BASE/mobile/trips/$TRIP/execution/trip-field-reports" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"actionCode":"VIEW_ADJUST_PLAN"}' | jq

# 团队页：应看到 activeReport 摘要
curl -s "$BASE/mobile/trips/$TRIP/execution/team-status" \
  -H "Authorization: Bearer $TOKEN" | jq '.data.members[] | select(.activeReport != null)'
```

---

## 9. iOS 映射（目标）

| 后端 | iOS |
|------|-----|
| `GET quick-actions/context` | `ExecutionQuickActionsSheet` 场景/角色 |
| `POST member-status-reports` | 我的状态按钮 → 结果 Sheet |
| `GET/transition reports` | `ExecutionMemberStatusDetailSheet` |
| `POST trip-field-reports` | 行程操作按钮 |
| `GET team-status.activeReport` | 首页/团队成员关注条 |
| WS `member_status` | 刷新首页关注条 + 团队页 |

---

## 10. 联调验收

- [ ] `needCode` 厕所 ≠ 休息，建议 POI 类型不同  
- [ ] 驾驶员 `NEED_REST` → `SAFETY_HIGH` + 换驾 CTA  
- [ ] 自报 / 代报 `sourceLabelZh` 文案正确  
- [ ] 非终态才出现在首页；`RESOLVED` 后消失  
- [ ] `affectsHardWindow=false` 不进 Decision Space  
- [ ] `affectsHardWindow=true` 才出现 `adjustmentQueueItemId`  
- [ ] 非法 lifecycle 跳转被拒  
- [ ] Idempotency 重放不双写  
- [ ] `team-status` 成员卡嵌入 `activeReport`（无报告则不出现）

---

## 11. 已裁定

1. 快速操作是**上下文状态上报与行动入口**，不是普通快捷菜单。  
2. **我的状态**全员可用；**行程操作**仅领队/驾驶员/授权。  
3. 个人上报默认进成员状态 + 执行建议，**不进** Decision Space。  
4. 生命周期必须可关闭，避免陈旧需求长期标红。  
5. 代报必须区分来源，且本人可纠正。  
6. 文案优先服务端 `*Zh`。  
7. P0 路径仅 `/api/mobile/...`。
