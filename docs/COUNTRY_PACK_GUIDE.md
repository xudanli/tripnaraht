# 国家 Pack 生成指南

## 概述

国家 Pack 是一套工具，用于快速生成新国家的 RouteDirection 配置包，并验证其完整性。这套工具包括：

1. **new-country-pack.ts** - 生成新国家的 RouteDirection skeleton
2. **pack-validator.ts** - 校验 Pack 的完整性
3. **generate-regression-tests.ts** - 自动生成回归用例框架

## 使用流程

### 1. 生成国家 Pack

```bash
npx ts-node --project tsconfig.backend.json scripts/new-country-pack.ts <countryCode> [countryName]
```

**示例：**
```bash
# 生成冰岛 Pack
npx ts-node --project tsconfig.backend.json scripts/new-country-pack.ts IS Iceland

# 生成挪威 Pack
npx ts-node --project tsconfig.backend.json scripts/new-country-pack.ts NO Norway
```

**输出：**
- 文件：`data/country-packs/country-pack-<countryCode>.json`
- 包含：3 条 RouteDirection skeleton + regions + policy

### 2. 编辑 Pack 文件

打开生成的 JSON 文件，填写具体信息：

```json
{
  "countryCode": "IS",
  "countryName": "Iceland",
  "countryNameCN": "冰岛",
  "routeDirections": [
    {
      "name": "IS_CULTURAL_CITIES",
      "nameCN": "冰岛城市文化之旅",
      "regions": ["IS_REYKJAVIK", "IS_AKUREYRI"],  // 填写实际 regions
      "entryHubs": ["雷克雅未克机场", "阿克雷里"],
      "constraints": {
        "soft": {
          "maxDailyAscentM": 200,
          "maxElevationM": 1000
        }
      },
      "signaturePois": {
        "types": ["MUSEUM", "HISTORIC_SITE", "CITY_CENTER"],
        "examples": ["place_uuid_1", "place_uuid_2"]  // 填写实际 POI UUID
      },
      "metadata": {
        "corridorGeom": "LINESTRING(...)"  // 填写地理走廊 WKT
      }
    }
  ]
}
```

**需要填写的字段：**
- `regions`: 实际区域代码（如 `IS_REYKJAVIK`）
- `entryHubs`: 实际入口枢纽名称
- `signaturePois.examples`: 实际 POI UUID 列表
- `metadata.corridorGeom`: 地理走廊 WKT（LineString 或 Polygon）
- `seasonality`: 根据国家实际情况调整最佳/禁忌月份
- `constraints`: 根据路线实际情况调整约束值
- `riskProfile`: 根据路线实际情况调整风险画像

### 3. 校验 Pack

```bash
npx ts-node --project tsconfig.backend.json scripts/pack-validator.ts <pack-file>
```

**示例：**
```bash
npx ts-node --project tsconfig.backend.json scripts/pack-validator.ts data/country-packs/country-pack-is.json
```

**校验内容：**
- ✅ 必需字段：name, nameCN, tags
- ⚠️ 建议字段：regions, entryHubs, constraints, signaturePois, seasonality, riskProfile
- ⚠️ 阈值检查：maxDailyAscentM, maxElevationM
- ⚠️ 地理走廊：corridorGeom

**输出：**
- 错误列表（必须修复）
- 警告列表（建议修复）
- 缺失字段列表

### 4. 生成回归用例

```bash
npx ts-node --project tsconfig.backend.json scripts/generate-regression-tests.ts <pack-file>
```

**示例：**
```bash
npx ts-node --project tsconfig.backend.json scripts/generate-regression-tests.ts data/country-packs/country-pack-is.json
```

**输出：**
- 文件：`data/regression-tests/regression-tests-<countryCode>.json`
- 包含：10 条回归用例框架

**用例类型：**
1. 基础测试 - 默认偏好
2. 季节性测试 - 最佳月份
3. 季节性测试 - 禁忌月份
4. 节奏测试 - 轻松
5. 节奏测试 - 挑战
6. 风险测试 - 低风险
7. 风险测试 - 高风险
8. 偏好测试 - 文化
9. 偏好测试 - 自然
10. 综合测试 - 多条件组合

### 5. 导入到数据库

使用 `seed-route-directions.ts` 或直接通过 API 导入：

