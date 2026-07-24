# iOS 对接样例 — userNarrative（Canary Exec Slip）

**Trip:** `c0c77777-7777-4777-8777-777777777777`  
**Account:** `exec-slip-canary@tripnara.dev`  
**证据 JSON:** [`canary-user-narrative-ios-sample-2026-07-12.json`](../operations/evidence/canary-user-narrative-ios-sample-2026-07-12.json)

> **重要：** 需 **重启 Nest :3002** 后 live API 才返回 `userNarrative`。重启前字段为空，可用本文档样例开发。

```bash
bash scripts/start-nest-3002-slice4-dual-read.sh
```

---

## 1. 风险提醒 — `execution-alerts`

```
GET /api/mobile/trips/c0c77777-7777-4777-8777-777777777777/execution/execution-alerts
Authorization: Bearer <token>
```

### iOS 渲染（优先读 `userNarrative`，勿读 `legacyTitle`）

| UI 区块 | 字段 |
|---------|------|
| 发生了什么 | `primaryRisk.userNarrative.whatHappened` |
| 影响 | `primaryRisk.userNarrative.impactOnTrip` |
| 建议 | `primaryRisk.userNarrative.recommendation` |
| 主按钮 | `primaryRisk.userActions[role=primary].label` |
| 次按钮 | `primaryRisk.userActions[role=secondary].label` |
| 折叠「为什么」 | `primaryRisk.causalChain`（默认隐藏） |

### 样例 — `primaryRisk`（STOP / 夜间驾驶链）

```json
{
  "id": "risk_a06a4ffa833852ba",
  "level": "STOP",
  "presentationRole": "PRIMARY",
  "decisionProblemIds": ["stg_attn_night"],
  "title": "道路 / 可行性：1 个行程项受影响",
  "recommendedAction": "保持原计划",
  "userNarrative": {
    "whatHappened": "当前路线不建议继续按原计划行驶",
    "impactOnTrip": "今日部分安排可能受到影响",
    "recommendation": "查看替代方案后再继续行程",
    "affected": { "activities": [] }
  },
  "userActions": [
    { "label": "查看替代方案后再继续行程", "action": "view_alternatives", "enabled": true, "role": "primary" },
    { "label": "查看影响详情", "action": "view_impact", "enabled": true, "role": "secondary" }
  ]
}
```

**注意：** `title` / `recommendedAction` 为 legacy，**不要**用于用户面。`userNarrative` 已抑制「保持原计划」与 STOP 冲突。

### 样例 — `impacts[]`（合并进主卡「影响」子区块，不单独成卡）

```json
[
  { "type": "SAFETY", "label": "当前路段不建议按原计划行驶" },
  { "type": "DELAY", "label": "驾驶时长超出单日安全上限" },
  { "type": "ITINERARY", "label": "当天后续活动时间需要顺延" }
]
```

### 独立风险卡

遍历 `independentRisks[]`，每张卡同样读 `userNarrative` + `userActions`。  
**不要**使用 `alerts[]`（与 `independentRisks` 重复）。

---

## 2. 待调整项 — `adjustment-queue`

```
GET /api/mobile/trips/c0c77777-7777-4777-8777-777777777777/execution/adjustment-queue
```

### 样例 — `stg_attn_wind`

```json
{
  "id": "stg_attn_wind",
  "decisionProblemId": "stg_attn_wind",
  "type": "SAFETY_INTERVENTION",
  "priority": "CRITICAL",
  "title": "当前行程无法按原计划执行",
  "affectedActivities": ["Exec Slip Canary POI A"],
  "actionDeadline": "2026-07-12T10:00:00.000Z",
  "userNarrative": {
    "whatHappened": "Exec Slip Canary POI A的安排需要调整",
    "impactOnTrip": "受影响：Exec Slip Canary POI A · 10:00",
    "recommendation": "查看替代方案",
    "affected": {
      "activities": [{ "label": "Exec Slip Canary POI A", "time": "10:00" }]
    }
  },
  "userActions": [
    { "label": "查看替代方案", "action": "view_alternatives", "enabled": false, "role": "primary" },
    { "label": "保留原计划", "action": "keep_original", "enabled": false, "role": "secondary" }
  ]
}
```

### 样例 — TEP Local Repair（`intervention-tep-*`）

TEP 卡由 `TepErcBridgeService` 从 `PlanVersion.metadata.tep.recoveryGraph` 投影；**无** `decisionProblemId`。与 Canonical 决策项同事件时，服务端 IS-CERT-404 去重后用户只见 TEP 卡（勿本地 dedupe）。

