# 团队账本（预算 Tab）接口

> 目标 UI：团队 Hub「预算」Tab — 账本总览、记一笔/记账详情、结算结果  
> 产品名：**Team Ledger（团队账本）**  
> Base：`/api/trips/:tripId/ledger`  
> 鉴权：`Authorization: Bearer <token>`  
> 金额一律用 **整数分（cents）** 传输；展示层再格式化为 `¥ 1,600`  
> iOS：`TeamHubBudgetTab` / `TeamLedgerRepository` / `TeamLedgerModels.swift`

**不要与下列能力混淆：**

| 能力 | 路径 / 位置 | 说明 |
|------|-------------|------|
| **团队账本（本文）** | `/api/trips/:tripId/ledger/*` | 同行支出流水 + 分摊 + 最小转账结算 |
| 行程总预算 | `trips.budgetConfig.totalBudget` | 规划设置里的预算数字，不是流水账 |
| Budget OS / Wallet | `/api/trips/:tripId/budget/wallet/*` | L3 钱包分录（Float amount），非本产品面 |
| 偏好 · 预算合拍 | team-status / preferences | 五维合拍里的「预算」维 |

---

## 1. 页面与接口映射

| 页面 | 关键操作 | 接口 |
|------|----------|------|
| 预算 Tab · 账本总览 | 进入 Tab / 下拉刷新 | `GET .../ledger/overview` |
| 记一笔 | 「记一笔」 | `POST .../ledger/expenses` |
| 记账详情 | 点最近记账行 | `GET .../ledger/expenses/:expenseId` |
| 保存这笔账 | 编辑后保存 | `PATCH .../ledger/expenses/:expenseId` |
| 删除记录 | 详情页删除 | `DELETE .../ledger/expenses/:expenseId` |
| 查看结算 / 进入结算 | 结算页 | `GET .../ledger/settlement` |
| 确认一笔转账 | 结算行勾选 / 确认 | `POST .../transfers/:transferId/confirm` |
| 发送结算给成员 | 结算页主 CTA | `POST .../ledger/settlement/notify` |

---

## 2. `GET /api/trips/:tripId/ledger/overview`

```json
{
  "summary": {
    "totalSpentCents": 3865000,
    "averagePerPersonCents": 773000,
    "pendingSettlementCents": 642000,
    "recordCount": 12,
    "currency": "CNY"
  },
  "members": [
    {
      "id": "m_xu",
      "name": "徐丹莉",
      "avatarUrl": null,
      "participatesInSplit": true
    },
    {
      "id": "m_child",
      "name": "儿童成员",
      "avatarUrl": null,
      "participatesInSplit": false
    }
  ],
  "recentExpenses": [
    {
      "id": "exp_lagoon",
      "tripId": "trip_xxx",
      "title": "预订 Blue Lagoon",
      "payer": {
        "id": "m_xu",
        "name": "徐丹莉",
        "avatarUrl": null,
        "participatesInSplit": true
      },
      "amountCents": 160000,
      "currency": "CNY",
      "occurredAt": "2026-02-12T14:20:00Z",
      "status": "pending",
      "splitMemberIds": ["m_xu", "m_li", "m_wang", "m_chen"],
      "splitMembers": [
        { "id": "m_xu", "name": "徐丹莉", "avatarUrl": null, "participatesInSplit": true }
      ],
      "itineraryItemId": "item_xxx",
      "createdAt": "2026-02-12T14:21:00Z",
      "updatedAt": "2026-02-12T14:21:00Z"
    }
  ]
}
```

`recentExpenses` 按 `occurredAt` 倒序，默认最多 20 条。列表标题拼 `{payer.name} {title}`；副文案 `{N}人分摊 · A / B / C`。  
活动详情「团队账本」：用 `itineraryItemId` 过滤本活动关联记账。

---

## 3. `GET /api/trips/:tripId/ledger/expenses/:expenseId`

字段同 `recentExpenses[]` 单项。

---

## 4. `POST /api/trips/:tripId/ledger/expenses`

```json
{
  "title": "Blue Lagoon 门票",
  "payerMemberId": "m_xu",
  "amountCents": 160000,
  "currency": "CNY",
  "occurredAt": "2026-02-12T14:20:00Z",
  "splitMemberIds": ["m_xu", "m_li", "m_wang", "m_chen"],
  "itineraryItemId": "item_xxx"
}
```

| 规则 | 提示 |
|------|------|
| `title` 非空 | 请填写事项 |
| `amountCents > 0` | 请填写金额 |
| `payerMemberId` 属于行程 | 付款人不存在 |
| `splitMemberIds.length >= 1` | 请选择分摊成员 |
| `itineraryItemId` 可选 | 关联行程活动；须属于本行程，否则 400 |

