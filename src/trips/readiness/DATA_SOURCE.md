# 准备清单与打包清单接口数据来源说明

## 概述

准备清单和打包清单接口的数据来源于 **Readiness Pack（准备度包）** 系统。该系统通过规则引擎评估行程信息，生成个性化的准备事项和打包建议。

---

## 数据流程

### 1. 准备清单接口数据流程

```
用户请求 (tripId)
    ↓
ReadinessController.getPersonalizedChecklist()
    ↓
ReadinessService.checkFromDestination()
    ↓
PackStorageService.findPackByDestination()  // 从数据库加载 Pack
    ↓
ReadinessChecker.checkMultipleDestinations()  // 规则引擎处理
    ↓
返回 ReadinessCheckResult (findings: blockers, must, should, optional)
    ↓
转换为个性化清单格式
```

### 2. 打包清单接口数据流程

```
用户请求 (tripId + 参数)
    ↓
PackingListService.generatePackingList()
    ↓
ReadinessService.checkFromDestination()  // 获取准备度检查结果
    ↓
过滤打包相关类别 (safety_hazards, gear_packing, health_insurance)
    ↓
转换为打包清单项格式
    ↓
保存到数据库 (tripPackingListItem 表)
```

---

## 数据来源

### 1. Readiness Pack（准备度包）

**存储位置**：
- **数据库**：`readinessPack` 表
- **JSON 文件**：`src/trips/readiness/data/packs/` 目录

**数据结构**：
```typescript
interface ReadinessPack {
  packId: string;              // 包ID，如 "pack.is.iceland"
  destinationId: string;        // 目的地ID，如 "IS-ICELAND"
  displayName: LocalizedString; // 显示名称（多语言）
  version: string;              // 版本号
  lastReviewedAt: string;      // 最后审核时间
  geo: GeoInfo;                // 地理信息
  supportedSeasons: SeasonType[]; // 支持的季节
  sources: Source[];            // 数据来源（官方机构、网站等）
  rules: Rule[];                // 规则列表（核心数据）
  checklists: Checklist[];     // 清单模板
  hazards?: Hazard[];          // 风险信息
}
```

**规则（Rule）结构**：
```typescript
interface Rule {
  id: string;                  // 规则ID
  category: ReadinessCategory; // 分类（entry, safety_hazards, gear_packing等）
  severity: RuleSeverity;       // 严重程度（blocker, must, should, optional）
  appliesTo?: {                 // 适用条件
    seasons?: SeasonType[];
    activities?: string[];
    travelerTags?: string[];
  };
  when: Condition;              // 触发条件
  then: Action;                  // 执行动作（生成 finding item）
  evidence?: string;            // 证据链接
  notes?: string;               // 备注
}
```

**已配置的 Pack 示例**：
- `pack.is.iceland.json` - 冰岛
- `pack.no.tromso.json` - 挪威特罗姆瑟
- `pack.fi.lapland.json` - 芬兰拉普兰
- `pack.nz.new-zealand.json` - 新西兰
- `pack.sj.svalbard.json` - 斯瓦尔巴群岛
- 等等...

### 2. Capability Pack（能力包）

**存储位置**：代码中定义（`src/trips/readiness/packs/`）

**类型**：
1. **high-altitude** - 高海拔适应包
2. **sparse-supply** - 物资稀缺包
3. **seasonal-road** - 季节性道路包
4. **permit-checkpoint** - 许可检查点包
5. **emergency** - 紧急救援包

**工作原理**：
- 根据行程上下文（目的地、活动、季节等）自动评估哪些能力包应该被触发
- 触发的能力包会转换为 Readiness Pack，参与规则评估

### 3. 地理特征增强（可选）

**数据来源**：`GeoFactsService`

**功能**：
- 根据行程坐标查询地理特征（河流、山脉、道路、海岸线等）
- 增强上下文信息，使规则评估更精确

**地理特征类型**：
- 河流信息（是否靠近河流、渡河次数等）
- 山脉信息（海拔、地形复杂度等）
- 道路信息（道路密度等）
- 海岸线信息（是否沿海等）
- POI 信息（港口、充电站、步道起点等）

---

## Pack 匹配策略

`ReadinessService.checkFromDestination()` 使用多级匹配策略查找合适的 Pack：

1. **精确 destinationId 匹配**
   - 直接匹配 `destinationId`（如 "IS-ICELAND"）

2. **城市名称匹配**
   - 从 `destinationId` 提取城市名（如 "IS-ROVANIEMI" → "ROVANIEMI"）
   - 支持大小写变体匹配

3. **地区匹配**
   - 匹配地区名称（如 "LAPLAND"）

4. **坐标匹配**（如果提供了坐标）
   - 查找距离坐标 50km 内的 Pack

5. **国家代码匹配**（降级策略）
   - 匹配国家代码（如 "IS" → 冰岛的所有 Pack）

