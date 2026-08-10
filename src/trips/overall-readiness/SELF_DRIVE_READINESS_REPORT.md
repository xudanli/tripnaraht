# 自驾准备度报告 · 产品梳理与后端接口要求

> 依据设计稿「自驾准备报告」首页 + 四类目详情页整理。  
> **样式不跟稿**：颜色 / 字号 / 圆角 / 阴影一律走客户端 `样式规范.md` 与现有 `TN*` Design System；本稿只锁信息架构、交互与 API。  
> **UI 原则**：尽量用 iOS 原生组件（`NavigationStack` / `List` / `LabeledContent` / `ProgressView` / `ShareLink` / SF Symbols）。  
> **状态**：契约冻结 · **后端 P0 已实现**（`view=self_drive_report` + 类目详情 + compliance mark-read）  
> **相关**：[OVERALL_TRIP_READINESS_API.md](./OVERALL_TRIP_READINESS_API.md) · [OVERALL_TRIP_READINESS_FE_HANDOFF.md](./OVERALL_TRIP_READINESS_FE_HANDOFF.md)  
> 最后更新：2026-07-19

**相关现状：**

| 能力 | 路径 / 代码 | 说明 |
|------|-------------|------|
| 壳层准备度卡片 | `GET .../timeline-overview?preset=shell` → `overallReadiness` | Header / 规划首页摘要 |
| 现行准备报告 | `GET .../trips/{tripId}/overall-readiness` | 五维（路线/住宿/交通/活动/成员）+ mustHandleNow |
| iOS 页 | `ReadinessReportView` / `ReadinessSection` | 需按本稿信息架构改造 |
| 冰岛情境 | `iceland-self-drive-situation` | 规则/阻断证据来源之一，可喂入检查项 |

---

## 1. 产品定位

### 1.1 一句话

> 回答：**「这趟自驾，现在能不能安全出发？还差什么？」**

不是攻略页，也不是决策中心。准备度报告是 **可执行性 checklist 的总览与下钻**，把分散的驾照、租车、锚点预订、合规知识收成一条准备链路。

### 1.2 核心问题（用户心智）

| 层级 | 用户问题 | 页面 |
|------|----------|------|
| L0 | 整体好不好？还差几项？有没有必须解决？ | 报告首页 |
| L1 | 哪一类拖后腿？ | 准备项概览 4 行 |
| L2 | 这一类里具体哪几项？我该做什么？ | 类目详情页 |
| L3（后续） | 点进单项去补全 / 确认 / 阅读 | deepLink 跳转既有能力 |

### 1.3 与现有「整体准备度」的关系

| | 现行 `overall-readiness` | 本稿「自驾准备报告」 |
|--|--------------------------|----------------------|
| 维度切法 | route / stay / transport / activity / members | **驾驶资格 / 车辆与租赁 / 行程锚点 / 合规知识** |
| 主指标 | score + state + whyNotReady | score + **五态计数** + **必须解决条** |
| 详情形态 | 维度展开 checks / evidence | **类目 checklist 行** + tip |
| 产品判断 | 保留壳层 score（规划 Header） | **报告 Push 页按本稿改造**；score 可与壳层同源 |

**结论：**

- 规划 Header / 工作区卡片的 `score`、`state`、`blockerCount` **继续用** shell 投影。
- `ReadinessReportView` **从「五维证据报告」改为「自驾准备 checklist 报告」**。
- 后端优先 **扩展 / 替换** `GET .../overall-readiness` 的 report 投影；不新增平行 SSOT。壳层字段可向后兼容。

---

## 2. 信息架构（按设计稿）

### 2.1 页面树

```text
自驾准备报告（首页）
├─ 行程摘要卡
├─ 整体准备度（环图 + 状态文案 + 待完成 / 必须解决摘要）
├─ 五态统计条
├─ 准备项概览（4 类目 → Push 详情）
├─ 必须解决条（可点，跳到对应类目或单项）
└─ 主 CTA「查看全部细节」（展开全部类目 / 进入聚合细节，见 §2.5）

类目详情（4 页，结构同构）
├─ 类目状态摘要卡（已完成 / 待准备 N 项 / 待确认 N 项 …）
├─ 检查项列表（icon + 标题 + 动态描述 + 状态 + 可选 chevron）
└─ 底部 Tip / 重要提醒
```

