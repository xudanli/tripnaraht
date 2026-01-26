# 准备清单 vs 打包清单接口对比

## 核心区别

| 维度 | 准备清单接口 | 打包清单接口 |
|------|------------|------------|
| **用途** | 旅行前的准备事项（签证、保险、证件等） | 旅行时需要携带的物品 |
| **数据范围** | 所有类别的准备事项 | 仅打包相关类别 |
| **数据格式** | 事项描述 + 任务列表 | 物品列表（名称、数量、类别等） |
| **存储方式** | 不存储，每次实时生成 | 生成后存储到数据库 |
| **主要功能** | 查看、勾选状态管理 | 生成、查看、更新、自定义物品 |

---

## 详细对比

### 1. 用途和场景

#### 准备清单接口
- **用途**：帮助用户完成旅行前的准备工作
- **场景**：
  - 办理签证/电子签
  - 购买旅行保险
  - 准备证件和文件
  - 了解目的地要求
  - 安排疫苗接种
  - 了解安全注意事项

#### 打包清单接口
- **用途**：帮助用户准备旅行时需要携带的物品
- **场景**：
  - 准备衣物和装备
  - 准备安全装备（急救包、防滑链等）
  - 准备医疗用品
  - 准备电子产品
  - 准备证件和文件（纸质版）

---

### 2. 数据范围

#### 准备清单接口
包含**所有类别**的准备事项：
- `entry` - 入境与过境（签证、入境材料等）
- `safety_hazards` - 安全与风险（野生动物、治安、极端天气等）
- `health_insurance` - 医疗与保险（医疗水平、保险要求、疫苗接种等）
- `gear_packing` - 装备与穿搭（气候相关装备、活动相关装备等）
- `activities_bookings` - 活动与预订（需要提前预订的项目等）
- `logistics` - 物流与后勤（到达方式、货币、网络、电源等）

#### 打包清单接口
只包含**打包相关类别**：
- `safety_hazards` - 安全装备（如防滑链、急救包等）
- `gear_packing` - 装备与穿搭（如保暖衣物、防水装备等）
- `health_insurance` - 医疗相关物品（如药品、保险单等）

**注意**：打包清单不包含 `entry`、`activities_bookings`、`logistics` 等类别，因为这些不是需要"打包"的物品。

---

### 3. 数据格式

#### 准备清单接口

```json
{
  "checklist": {
    "blocker": [
      {
        "message": "需要办理冰岛签证",
        "tasks": [
          "访问冰岛大使馆官网申请签证",
          "准备护照和行程单"
        ],
        "deadline": null,
        "channel": null
      }
    ],
    "must": [...],
    "should": [...],
    "optional": [...]
  }
}
```

**特点**：
- 按优先级分类（blocker/must/should/optional）
- 每个项包含 `message`（描述）和 `tasks`（任务列表）
- 面向"需要做什么"

#### 打包清单接口

```json
{
  "items": [
    {
      "id": "item-1",
      "name": "分层保暖衣物",
      "category": "clothing",
      "quantity": 3,
      "unit": "套",
      "priority": "must",
      "reason": "冰岛冬季户外温度低，天气多变",
      "checked": false,
      "note": null
    }
  ]
}
```

**特点**：
- 物品列表格式
- 每个项包含 `name`（物品名称）、`quantity`（数量）、`category`（类别）等
- 面向"需要带什么"
- 支持勾选状态（`checked`）
- 支持自定义物品

---

### 4. 数据来源和处理

#### 准备清单接口

**数据流程**：
```
ReadinessService.checkFromDestination()
  → 加载 ReadinessPack
  → ReadinessChecker 规则引擎处理
  → 返回所有 findings（所有类别）
  → 转换为清单格式（不存储）
```

**特点**：
- 每次请求实时生成
- 不存储到数据库
- 只存储勾选状态（`tripChecklistStatus` 表）

#### 打包清单接口

**数据流程**：
```
ReadinessService.checkFromDestination()
  → 加载 ReadinessPack
  → ReadinessChecker 规则引擎处理
  → 过滤打包相关类别
  → 转换为物品格式
  → 保存到数据库（tripPackingListItem 表）
```

**特点**：
- 需要调用生成接口才会创建
- 生成后存储到数据库
- 可以更新物品状态（勾选、数量、备注）
- 支持添加自定义物品

