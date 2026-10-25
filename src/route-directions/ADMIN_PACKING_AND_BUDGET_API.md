# 路线模板 · 打包清单 & 预算估算 · 管理端 API

> **读者**：后台管理端  
> **Base**：`{HOST}/api`  
> **响应**：统一 `{ success, data, error }`  
> **关联**：1 模板 ↔ 1 打包清单；1 模板 ↔ 1 预算估算（独立表硬关联，不写进 `dayPlans`）

---

## 0. 模板列表 / 详情增强（必看）

### `GET /route-directions/templates`

| 参数 | 类型 | 说明 |
|------|------|------|
| includePackingSummary | boolean | 附带打包摘要字段 |
| hasPackingChecklist | boolean | 筛「有/无打包」 |
| includeBudgetSummary | boolean | 附带预算摘要字段 |
| hasBudgetEstimate | boolean | 筛「有/无预算」 |
| 其余 | | `routeDirectionId` / `durationDays` / `isActive` / `limit` / `offset` 同前 |

**列表项新增字段（开启 include* 或 has* 筛选时返回）**：

```json
{
  "id": 84,
  "packingChecklistId": "uuid-or-null",
  "hasPackingChecklist": true,
  "packingChecklistSummary": {
    "id": "...",
    "version": "1.0.0",
    "nameCN": "...",
    "isActive": true,
    "lastUpdated": "2026-08-11T06:00:00.000Z"
  },
  "budgetEstimateId": "uuid-or-null",
  "hasBudgetEstimate": true,
  "budgetEstimateSummary": {
    "id": "...",
    "version": "1.0.0",
    "currency": "CNY",
    "nameCN": "...",
    "isActive": true,
    "dayCount": 2,
    "totals": { "min": 1480, "max": 1680, "amount": 1580, "perPerson": 790 },
    "lastUpdated": "2026-08-11T06:00:00.000Z"
  }
}
```

### `GET /route-directions/templates/:id`

详情**始终**回显上述 packing / budget 关联字段（只读；绑定/解绑走下方独立 API）。

**管理端列表建议**：

```
GET .../templates?includePackingSummary=true&includeBudgetSummary=true&limit=50
GET .../templates?hasPackingChecklist=false&includePackingSummary=true   // 待补全打包
GET .../templates?hasBudgetEstimate=false&includeBudgetSummary=true     // 待补全预算
```

---

## 1. 打包清单 `RoutePackingChecklist`

### 1.1 独立 CRUD

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/route-directions/packing-checklists` | 列表 |
| GET | `/route-directions/packing-checklists/:id` | 详情 |
| POST | `/route-directions/packing-checklists` | 创建（模板已绑则 409） |
| PUT | `/route-directions/packing-checklists/:id` | 局部更新 |
| DELETE | `/route-directions/packing-checklists/:id` | 默认软删；`?hard=true` 硬删 |

**列表 Query**：`routeTemplateId` / `countryCode` / `isActive` / `page` / `limit`

**POST Body**：

```json
{
  "routeTemplateId": 84,
  "countryCode": "CN",
  "nameCN": "可选",
  "nameEN": "可选",
  "version": "1.0.0",
  "isActive": true,
  "templateData": {
    "metadata": { "version": "1.0.0" },
    "quick_checklist_summer": {},
    "quick_checklist_transition": {},
    "quick_checklist_winter": {},
    "pre_departure_final_checklist": {}
  }
}
```

**`templateData` 校验（缺则 400）**：
- `metadata.version`
- `quick_checklist_summer` / `transition` / `winter`
- `pre_departure_final_checklist`

服务端会写入：`metadata.source_route_template_id`、`metadata.country_code`、`metadata.route_name`。

### 1.2 按模板快捷（管理端首选）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/route-directions/templates/:templateId/packing-checklist` | 无则 `data: null` |
| PUT | `/route-directions/templates/:templateId/packing-checklist` | upsert |
| DELETE | `/route-directions/templates/:templateId/packing-checklist` | 解绑；`?hard=true` 硬删 |

**PUT Body**（不含 `routeTemplateId`，由路径决定）：

```json
{
  "countryCode": "IS",
  "nameCN": "...",
  "version": "1.0.0",
  "isActive": true,
  "templateData": { "...同上必填结构..." }
}
```

---