### 2.2 四类目（固定顺序，不可客户端自创）

| order | categoryCode | 标题 | 副文案（示例） | 设计稿检查项示例 |
|------:|--------------|------|----------------|------------------|
| 1 | `DRIVING_ELIGIBILITY` | 驾驶资格 | 驾照、国际驾照认证等 | 驾照有效 / 国际驾照·翻译件 / 主驾年龄 / 附加驾驶员 / 儿童座椅 |
| 2 | `VEHICLE_RENTAL` | 车辆与租赁 | 车辆选择、保险、取还车等 | 租车订单 / 车型 / 取还车地点 / 冬季轮胎 / 保险 / 紧急电话 |
| 3 | `ITINERARY_ANCHORS` | 行程锚点 | 住宿、景点、活动预订等 | 住宿订单 / 活动订单 / 集合时间 / 入住时间 / 夜间自助入住 |
| 4 | `COMPLIANCE_KNOWLEDGE` | 合规知识 | 冰岛交通规则、当地法规等 | 限速 / 全天开灯 / 禁手持手机 / 禁越野 / 单车道桥 / 酒驾 / 路边停车 / 事故处理 |

> 非冰岛目的地：合规知识类目内容由后端按 `destination` Knowledge Pack 替换；结构不变。

### 2.3 统一状态模型（五态）

设计稿首页统计与行状态共用同一枚举。**后端算、前端只映射颜色/图标。**

| status | 中文 | 语义 | 计入「待完成」？ |
|--------|------|------|------------------|
| `COMPLETED` | 已完成 | 已满足 / 已确认 / 已阅读 | 否 |
| `TO_PREPARE` | 待准备 | 缺信息、未上传、未填写 | 是 |
| `TO_CONFIRM` | 待确认 | 有草稿或半确认，需人确认 | 是 |
| `MUST_RESOLVE` | 必须解决 | 不解决会阻断取车 / 出行 / 合规 | 是（且进必须解决条） |
| `BLOCKED` | 已阻塞 | 外部依赖未就绪，用户暂时无法推进 | 是 |

**类目行右侧文案规则（后端给 `statusSummaryZh`，客户端不拼）：**

| 类目聚合优先级 | 展示文案示例 |
|----------------|--------------|
| 存在 MUST_RESOLVE | `必须解决 N 项` |
| 否则存在 TO_PREPARE | `待准备 N 项` |
| 否则存在 TO_CONFIRM | `待确认 N 项` |
| 否则存在 BLOCKED | `已阻塞 N 项` |
| 全部 COMPLETED | `已完成` |

合规知识类目单项状态可用 `READ` / `UNREAD`，但 **上卷到五态时**：未读 → `TO_PREPARE`，已读 → `COMPLETED`（除非有 MUST_RESOLVE 规则项）。

### 2.4 设计稿矛盾点（产品裁定）

稿面出现：

- 整体准备度区：「**0** 项必须解决」
- 五态统计：「必须解决 **1**」
- 底部条：「**1** 项必须解决：驾驶者年龄…」

**裁定：以五态统计与必须解决条为准。**  
整体准备度区右侧的「N 项必须解决」必须等于 `counts.mustResolve`，与底部条条数一致。稿面「0」视为笔误。

### 2.5 「查看全部细节」

| 方案 | 行为 | 建议 |
|------|------|------|
| A | 同页展开 4 类目全部检查项（长列表） | 首版不取 |
| B | Push 到「全部细节」聚合页（按类目 section） | **P1** |
| C | 首版仅作为「依次打开未完成类目」入口 | 可作临时 |

**首版（P0）：** CTA 文案保留；点击 → 打开第一个非 `COMPLETED` 类目；若全部完成 → 打开第 1 类目。  
**P1：** 独立「全部细节」页，`List` + 4 个 `Section`。

### 2.6 分享

