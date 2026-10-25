# 路线模板 · 打包清单 & 按天预算 · iOS 对接改动

> **读者**：iOS 客户端  
> **Base**：`{HOST}/api`  
> **响应**：`{ success, data, error }`  
> **原则**：列表读摘要字段做徽章；详情页按需拉全量清单 / 按天预算；**不要**解析 `pack.{cc}.tpl-{id}`。

管理端完整 CRUD 见：[ADMIN_PACKING_AND_BUDGET_API.md](./ADMIN_PACKING_AND_BUDGET_API.md)

---

## 1. 本次对 iOS 的影响面

| 场景 | 是否必改 | 说明 |
|------|----------|------|
| 模板列表卡 | **建议** | 展示「有打包 / 有预算」；可筛无打包待补全（若 App 有管理向入口） |
| 模板详情 | **建议** | 展示预算合计 + 按天费用；打包入口（清单预览） |
| 从模板开 Trip | 可选 | 可用 `budgetEstimate.totals` 预填 UI 提示，**不强制**写死 `totalBudget` |
| 旧 Pack 命名约定 | **删除依赖** | 不再用 `pack.cn.tpl-84` 推断是否有路线打包 |

消费端只需 **读**；写接口主要给管理端。若用户端只读，用下列 GET 即可。

---

## 2. 接口（C 端最小集）

```
GET /api/route-directions/templates
    ?includePackingSummary=true
    &includeBudgetSummary=true
    &isActive=true
    &limit=20

GET /api/route-directions/templates/:id
    // 详情始终带 packing / budget 摘要字段

GET /api/route-directions/templates/:id/packing-checklist
    // data == null → 无打包

GET /api/route-directions/templates/:id/budget-estimate
    // data == null → 无预算；有则含 dayBudgets[]
```

---

## 3. Swift · Codable（建议新增）

```swift
import Foundation

// MARK: - Template list / detail extras

struct PackingChecklistSummary: Decodable {
    let id: String
    let version: String
    let nameCN: String?
    let isActive: Bool
    let lastUpdated: String?
}

struct BudgetTotals: Decodable {
    let min: Double?
    let max: Double?
    let amount: Double?
    let perPerson: Double?
}

struct BudgetEstimateSummary: Decodable {
    let id: String
    let version: String
    let currency: String
    let nameCN: String?
    let isActive: Bool
    let dayCount: Int?
    let totals: BudgetTotals?
    let lastUpdated: String?
}

struct RouteTemplateDTO: Decodable, Identifiable {
    let id: Int
    let routeDirectionId: Int
    let durationDays: Int
    let nameCN: String?
    let nameEN: String?
    let dayPlans: [DayPlanDTO]?   // 现有模型
    let isActive: Bool?

    // NEW
    let packingChecklistId: String?
    let hasPackingChecklist: Bool?
    let packingChecklistSummary: PackingChecklistSummary?

    let budgetEstimateId: String?
    let hasBudgetEstimate: Bool?
    let budgetEstimateSummary: BudgetEstimateSummary?
}

// MARK: - Full budget (by template)

struct BudgetCostLine: Decodable {
    let amount: Double?
    let min: Double?
    let max: Double?
    let note: String?
}

struct DayBudgetItem: Decodable, Identifiable {
    var id: Int { day }
    let day: Int
    let theme: String?
    let tickets: BudgetCostLine?       // 门票
    let fuel: BudgetCostLine?          // 油费
    let charging: BudgetCostLine?      // 充电
    let parking: BudgetCostLine?       // 停车
    let accommodation: BudgetCostLine? // 住宿
    let other: BudgetCostLine?
    let dayTotal: BudgetCostLine?
}

struct RouteBudgetEstimateDTO: Decodable {
    let id: String
    let routeTemplateId: Int
    let countryCode: String
    let currency: String
    let partySize: Int
    let vehicleType: String?           // fuel | ev | hybrid
    let assumptions: String?
    let dayBudgets: [DayBudgetItem]
    let categoryTotals: [String: BudgetCostLine]?
    let totals: BudgetTotals
    let version: String
    let isActive: Bool
}

// MARK: - Packing checklist (preview; templateData 结构大，按需解码)

struct RoutePackingChecklistDTO: Decodable {
    let id: String
    let routeTemplateId: Int
    let countryCode: String
    let nameCN: String?
    let nameEN: String?
    let version: String
    let isActive: Bool
    /// 完整 PackingChecklistTemplate JSON；UI 可只展示 metadata / 三季速查标题
    let templateData: [String: AnyCodable]?  // 或用 JSONValue / 跳过详细解码
}
```

> `AnyCodable` 可用现有工程内 JSON 柔性类型；若只做「有无打包」徽章，列表摘要够用，不必解码 `templateData`。

---