成功返回完整 expense，`status` 默认 `pending`。支出列表项回传 `itineraryItemId`（可空）。

---

## 5. `PATCH /api/trips/:tripId/ledger/expenses/:expenseId`

字段均可选：`title` / `payerMemberId` / `amountCents` / `occurredAt` / `splitMemberIds` / `itineraryItemId`（传 `null` 清除关联）。  
已 `settled` 改金额/分摊/付款人 → **409**。

---

## 6. `DELETE /api/trips/:tripId/ledger/expenses/:expenseId`

软删（`deleted_at`）。已 `settled` → **409**。

---

## 7. `GET /api/trips/:tripId/ledger/settlement`

```json
{
  "pendingTotalCents": 642000,
  "involvedCount": 4,
  "autoOffsetLabel": "互相欠款",
  "tipMessage": "系统已合并重复往来，按最少转账次数结算",
  "currency": "CNY",
  "transfers": [
    {
      "id": "t1",
      "from": { "id": "m_li", "name": "李先生", "avatarUrl": null, "participatesInSplit": true },
      "to": { "id": "m_xu", "name": "徐丹莉", "avatarUrl": null, "participatesInSplit": true },
      "amountCents": 40000,
      "status": "settled"
    }
  ],
  "settledCount": 3,
  "pendingCount": 1
}
```

### 结算算法

1. 对每笔 `pending` 支出：付款人 `+amount`，每个分摊人 `-share`；余数按成员 id 稳定分配 +1¢。
2. 得到每人净额（正=应收，负=应付）。
3. 贪心最少转账，生成 `transfers`。
4. `autoOffsetLabel`：原始往来边多于最少转账时为「互相欠款」，否则「无」。
5. `settledCount` / `pendingCount`：按转账行 `status` 统计。

P1：`POST .../transfers/:transferId/confirm` — 见 §7.1。

### 7.1 `POST /api/trips/:tripId/ledger/transfers/:transferId/confirm`

确认结算图中的一笔转账，写入 `trip_ledger_transfer_confirms`。之后 `GET .../settlement` 该行 `status` 为 `settled`。

- `transferId`：来自 `settlement.transfers[].id`（稳定 hash，形如 `t_…`）
- 幂等：已确认再调仍返回 `status: settled`
- 若不在当前结算图（金额/成员变化导致边消失）→ **404**

```json
{
  "transfer": {
    "id": "t_abc123",
    "from": { "id": "m_li", "name": "李先生", "avatarUrl": null, "participatesInSplit": true },
    "to": { "id": "m_xu", "name": "徐丹莉", "avatarUrl": null, "participatesInSplit": true },
    "amountCents": 40000,
    "status": "settled"
  },
  "confirmedAt": "2026-02-12T16:05:00Z"
}
```

---

## 8. `POST /api/trips/:tripId/ledger/settlement/notify`

P0 响应：

```json
{
  "notifiedMemberIds": ["m_xu", "m_li", "m_wang", "m_chen"],
  "sentAt": "2026-02-12T16:00:00Z"
}
```

推送通道可后续接 MobilePush；P0 至少返回上述字段。

---

## 9. 统一响应与错误

```json
{ "success": true, "data": {}, "error": null }
```

| HTTP | 场景 |
|------|------|
| 400 | 校验失败 |
| 401 | 未登录 |
| 403 | 非行程成员 |
| 404 | 行程 / 记账不存在 |
| 409 | 已结清不可改删 |

金额字段名统一 `*Cents`；禁止以 float `amount` 为准。  
`status`：`pending`（待结算）/ `settled`（已结清）。

---

## 10. 数据表

- `trip_ledger_expenses` — 记账流水（软删 `deleted_at`；可选 `itinerary_item_id`）
- `trip_ledger_transfer_confirms` — 转账确认（P1 confirm 接口可写）

成员 `participatesInSplit`：协作成员默认 `true`；metadata roster 中 `isChild` / `participatesInSplit:false` / `ledgerSplitExclusions` 为 `false`。

---

## 11. iOS 对照

| 模块 | 路径 |
|------|------|
| Models | `Core/Domain/Models/TeamLedgerModels.swift` |
| Repository | `Features/TeamHub/TeamLedgerRepository.swift` |
| Store | `Features/TeamHub/TeamLedgerStore.swift` |
| UI | `TeamHubBudgetTab` / `TeamHubTab.budget`；活动详情「费用信息」旁「团队账本」可预填记一笔 |

本地演示：`MockTeamLedgerRepository`（`featureFlags.localDemo`）。  
HTTP：`HTTPTeamLedgerRepository` 按本文路径接通。