导航栏「分享」：ShareLink 导出摘要文本（行程名 + 准备度% + 五态计数 + 必须解决标题）。  
首版不要求后端生成分享图 / 短链。

---

## 3. 用户流程

```text
规划首页「整体准备度」卡片 / Situation「去准备度报告」
        │
        ▼
自驾准备报告首页（GET report）
        │
        ├─ 点准备项概览行 → 类目详情（可用 report 内嵌 / 或 GET category）
        ├─ 点必须解决条 → 对应类目或 item.deepLink
        ├─ 点检查项（可导航）→ deepLink（决策问题 / 租车资料 / 锚点编辑 / 合规文章）
        └─ 合规「已阅读」→ PATCH/POST mark-read → 刷新报告
```

**完成定义（类目级）：** 该类目下无 `TO_PREPARE` / `TO_CONFIRM` / `MUST_RESOLVE` / `BLOCKED`。  
**整体「良好」等 label：** 由后端按 score + mustResolve 规则给出 `displayLabelZh`，客户端不本地推断。

---

## 4. iOS 实现约束（尽量原生）

样式走 TN token；结构优先原生：

| 区块 | 推荐组件 |
|------|----------|
| 导航 | `NavigationStack` + 系统返回；Trailing `ShareLink` / `Button` |
| 整页滚动 | `List` / `Form` + `.insetGrouped`（或 `ScrollView` + `LazyVStack` 仅当 List 放不下环图） |
| 行程摘要 | `List` 首 Section；缩略图 `AsyncImage`；元信息 `LabeledContent` 或 `Label` |
| 准备度环 | `ProgressView(value:total:).progressViewStyle(.circular)` + 大号分数 Text（可接受轻量自定义 ring，禁止引入三方图表库） |
| 五态统计 | 横向 `HStack` / 等宽列；SF Symbol + 数字；勿做成可点 Tab（首版只展示） |
| 准备项概览 | `NavigationLink` 行：`Label` + 右侧状态 Text + `chevron` |
| 必须解决条 | `Section` 内 `Button` / `NavigationLink`；语义色用 `TNColor.semanticWarning/Error` |
| 主 CTA | 底部 `safeAreaInset` + `TNPrimaryButton`（或系统 `.borderedProminent`） |
| 类目详情列表 | `List`；行：SF Symbol / 状态 `Text`；可点行带 `chevron.right` |
| Tip | `Section` footer 或 `ContentUnavailableView` 风格提示行（`lightbulb` / `info.circle`） |
| 下拉刷新 | `.refreshable` |

**禁止：** 为贴稿自造整套卡片皮肤、彩色大底板、非 TN 色板。稿面浅绿/浅蓝摘要卡 → 映射为 `List` Section 头 + 语义色文字即可。

---

## 5. 后端接口改造要求

### 5.1 原则

1. **服务端聚合**：计数、类目摘要文案、动态 description（「7 晚已确认，2 晚待确认」）一律后端算。
2. **同一状态机**：首页五态、类目摘要、检查项 status 同源。
3. **可导航**：能点的行必须带 `deepLink` 或 `actionCode`（与现有 Decision Space / 行程编辑对齐）。
4. **可刷新**：检查项变更、合规 mark-read、决策采纳后，WebSocket `changedSections` 含 `readiness` 时客户端重拉报告。
5. **兼容壳层**：`timeline-overview.overallReadiness.score/state/blockerCount` 与报告首页 `score` / `counts.mustResolve` **同向**（允许短暂延迟，但同一 `contextVersion` 下应一致）。

### 5.2 接口一览

| 优先级 | 方法 | 路径 | 说明 |
|--------|------|------|------|
| **P0** | GET | `/api/trips/{tripId}/overall-readiness` | **改造响应**：自驾准备报告首页投影（可 `?view=self_drive_report`） |
| **P0** | GET | `/api/trips/{tripId}/overall-readiness/categories/{categoryCode}` | 类目详情（若 P0 报告已内嵌 categories[].items，可延后） |
| **P0** | POST | `/api/trips/{tripId}/overall-readiness/compliance/{itemId}/read` | 合规知识标记已阅读 |
| P1 | GET | `/api/trips/{tripId}/overall-readiness?view=self_drive_report_full` | 「全部细节」聚合 |
| — | GET | `/api/trips/{tripId}/timeline-overview?preset=shell` | 壳层卡片保持；`blockerCount` ≡ mustResolve |