## 4. API Client 片段

```swift
enum RouteTemplateAPI {
    static func list(
        includePacking: Bool = true,
        includeBudget: Bool = true,
        hasPacking: Bool? = nil,
        hasBudget: Bool? = nil
    ) async throws -> [RouteTemplateDTO] {
        var q: [URLQueryItem] = [
            .init(name: "includePackingSummary", value: includePacking ? "true" : "false"),
            .init(name: "includeBudgetSummary", value: includeBudget ? "true" : "false"),
            .init(name: "isActive", value: "true"),
        ]
        if let hasPacking { q.append(.init(name: "hasPackingChecklist", value: hasPacking ? "true" : "false")) }
        if let hasBudget { q.append(.init(name: "hasBudgetEstimate", value: hasBudget ? "true" : "false")) }
        // GET /api/route-directions/templates?...
        // decode StandardResponse<[RouteTemplateDTO]>
        fatalError("wire to your HTTP client")
    }

    static func packingChecklist(templateId: Int) async throws -> RoutePackingChecklistDTO? {
        // GET .../templates/{id}/packing-checklist → data 可为 null
        fatalError("wire")
    }

    static func budgetEstimate(templateId: Int) async throws -> RouteBudgetEstimateDTO? {
        // GET .../templates/{id}/budget-estimate → data 可为 null
        fatalError("wire")
    }
}
```

---

## 5. UI 改动建议

### 5.1 模板列表 Cell

```
[模板名]  7日 · IS
[打包✓] [预算 ¥1,580]     ← has* == true 时显示
```

- `hasPackingChecklist == true` → 打包徽章  
- `hasBudgetEstimate == true` → 用 `budgetEstimateSummary.totals.amount` + `currency` 格式化（如 `¥1,580` / `ISK …`）  
- 两者都 false → 不显示徽章，或灰字「费用待补充」（产品定）

### 5.2 模板详情

1. **预算区块**（`hasBudgetEstimate`）  
   - 头：合计 `totals.amount`（区间则 `min–max`）+ 人均 `perPerson` + `assumptions`  
   - 列表：按 `dayBudgets` 逐日展开  
     - 行：门票 / 油费 / 充电 / 停车 / 住宿 / 其他 / 当日小计  
   - 点「查看完整」再调 `GET .../budget-estimate`（若详情摘要已够，可详情接口带的 summary 只做头图，全量按天用快捷 GET）

2. **打包区块**（`hasPackingChecklist`）  
   - 显示 `packingChecklistSummary.nameCN` + version  
   - 点入再 `GET .../packing-checklist`；无则隐藏入口

### 5.3 开 Trip 预填（可选）

```swift
let hintBudget = template.budgetEstimateSummary?.totals?.amount
// 创建页总预算输入框 placeholder / 默认值 = hintBudget（用户可改）
// POST create-trip 仍传用户确认后的 totalBudget → Trip.budgetConfig
```

**不要**假定模板预算币种一定是 CNY；用 `budgetEstimateSummary.currency`。

### 5.4 空态

| GET 结果 | UI |
|----------|-----|
| `data: null`（打包或预算） | 不展示对应模块，或「暂无官方打包/预算」 |
| 列表未传 `include*Summary` | `has*` / summary 可能为 `nil`——**列表请显式带 include 参数** |

---

## 6. 费用展示小工具

```swift
extension BudgetCostLine {
    /// 优先 amount；否则 min–max；再否则单端
    var displayText: String {
        if let amount { return format(amount) }
        if let min, let max { return "\(format(min))–\(format(max))" }
        if let min { return "≥\(format(min))" }
        if let max { return "≤\(format(max))" }
        return "—"
    }

    private func format(_ v: Double) -> String {
        v.rounded() == v ? String(Int(v)) : String(format: "%.0f", v)
    }
}
```

分类文案映射：

| key | 中文 |
|-----|------|
| tickets | 门票 |
| fuel | 油费 |
| charging | 充电 |
| parking | 停车 |
| accommodation | 住宿 |
| other | 其他 |

---

## 7. 验收清单（iOS）

- [ ] 列表请求带 `includePackingSummary=true&includeBudgetSummary=true`
- [ ] `#66/#85/#87/#89/#91/#94/#95` 可见打包徽章（已迁移）
- [ ] `#84` 若已写预算 → 有预算徽章与合计；`#90` 等无预算 → `GET budget-estimate` 为 `null`
- [ ] 按天展开可见门票/油/电/停/住
- [ ] 工程内无 `pack.*.tpl-*` 字符串拼接逻辑

---

## 8. 非目标（本期 iOS 不做）

- 用户端编辑/upsert 打包或预算（管理端职责）
- 把按天预算自动拆进行程日程 item
- 实时油价 / 汇率换算（直接展示模板币种即可）