```json
{
  "id": "intervention-tep-REPAIR-SDR101-D1-activity_item_stop_1",
  "type": "DYNAMIC_REPLAN",
  "priority": "HIGH",
  "title": "驾驶负荷修复建议",
  "reason": "删除可选停靠以降低当日驾驶负荷",
  "recommendedAction": "删除可选停靠以降低当日驾驶负荷",
  "affectedActivities": ["activity_item_stop_1"],
  "requiresConfirmation": true,
  "modifiesEffectivePlan": true,
  "requiresRevalidation": true,
  "userNarrative": {
    "whatHappened": "今日驾驶负荷偏高，继续按原计划可能延误后续活动",
    "impactOnTrip": "受影响：可选停靠点",
    "recommendation": "应用修复以降低驾驶负荷",
    "affected": {
      "activities": [{ "label": "可选停靠", "time": null }]
    }
  },
  "userActions": [
    { "label": "应用修复", "action": "accept", "actionId": "REPAIR-SDR101-D1-activity_item_stop_1", "enabled": true, "role": "primary" },
    { "label": "保留原计划", "action": "keep_original", "enabled": true, "role": "secondary" }
  ],
  "actions": {
    "primary": { "label": "应用修复", "action": "accept", "actionId": "REPAIR-SDR101-D1-activity_item_stop_1", "enabled": true },
    "secondary": { "label": "保留原计划", "action": "keep_original", "enabled": true }
  },
  "recommendation": {
    "title": "删除可选停靠以降低当日驾驶负荷",
    "recommendedActionId": "REPAIR-SDR101-D1-activity_item_stop_1",
    "basePlanVersionId": "plan_cert_302_v1"
  }
}
```

### 写操作

| 动作 | 接口 |
|------|------|
| 主按钮（有 DP） | `POST /api/mobile/trips/{tripId}/decisions/{decisionProblemId}/accept` |
| TEP 修复（`intervention-tep-*`） | `POST /api/mobile/trips/{tripId}/execution/tep-repairs/{interventionId}/accept` |
| 查看详情 | `GET /api/trips/{tripId}/execution-risks/{linkedRiskIds[0]}` |

---

## 3. Swift 映射建议

```swift
struct ExecutionUserNarrative: Decodable {
    let whatHappened: String
    let impactOnTrip: String
    let recommendation: String
    let affected: Affected?
    struct Affected: Decodable {
        let activities: [Activity]?
        let route: String?
        struct Activity: Decodable {
            let label: String
            let time: String?
        }
    }
}

struct ExecutionUserAction: Decodable {
    let label: String
    let action: String
    let actionId: String?
    let enabled: Bool
    let role: String // primary | secondary | defer
}

// ExecutionAlertDto / ExecutionInterventionDto 增加：
// let userNarrative: ExecutionUserNarrative?
// let userActions: [ExecutionUserAction]?
```

展示逻辑：

```swift
if let n = item.userNarrative {
  titleLabel.text = n.whatHappened
  impactLabel.text = n.impactOnTrip
  recommendationLabel.text = n.recommendation
} else {
  // fallback legacy（过渡期）
  titleLabel.text = item.title
}
```

---

## 4. Phase C — Primary SSO 切流（Canary）

```bash
bash scripts/start-nest-3002-slice4-phase-c.sh
```

| 验收项 | 切流前 | 切流后（目标） |
|--------|--------|----------------|
| `projectionSource` | `execution_risk_center` | `execution_risk_center+attention_primary_sso` |
| 待调整项 `items.length` | 7 | **3–4**（强风链合并 + Canonical 去重） |
| `independentRisks.length` | 8 | **≤3**（合并风险抑制） |

**iOS 不变：** 仍只读 `userNarrative` + `userActions`；切流后卡数减少是后端行为，前端无需本地 dedupe。

---

## 5. curl 验证

```bash
TOKEN=$(# mint canary JWT)
TRIP=c0c77777-7777-4777-8777-777777777777
BASE=http://127.0.0.1:3002/api

curl -s "$BASE/mobile/trips/$TRIP/execution/execution-alerts" \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.data.primaryRisk.userNarrative'

curl -s "$BASE/mobile/trips/$TRIP/execution/adjustment-queue" \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.data.items[0].userNarrative'
```

---

## 6. 相关文档

- [EXECUTION-USER-NARRATIVE-CONTRACT.md](./EXECUTION-USER-NARRATIVE-CONTRACT.md)
- [EXECUTION-ALERTS-AND-ADJUSTMENT-QUEUE-BFF.md](./EXECUTION-ALERTS-AND-ADJUSTMENT-QUEUE-BFF.md)