```bash
# 通过 API 导入（需要先启动服务）
curl -X POST http://localhost:3000/route-directions \
  -H "Content-Type: application/json" \
  -d @data/country-packs/country-pack-is.json
```

## Pack 结构说明

### RouteDirection Skeleton

每个 RouteDirection 应包含：

```typescript
{
  name: string;              // 路线方向标识（必需）
  nameCN: string;            // 中文名称（必需）
  nameEN?: string;           // 英文名称（可选）
  description?: string;      // 路线描述（可选）
  tags: string[];            // 标签数组（必需）
  regions: string[];         // 区域列表（建议）
  entryHubs: string[];      // 入口枢纽（建议）
  seasonality?: {            // 季节性（建议）
    bestMonths?: number[];
    avoidMonths?: number[];
  };
  constraints?: {            // 约束（建议）
    hard?: {
      maxDailyRapidAscentM?: number;
      maxSlopePct?: number;
      requiresPermit?: boolean;
      requiresGuide?: boolean;
    };
    soft?: {
      maxDailyAscentM?: number;
      maxElevationM?: number;
      bufferTimeMin?: number;
    };
  };
  riskProfile?: {            // 风险画像（建议）
    altitudeSickness?: boolean;
    roadClosure?: boolean;
    ferryDependent?: boolean;
    weatherWindow?: boolean;
    weatherWindowMonths?: number[];
  };
  signaturePois?: {         // 代表性 POI（建议）
    types?: string[];
    examples?: string[];
  };
  itinerarySkeleton?: {      // 行程骨架（可选）
    dayThemes?: string[];
    dailyPace?: string;
    restDaysRequired?: number[];
  };
  metadata?: {               // 元数据（可选）
    corridorGeom?: string;    // 地理走廊 WKT
    extensions?: {            // 扩展字段
      transport?: {...};
      compliance?: {...};
    };
  };
}
```

## 最佳实践

1. **至少 3 条 RouteDirection**
   - 城市文化之旅（轻松）
   - 自然风光（中等）
   - 挑战之旅（困难）

2. **完整的约束定义**
   - 至少定义 soft constraints
   - 设置合理的阈值（maxDailyAscentM, maxElevationM）

3. **准确的季节性信息**
   - 根据国家实际情况设置 bestMonths 和 avoidMonths
   - 考虑南北半球差异

4. **地理走廊（corridorGeom）**
   - 使用 PostGIS LineString 或 Polygon WKT
   - 可以基于主要路线或区域边界

5. **代表性 POI**
   - 至少定义 types（POI 类型）
   - 建议填写 examples（实际 POI UUID）

## 验收标准

✅ **Pack 校验通过**（无错误）
✅ **至少 3 条 RouteDirection**
✅ **每条 RouteDirection 包含：**
   - regions（至少 1 个）
   - entryHubs（至少 1 个）
   - constraints（至少 soft constraints）
   - signaturePois.types（至少 1 个）
   - seasonality（bestMonths 和 avoidMonths）

✅ **生成 10 条回归用例**
✅ **回归用例能通过 E2E 测试**

## 示例

完整的工作流程示例：

```bash
# 1. 生成 Pack
npx ts-node --project tsconfig.backend.json scripts/new-country-pack.ts IS Iceland

# 2. 编辑 data/country-packs/country-pack-is.json

# 3. 校验 Pack
npx ts-node --project tsconfig.backend.json scripts/pack-validator.ts data/country-packs/country-pack-is.json

# 4. 生成回归用例
npx ts-node --project tsconfig.backend.json scripts/generate-regression-tests.ts data/country-packs/country-pack-is.json

# 5. 导入到数据库（通过 seed 脚本或 API）
```

## 故障排除

### 问题：校验失败，缺少必需字段

**解决：** 检查 JSON 文件格式，确保所有必需字段都存在。

### 问题：警告：缺少 corridorGeom

**解决：** 在 `metadata.corridorGeom` 中添加地理走廊 WKT，或使用 PostGIS 工具生成。

### 问题：警告：signaturePois.types 为空

**解决：** 至少添加一个 POI 类型，如 `["VIEWPOINT", "TRAIL"]`。

### 问题：回归用例失败

**解决：** 检查 RouteDirection 的实际数据，调整 `expected` 字段以匹配实际情况。