> Mobile 别名若存在：`/api/mobile/trips/{tripId}/planning/readiness-report` 应与上表字段对齐或 301/委托到同一 handler。

### 5.3 GET 报告首页 · 响应契约

`GET /api/trips/{tripId}/overall-readiness?view=self_drive_report`

```json
{
  "tripId": "trip_xxx",
  "contextVersion": 42,
  "generatedAt": "2026-07-19T12:00:00Z",

  "tripSummary": {
    "title": "冰岛南岸 9 天自驾",
    "coverImageUrl": "https://…",
    "dateRangeLabelZh": "2月10日 - 2月18日",
    "startDate": "2027-02-10",
    "endDate": "2027-02-18",
    "travelerCount": 4,
    "travelerLabelZh": "4 人同行",
    "routeLabelZh": "雷克雅未克往返",
    "distanceSummaryZh": "约 1,560 公里 · 环线行程"
  },

  "score": 78,
  "state": "NEAR_READY",
  "displayLabelZh": "良好",
  "headlineZh": "还有 5 项待完成",
  "mustResolveSummaryZh": "1 项必须解决",

  "counts": {
    "completed": 18,
    "toPrepare": 5,
    "toConfirm": 3,
    "mustResolve": 1,
    "blocked": 0,
    "remaining": 5
  },

  "categories": [
    {
      "code": "DRIVING_ELIGIBILITY",
      "order": 1,
      "titleZh": "驾驶资格",
      "descriptionZh": "驾照、国际驾照认证等",
      "iconKey": "driving_license",
      "aggregateStatus": "COMPLETED",
      "statusSummaryZh": "已完成",
      "itemCounts": {
        "completed": 5,
        "toPrepare": 0,
        "toConfirm": 0,
        "mustResolve": 0,
        "blocked": 0
      }
    },
    {
      "code": "VEHICLE_RENTAL",
      "order": 2,
      "titleZh": "车辆与租赁",
      "descriptionZh": "车辆选择、保险、取还车等",
      "iconKey": "vehicle_rental",
      "aggregateStatus": "TO_PREPARE",
      "statusSummaryZh": "待准备 1 项",
      "itemCounts": { "completed": 5, "toPrepare": 1, "toConfirm": 0, "mustResolve": 0, "blocked": 0 }
    },
    {
      "code": "ITINERARY_ANCHORS",
      "order": 3,
      "titleZh": "行程锚点",
      "descriptionZh": "住宿、景点、活动预订等",
      "iconKey": "itinerary_anchor",
      "aggregateStatus": "TO_CONFIRM",
      "statusSummaryZh": "待确认 2 项",
      "itemCounts": { "completed": 2, "toPrepare": 0, "toConfirm": 2, "mustResolve": 0, "blocked": 0 }
    },
    {
      "code": "COMPLIANCE_KNOWLEDGE",
      "order": 4,
      "titleZh": "合规知识",
      "descriptionZh": "冰岛交通规则、当地法规等",
      "iconKey": "compliance",
      "aggregateStatus": "COMPLETED",
      "statusSummaryZh": "已完成",
      "itemCounts": { "completed": 8, "toPrepare": 0, "toConfirm": 0, "mustResolve": 0, "blocked": 0 }
    }
  ],

  "criticalAlerts": [
    {
      "id": "driver_age_rental",
      "severity": "MUST_RESOLVE",
      "titleZh": "1 项必须解决",
      "messageZh": "驾驶者年龄不满足租车要求时会影响执行",
      "categoryCode": "DRIVING_ELIGIBILITY",
      "itemId": "primary_driver_age",
      "deepLink": "tripnara://trips/{tripId}/decision-problems/…",
      "actionCode": "CONFIRM_DRIVER_AGE"
    }
  ],

  "primaryCta": {
    "labelZh": "查看全部细节",
    "action": "OPEN_FIRST_INCOMPLETE_CATEGORY",
    "categoryCode": "VEHICLE_RENTAL"
  }
}
```