---

### 5. 功能特性

#### 准备清单接口

**功能**：
1. ✅ 获取个性化准备清单（实时生成）
2. ✅ 获取勾选状态
3. ✅ 更新勾选状态（批量）

**不支持**：
- ❌ 添加自定义项
- ❌ 修改项内容
- ❌ 存储清单数据

#### 打包清单接口

**功能**：
1. ✅ 生成打包清单（可自定义参数）
2. ✅ 获取打包清单
3. ✅ 更新物品状态（勾选、数量、备注）
4. ✅ 添加自定义物品（生成时）
5. ✅ 按类别过滤
6. ✅ 包含/排除可选物品

**支持**：
- ✅ 持久化存储
- ✅ 状态管理
- ✅ 自定义扩展

---

### 6. 接口对比

| 功能 | 准备清单 | 打包清单 |
|------|---------|---------|
| **获取清单** | `GET /api/readiness/personalized-checklist` | `GET /api/readiness/trip/:tripId/packing-list` |
| **生成清单** | 不需要（实时生成） | `POST /api/readiness/trip/:tripId/packing-list/generate` |
| **获取状态** | `GET /api/readiness/trip/:tripId/checklist/status` | 包含在获取接口中 |
| **更新状态** | `PUT /api/readiness/trip/:tripId/checklist/status` | `PUT /api/readiness/trip/:tripId/packing-list/items/:itemId` |
| **自定义项** | ❌ 不支持 | ✅ 支持（生成时添加） |

---

### 7. 使用场景示例

#### 准备清单使用场景

**场景 1：查看需要办理的事项**
```bash
# 获取准备清单
GET /api/readiness/personalized-checklist?tripId=xxx&lang=zh

# 返回：需要办理签证、购买保险、准备证件等
```

**场景 2：标记已完成事项**
```bash
# 更新勾选状态
PUT /api/readiness/trip/xxx/checklist/status
{
  "checkedItems": ["must-item-1", "must-item-2"]
}
```

#### 打包清单使用场景

**场景 1：生成打包清单**
```bash
# 生成打包清单（包含自定义物品）
POST /api/readiness/trip/xxx/packing-list/generate
{
  "includeOptional": false,
  "customItems": [
    {
      "name": "充电宝",
      "category": "electronics",
      "quantity": 1
    }
  ]
}
```

**场景 2：更新物品状态**
```bash
# 标记物品已打包
PUT /api/readiness/trip/xxx/packing-list/items/item-1
{
  "checked": true,
  "quantity": 2,
  "note": "已准备"
}
```

---

### 8. 数据存储对比

#### 准备清单

**存储表**：`tripChecklistStatus`
```sql
- tripId: 行程ID
- findingItemId: Finding 项ID
- checked: 是否已勾选
```

**特点**：
- 只存储勾选状态
- 清单内容不存储（每次实时生成）

#### 打包清单

**存储表**：`tripPackingListItem`
```sql
- tripId: 行程ID
- name: 物品名称
- category: 类别
- quantity: 数量
- priority: 优先级
- checked: 是否已勾选
- note: 备注
```

**特点**：
- 存储完整的物品信息
- 支持更新和持久化

---

## 总结

### 准备清单接口
- **定位**：旅行前的准备工作指南
- **数据**：所有类别的准备事项
- **格式**：事项描述 + 任务列表
- **存储**：不存储清单内容，只存储勾选状态
- **特点**：实时生成、只读、面向"做什么"

### 打包清单接口
- **定位**：旅行时的物品清单
- **数据**：仅打包相关类别的物品
- **格式**：物品列表（名称、数量、类别等）
- **存储**：完整存储到数据库
- **特点**：可生成、可更新、可自定义、面向"带什么"

---

## 使用建议

1. **准备清单**：用于旅行前的准备工作，帮助用户了解需要办理的事项
2. **打包清单**：用于旅行前的物品准备，帮助用户整理需要携带的物品
3. **两者配合**：准备清单确保"事情都办了"，打包清单确保"东西都带了"

---

## 相关文档

- [接口文档](./CHECKLIST_PACKING_LIST_API.md)
- [数据来源](./DATA_SOURCE.md)