## 2. 预算估算 `RouteBudgetEstimate`（按天）

### 2.1 独立 CRUD

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/route-directions/budget-estimates` | 列表 |
| GET | `/route-directions/budget-estimates/:id` | 详情（含 `dayBudgets`） |
| POST | `/route-directions/budget-estimates` | 创建 |
| PUT | `/route-directions/budget-estimates/:id` | 局部更新 |
| DELETE | `/route-directions/budget-estimates/:id` | 软删 / `?hard=true` |

**列表 Query**：`routeTemplateId` / `countryCode` / `currency` / `isActive` / `page` / `limit`

### 2.2 按模板快捷（管理端首选）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/route-directions/templates/:templateId/budget-estimate` | 无则 `data: null` |
| PUT | `/route-directions/templates/:templateId/budget-estimate` | upsert |
| DELETE | `/route-directions/templates/:templateId/budget-estimate` | 解绑 |

**PUT Body 示例**：

```json
{
  "currency": "CNY",
  "partySize": 2,
  "vehicleType": "fuel",
  "assumptions": "自驾燃油车 / 中档住宿 / 2人",
  "dayBudgets": [
    {
      "day": 1,
      "theme": "出发日",
      "tickets": { "amount": 120, "note": "景区门票" },
      "fuel": { "amount": 180 },
      "charging": { "amount": 0 },
      "parking": { "amount": 40 },
      "accommodation": { "min": 400, "max": 550 },
      "other": { "amount": 50, "note": "过路费" }
    },
    {
      "day": 2,
      "tickets": { "amount": 80 },
      "fuel": { "min": 100, "max": 150 },
      "parking": { "amount": 30 },
      "accommodation": { "amount": 480 }
    }
  ]
}
```

**字段约定**：

| 字段 | 说明 |
|------|------|
| `vehicleType` | `fuel` \| `ev` \| `hybrid` |
| 费用行 | `amount` 定点，或 `min`/`max` 区间；可带 `note` |
| 分类 | `tickets` 门票 / `fuel` 油费 / `charging` 充电 / `parking` 停车 / `accommodation` 住宿 / `other` 其他 |
| `dayTotal` | 可选；省略则由当日各类别汇总 |
| `categoryTotals` / `totals` | **只读回显**，服务端按天汇总；`totals.perPerson = amount / partySize` |

**校验（400）**：
- `dayBudgets` 非空数组
- 每天必须有正整数 `day`，不可重复
- 每天至少有一个分类或 `dayTotal`

---

## 3. 管理端推荐流程

```
1. GET /templates?includePackingSummary=true&includeBudgetSummary=true
2. 行上展示 hasPackingChecklist / hasBudgetEstimate 徽章
3. 点「打包」→ GET .../templates/:id/packing-checklist
   - null → 编辑器空白 → PUT upsert
   - 有值 → 编辑 → PUT
4. 点「预算」→ GET .../templates/:id/budget-estimate
   - 按天表格编辑 tickets/fuel/charging/parking/accommodation
   - PUT upsert；右侧展示 totals / categoryTotals
5. 解绑 → DELETE 对应快捷接口（默认软删）
```

**不要**再依赖 `pack.cn.tpl-{id}` 命名约定；不要把大 JSON 写进 `RouteTemplate.dayPlans`。

---

## 4. 错误码

| code | HTTP 语义 | 场景 |
|------|-----------|------|
| VALIDATION_ERROR | 400 | templateData / dayBudgets 缺字段 |
| NOT_FOUND | 404 | 模板或资源不存在；解绑时无绑定 |
| CONFLICT | 409 | POST 创建时模板已有清单/预算（应用 PUT upsert） |
| INTERNAL_ERROR | 500 | 未预期错误 |

---

## 5. 与 ReadinessPack / Trip 的关系

| 资源 | 职责 |
|------|------|
| `RoutePackingChecklist` | **路线模板级打包真相源** |
| `RouteBudgetEstimate` | **路线模板级预算真相源（按天）** |
| `ReadinessPack.packing` | 保留；旧 `pack.*.tpl-*` 已迁 7 条到新表 |
| Trip.`budgetConfig` | 开 Trip 时用户总预算；**不**自动覆盖模板预算（后续可「预填」） |

迁移脚本：`npm run migrate:route-packing-checklists`