**字段硬约束：**

| 约束 | 规则 |
|------|------|
| `counts.remaining` | `toPrepare + toConfirm + mustResolve + blocked`（与稿「还有 N 项待完成」一致；**不含**已完成） |
| `counts.mustResolve` | `=` 去重后的 mustResolve **item** 条数；`criticalAlerts` 为其中 top 1～3（见 §9） |
| `mustResolveSummaryZh` | 与 `counts.mustResolve` 一致 |
| `categories` | 固定 4 条、按 `order` 排序；缺失类目也要返回空 counts，禁止客户端补默认类目 |
| `iconKey` | 稳定枚举；iOS 映射 SF Symbol（见 §5.6） |
| 旧字段 | 若客户端仍解码 `homepage` / `dimensions`：可并行返回一版过渡；新客户端只读本稿字段。**废弃时间线：两周内双写，其后可摘** |

### 5.4 GET 类目详情 · 响应契约

`GET /api/trips/{tripId}/overall-readiness/categories/{categoryCode}`

```json
{
  "tripId": "trip_xxx",
  "contextVersion": 42,
  "category": {
    "code": "VEHICLE_RENTAL",
    "order": 2,
    "titleZh": "车辆与租赁",
    "aggregateStatus": "TO_PREPARE",
    "summaryTitleZh": "待准备 1 项",
    "summaryDetailZh": "请完成以下项以避免取车时问题",
    "iconKey": "vehicle_rental"
  },
  "items": [
    {
      "id": "rental_order",
      "type": "RENTAL_ORDER",
      "titleZh": "租车订单",
      "descriptionZh": "已上传订单",
      "status": "COMPLETED",
      "statusLabelZh": "已完成",
      "iconKey": "doc",
      "isTappable": true,
      "deepLink": "tripnara://…",
      "actionCode": null
    },
    {
      "id": "emergency_phone",
      "type": "EMERGENCY_CONTACT",
      "titleZh": "紧急联系电话",
      "descriptionZh": "+354 1234 5678（租车公司）",
      "status": "TO_PREPARE",
      "statusLabelZh": "待准备",
      "iconKey": "phone",
      "isTappable": true,
      "deepLink": "tripnara://…",
      "actionCode": "CONFIRM_RENTAL_EMERGENCY_PHONE"
    }
  ],
  "tips": [
    {
      "style": "TIP",
      "iconKey": "lightbulb",
      "textZh": "建议将租车公司紧急电话和保险单号保存到手机"
    }
  ]
}
```

**各类目 items 最低集合（P0 必须可返回；无数据时 description 说明原因，status 给 TO_PREPARE / BLOCKED，禁止静默省略关键项）：**

#### `DRIVING_ELIGIBILITY`

| type | 标题 |
|------|------|
| `LICENSE_VALIDITY` | 驾照是否有效 |
| `IDP_OR_TRANSLATION` | 是否需要国际驾照 / 翻译件 |
| `PRIMARY_DRIVER_AGE` | 主驾驶年龄 |
| `ADDITIONAL_DRIVERS` | 附加驾驶员是否登记 |
| `CHILD_SEAT` | 儿童座椅是否准备 |

#### `VEHICLE_RENTAL`

| type | 标题 |
|------|------|
| `RENTAL_ORDER` | 租车订单 |
| `VEHICLE_MODEL` | 车型确认 |
| `PICKUP_DROPOFF` | 取还车地点 |
| `WINTER_TIRES` | 冬季轮胎确认 |
| `INSURANCE` | 保险确认 |
| `EMERGENCY_CONTACT` | 紧急联系电话 |

#### `ITINERARY_ANCHORS`

| type | 标题 |
|------|------|
| `ACCOMMODATION_ORDERS` | 住宿订单 |
| `ACTIVITY_ORDERS` | 活动订单 |
| `MEETING_TIME` | 集合时间 |
| `CHECKIN_TIME` | 入住时间 |
| `NIGHT_SELF_CHECKIN` | 夜间自助入住 |