6. **如果都没有找到**
   - 返回空结果（无准备事项）

---

## 规则引擎处理

`ReadinessChecker` 负责处理 Pack 中的规则：

1. **条件评估**
   - 评估规则的 `when` 条件是否满足
   - 考虑行程上下文（季节、活动、旅行者标签等）

2. **规则触发**
   - 满足条件的规则会生成 `ReadinessFindingItem`
   - 根据 `severity` 分类为 blocker/must/should/optional

3. **多语言支持**
   - 根据 `lang` 参数返回对应语言的文本

4. **结果聚合**
   - 将多个 Pack 的结果合并
   - 按分类组织（entry, safety_hazards, gear_packing等）

---

## 打包清单的数据过滤

打包清单从准备度检查结果中提取特定类别：

**相关类别**：
- `safety_hazards` - 安全装备（如防滑链、急救包等）
- `gear_packing` - 装备与穿搭（如保暖衣物、防水装备等）
- `health_insurance` - 医疗相关物品（如药品、保险单等）

**处理逻辑**：
1. 遍历所有 `findings`
2. 提取 `must` 和 `should` 项中属于上述类别的项
3. 转换为 `PackingListItem` 格式
4. 添加用户自定义物品（如果提供）
5. 保存到数据库

---

## 数据存储

### 数据库表

1. **`readinessPack`** - 存储 Readiness Pack
   - `packId`: 包ID
   - `destinationId`: 目的地ID
   - `packData`: Pack JSON 数据
   - `isActive`: 是否激活

2. **`tripChecklistStatus`** - 存储准备清单勾选状态
   - `tripId`: 行程ID
   - `findingItemId`: Finding 项ID
   - `checked`: 是否已勾选

3. **`tripPackingListItem`** - 存储打包清单项
   - `tripId`: 行程ID
   - `name`: 物品名称
   - `category`: 类别
   - `quantity`: 数量
   - `priority`: 优先级
   - `checked`: 是否已勾选

### JSON 文件

位置：`src/trips/readiness/data/packs/`

格式：`pack.{country}.{region}.json`

示例：
- `pack.is.iceland.json` - 冰岛
- `pack.no.tromso.json` - 挪威特罗姆瑟
- `pack.fi.lapland.json` - 芬兰拉普兰

---

## 数据来源权威性

### Pack 中的 `sources` 字段

每个 Pack 都包含数据来源信息，例如：

```json
{
  "sources": [
    {
      "sourceId": "src.safetravel.is",
      "authority": "SafeTravel Iceland",
      "type": "html",
      "title": {
        "en": "Iceland Travel Safety Information",
        "zh": "冰岛旅行安全信息"
      },
      "canonicalUrl": "https://www.safetravel.is/"
    }
  ]
}
```

**常见数据来源**：
- 官方旅游安全网站
- 气象局
- 移民局
- 大使馆
- 专业旅行指南

---

## 数据更新流程

### 1. 创建/更新 Pack

**方式 1：从 JSON 文件导入**
```bash
# 使用导入脚本
ts-node scripts/import-readiness-pack.ts src/trips/readiness/data/packs/pack.is.iceland.json
```

**方式 2：通过 API 导入**
```http
POST /api/readiness/packs/import
{
  "filePath": "src/trips/readiness/data/packs/pack.is.iceland.json"
}
```

### 2. Pack 版本管理

- 每个 Pack 有 `version` 字段（语义化版本号）
- 数据库存储时，相同 `packId` 的多个版本可以共存
- 查询时选择最新版本（`orderBy: { version: 'desc' }`）

### 3. 激活/停用 Pack

- 通过 `isActive` 字段控制
- 停用的 Pack 不会被查询到

---

## 数据依赖关系

```
ReadinessPack (数据库/JSON)
    ↓
ReadinessChecker (规则引擎)
    ↓
ReadinessCheckResult (findings)
    ↓
准备清单接口 ← 直接使用 findings
打包清单接口 ← 过滤 findings 中的特定类别
```

---

## 相关文件

- **Pack 存储服务**：`src/trips/readiness/storage/pack-storage.service.ts`
- **准备度服务**：`src/trips/readiness/services/readiness.service.ts`
- **规则引擎**：`src/trips/readiness/engine/readiness-checker.ts`
- **打包清单服务**：`src/trips/readiness/services/packing-list.service.ts`
- **Pack 类型定义**：`src/trips/readiness/types/readiness-pack.types.ts`
- **Pack JSON 文件**：`src/trips/readiness/data/packs/`

---

## 总结

1. **准备清单**的数据来源于 Readiness Pack 中的规则评估结果
2. **打包清单**的数据来源于准备度检查结果中与打包相关的类别
3. Pack 可以从数据库或 JSON 文件加载
4. 规则引擎根据行程上下文（目的地、季节、活动等）动态评估规则
5. 数据来源都有权威性标注（sources 字段）