#### `COMPLIANCE_KNOWLEDGE`

| type | 标题（冰岛 Pack 示例） |
|------|------------------------|
| `SPEED_LIMIT` | 冰岛限速 |
| `LIGHTS_ALWAYS_ON` | 全天开灯 |
| `NO_HANDHELD_PHONE` | 禁止手持手机 |
| `NO_OFFROAD` | 禁止越野驾驶 |
| `SINGLE_LANE_BRIDGE` | 单车道桥规则 |
| `DUI_RULE` | 酒驾规则 (0.02%) |
| `ROADSIDE_PARKING` | 路边停车规则 |
| `ACCIDENT_HANDLING` | 事故处理方式 |

合规项额外字段：

```json
{
  "id": "speed_limit",
  "type": "SPEED_LIMIT",
  "titleZh": "冰岛限速",
  "descriptionZh": null,
  "status": "COMPLETED",
  "statusLabelZh": "已阅读",
  "contentUrl": "https://…",
  "isTappable": true
}
```

### 5.5 POST 合规已读

```
POST /api/trips/{tripId}/overall-readiness/compliance/{itemId}/read
Body: { "locale": "zh" }
Response: { "itemId": "…", "status": "COMPLETED", "categoryAggregateStatus": "…", "score": 79, "contextVersion": 43 }
```

- 幂等：重复 POST 仍 200。
- 写成功后更新 readiness 投影；推送 `trip_context_changed`，`changedSections` 含 `readiness`。

### 5.6 iconKey → SF Symbol（iOS 映射表，后端只出 key）

| iconKey | SF Symbol（建议） |
|---------|-------------------|
| `driving_license` | `person.text.rectangle` |
| `vehicle_rental` | `car.fill` |
| `itinerary_anchor` | `mappin.and.ellipse` |
| `compliance` | `book.closed.fill` |
| `doc` | `doc.text` |
| `car` | `car.fill` |
| `location` | `mappin` |
| `snowflake` | `snowflake` |
| `shield` | `checkmark.shield` |
| `phone` | `phone.fill` |
| `bed` | `bed.double.fill` |
| `ticket` | `ticket.fill` |
| `clock` | `clock.fill` |
| `door` | `door.left.hand.open` |
| `lightbulb` | `lightbulb` |
| `info` | `info.circle` |

未知 key → `circle.dashed`。

### 5.7 计数与评分逻辑（后端必须实现）

```text
对所有检查项（跨 4 类目）：
  counts.* = group by status

remaining = toPrepare + toConfirm + mustResolve + blocked

score（建议）：
  completedWeight / totalWeight * 100
  MUST_RESOLVE 未解决时 score 上限封顶（如 ≤ 79）且 state 不得为 READY
  与 shell overallReadiness.score 使用同一计算器

criticalAlerts：
  取 status=MUST_RESOLVE 的 item，按优先级排序，首页至少返回 top 1～3
```

**年龄 vs 租车：** 「主驾年龄不满足租车要求」必须标 `MUST_RESOLVE`，并进入 `criticalAlerts`；不得只出现在五态计数而不出现在底部条。

### 5.8 数据来源建议（后端实现参考）

| 类目 | 主要数据源 |
|------|------------|
| 驾驶资格 | 成员档案 / 自驾设置 / 租车年龄规则 / 儿童占位 |
| 车辆与租赁 | 租车订单附件、车型、取还车、保险 SKU、紧急电话 |
| 行程锚点 | Active Plan 住宿/活动确认态、集合与入住字段 |
| 合规知识 | Destination Knowledge Pack + 用户已读表 |
| 必须解决 | 规则引擎（可与 `iceland-self-drive-situation` gate 对齐） |

---

## 6. 现状差距（给研发）

| 现状 | 改造后 |
|------|--------|
| 报告页五维 score 条 + mustHandleNow / canHandleLater | 行程摘要 + 环图 + 五态 + 4 类目 + criticalAlerts |
| `OverallReadinessDimensionDetail.checks` 松散结构 | 固定 `categoryCode` + `item.type` 枚举 |
| 无合规已读写接口 | `POST .../compliance/{id}/read` |
| 壳层有 blockerCount，报告未强调 mustResolve 条 | 首页强制 `criticalAlerts` |
| 文案部分客户端拼 | `statusSummaryZh` / `descriptionZh` 全服务端 |

**代码锚点（现行）：**

| 模块 | 路径 |
|------|------|
| 报告 GET | `trips.controller.ts` → `GET :id/overall-readiness`（`view=full\|card`） |
| 组装 | `assemble-overall-readiness.util.ts` |
| 首页摘要 | `homepage-summary.util.ts`（`mustHandleNow`） |
| 壳层卡 | `projectOverallReadinessCard` → `blockerCount` |
| 类型 | `overall-trip-readiness.types.ts` |

---

## 7. 验收清单

### 产品 / 交互

- [ ] 首页信息块齐全：摘要、环图、五态、4 类目、必须解决条、CTA、分享
- [ ] `counts.mustResolve`、摘要文案、底部条 **三者一致**
- [ ] 点类目进入对应详情；状态摘要与首页该类目 `statusSummaryZh` 一致
- [ ] 未完成项可导航；合规可标记已读并回写状态
- [ ] 样式符合 TN，不复刻稿面自定义色卡

### 接口

- [ ] `view=self_drive_report` 返回 §5.3 字段；4 类目齐全
- [ ] 类目详情含 items + tips
- [ ] mark-read 幂等；触发 readiness 刷新事件
- [ ] 与 `timeline-overview` shell score / blockerCount 同向

### iOS

- [ ] `List` / `NavigationLink` / `ProgressView` / `ShareLink` / SF Symbols 为主
- [ ] `ReadinessReportView` 按新模型改版；旧 preview fallback 可保留 DEBUG

---

## 8. 里程碑建议

| 阶段 | 范围 |
|------|------|
| **P0** | 报告首页契约 + 4 类目详情（可内嵌 items）+ 合规 mark-read + iOS 按稿信息架构改版 |
| **P1** | 「全部细节」聚合页；分享富文本/图片；检查项写回（电话、订单上传）闭环 |
| **P2** | 多目的地 Knowledge Pack 切换；与 Situation / Decision 深链全打通 |

---

## 9. 开放问题（已拍板）

| # | 问题 | 裁定 |
|---|------|------|
| 1 | `remaining` 是否包含 `mustResolve` | **包含**。`remaining = toPrepare + toConfirm + mustResolve + blocked` |
| 2 | `criticalAlerts` 计数口径 | 按 mustResolve **item 去重**；`counts.mustResolve` = 去重后条数；`criticalAlerts` = 同集合按优先级取 top 1～3 |
| 3 | 旧 `homepage` / `dimensions` 双写 | **两周双写**（自本契约合并日起）；其后默认 `view=self_drive_report` 可省略旧字段；`view=full` 过渡期内仍可返回五维 |
| 4 | 非自驾行程 | `productLine` / 自驾标记 ≠ SELF_DRIVE 时：shell 仍用通用 readiness；报告入口文案「旅行准备报告」；categories 由通用 Pack 驱动（P0 可先对非自驾继续返回现行五维 `view=full`，自驾默认走 `self_drive_report`） |

---

## 10. P0 实现顺序（建议）

1. 类型：`SelfDriveReadinessReport` / `ReadinessItemStatus` / 四 `categoryCode` + item `type` 枚举  
2. 投影器：从现有 facts + driving-settings + knowledge pack → 固定 checklist items（缺数据不省略）  
3. `GET ?view=self_drive_report` + 类目详情 GET（或首页内嵌 `items`）  
4. `POST compliance/.../read` + 已读持久化 + cache invalidate  
5. 壳层：`blockerCount` 对齐 `counts.mustResolve`（同一计算器）  
6. 双写过渡：`view` 未传时自驾行程可默认新投影，或显式 `self_drive_report`  
