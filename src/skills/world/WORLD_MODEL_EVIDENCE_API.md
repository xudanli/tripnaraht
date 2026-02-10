# 世界模型证据 API 文档

**版本**: 1.0.0  
**日期**: 2026-02-10  
**状态**: 当前实现

---

## 📋 概述

世界模型证据 API 提供查询世界模型证据的接口，包括 DEM 证据、道路状态、天气窗口、路线哲学、失败画像和用户能力匹配等信息。

---

## 🎯 基础路径

```
/api/world-model-evidence    # 世界模型证据接口
```

---

## 📚 接口列表

### 1. 获取世界模型证据（POST方式）

**端点**: `POST /api/world-model-evidence`  
**说明**: 根据行程ID或国家代码获取世界模型证据

#### 请求体

```typescript
{
  tripId?: string;              // 行程ID（UUID），如果提供则优先使用
  countryCode?: string;         // 国家代码（ISO 3166-1 alpha-2），如果未提供tripId则必需
  month?: number;               // 月份（1-12），用于天气窗口评估
  routeDirectionId?: string;    // 路线方向ID（UUID）
  include?: 'dem' | 'road' | 'weather' | 'philosophy' | 'failure' | 'all';  // 包含的证据类型，默认'all'
}
```

#### 请求示例

```json
{
  "tripId": "f3626ff1-7a9b-46d9-8b8b-7f53a14583b1",
  "month": 7,
  "include": "all"
}
```

或

```json
{
  "countryCode": "IS",
  "month": 7,
  "routeDirectionId": "8afd4b2e-7dd1-4837-8169-d3efed748138",
  "include": "all"
}
```

#### 响应格式

```typescript
{
  success: true,
  data: {
    tripId?: string;
    countryCode: string;
    routeDirectionId?: string;
    routeDirectionName?: string;
    demEvidence?: {
      totalDistanceKm: number;
      cumulativeAscentM: number;
      maxSlopePct: number;
      fatigueIndex: number;
      threeDayRollingAscentM: number;
      pointCount: number;
    };
    roadStates?: Array<{
      name: string;
      status: 'open' | 'closed' | 'conditional';
      openPeriod?: string;
      vehicleRequirement?: string;
    }>;
    weatherWindow?: {
      bestMonths: number[];
      avoidMonths: number[];
      accessibilityScore: number;
      selectedMonth?: number;
      weatherDetails?: {
        temperature?: number;
        windSpeed?: number;
        snowRisk?: string;
        visibility?: string;
      };
    };
    philosophy?: {
      coreStatement: string;
      mustVisitTags: string[];
      nonNegotiableRules: string[];
      flexibleParts: string[];
      coverageStatus: Record<string, boolean>;
    };
    failureProfile?: {
      commonFailureDays: number[];
      typicalFailureReasons: string[];
      rescueDifficulty: 'LOW' | 'MEDIUM' | 'HIGH';
      failureScenarios: Array<{
        day: number;
        reason: string;
        mitigation: string;
      }>;
    };
    userCapabilityMatch?: {
      riskTolerance: {
        route: string;
        user: string;
        match: boolean;
      };
      vehicleRequirement: {
        required: string;
        userHas: boolean;
        match: boolean;
      };
      fitness: {
        routeMaxAscent: number;
        userMaxAscent: number;
        match: boolean;
      };
    };
    buildTimestamp: string;
  }
}
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "tripId": "f3626ff1-7a9b-46d9-8b8b-7f53a14583b1",
    "countryCode": "IS",
    "routeDirectionId": "8afd4b2e-7dd1-4837-8169-d3efed748138",
    "routeDirectionName": "内陆高地F路",
    "demEvidence": {
      "totalDistanceKm": 997.4,
      "cumulativeAscentM": 2350,
      "maxSlopePct": 18,
      "fatigueIndex": 72,
      "threeDayRollingAscentM": 1410,
      "pointCount": 10
    },
    "roadStates": [
      {
        "name": "F208",
        "status": "open",
        "openPeriod": "6月15日-9月15日",
        "vehicleRequirement": "四驱SUV"
      },
      {
        "name": "F26",
        "status": "open",
        "openPeriod": "6月15日-9月15日",
        "vehicleRequirement": "四驱SUV"
      }
    ],
    "weatherWindow": {
      "bestMonths": [7, 8],
      "avoidMonths": [12, 1, 2, 3],
      "accessibilityScore": 0.9,
      "selectedMonth": 7,
      "weatherDetails": {
        "temperature": 12,
        "windSpeed": 8,
        "snowRisk": "LOW",
        "visibility": "HIGH"
      }
    },
    "philosophy": {
      "coreStatement": "从文明进入高地，再回到人间",
      "mustVisitTags": ["高地荒原", "温泉", "火山"],
      "nonNegotiableRules": [
        "必须四驱SUV（法律要求）",
        "必须住高地hut",
        "必须经过F路"
      ],
      "flexibleParts": [
        "具体F路选择（F26 / F35 / F208）",
        "中间停留点（POI可替换）"
      ],
      "coverageStatus": {
        "高地荒原": true,
        "温泉": true,
        "火山": true
      }
    },
    "failureProfile": {
      "commonFailureDays": [3, 4],
      "typicalFailureReasons": ["河流穿越失败", "天气突变"],
      "rescueDifficulty": "HIGH",
      "failureScenarios": [
        {
          "day": 3,
          "reason": "Sprengisandur (F26) 河流穿越失败 - 冰川河流水位过高或车辆陷入",
          "mitigation": "建议跟随有经验的向导或参加F路穿越团，携带拖车绳和卫星通信设备"
        }
      ]
    },
    "userCapabilityMatch": {
      "riskTolerance": {
        "route": "HIGH",
        "user": "HIGH",
        "match": true
      },
      "vehicleRequirement": {
        "required": "四驱SUV",
        "userHas": true,
        "match": true
      },
      "fitness": {
        "routeMaxAscent": 500,
        "userMaxAscent": 500,
        "match": true
      }
    },
    "buildTimestamp": "2026-02-10T10:00:00.000Z"
  }
}
```

---

### 2. 获取世界模型证据（GET方式）

**端点**: `GET /api/world-model-evidence`  
**说明**: 通过查询参数获取世界模型证据，功能与POST方式相同

#### 查询参数

| 参数 | 类型 | 必需 | 说明 | 示例 |
|------|------|------|------|------|
| `tripId` | string | 否 | 行程ID（UUID） | `f3626ff1-7a9b-46d9-8b8b-7f53a14583b1` |
| `countryCode` | string | 否* | 国家代码（ISO 3166-1 alpha-2），如果未提供tripId则必需 | `IS` |
| `month` | number | 否 | 月份（1-12），用于天气窗口评估 | `7` |
| `routeDirectionId` | string | 否 | 路线方向ID（UUID） | `8afd4b2e-7dd1-4837-8169-d3efed748138` |
| `include` | string | 否 | 包含的证据类型（dem/road/weather/philosophy/failure/all），默认'all' | `all` |

#### 请求示例

```
GET /api/world-model-evidence?tripId=f3626ff1-7a9b-46d9-8b8b-7f53a14583b1&month=7&include=all
```

或

```
GET /api/world-model-evidence?countryCode=IS&month=7&routeDirectionId=8afd4b2e-7dd1-4837-8169-d3efed748138&include=all
```

#### 响应格式

与POST方式相同

---

### 3. 根据行程ID获取世界模型证据

**端点**: `GET /api/world-model-evidence/trip/:tripId`  
**说明**: 快速获取指定行程的世界模型证据

#### 路径参数

- `tripId` (string, 必需): 行程ID（UUID）

#### 查询参数

| 参数 | 类型 | 必需 | 说明 | 示例 |
|------|------|------|------|------|
| `include` | string | 否 | 包含的证据类型（dem/road/weather/philosophy/failure/all），默认'all' | `all` |

#### 请求示例

```
GET /api/world-model-evidence/trip/f3626ff1-7a9b-46d9-8b8b-7f53a14583b1?include=all
```

#### 响应格式

与POST方式相同

---

## 🔍 使用场景

### 场景1: 行程详情页展示世界模型证据

```typescript
// 前端调用
const response = await fetch('/api/world-model-evidence', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tripId: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1',
    include: 'all',
  }),
});

const { data } = await response.json();

// 展示DEM证据
if (data.demEvidence) {
  console.log(`总距离: ${data.demEvidence.totalDistanceKm}km`);
  console.log(`累计爬升: ${data.demEvidence.cumulativeAscentM}m`);
}

// 展示道路状态
if (data.roadStates) {
  data.roadStates.forEach(road => {
    console.log(`${road.name}: ${road.status}`);
  });
}

// 展示天气窗口
if (data.weatherWindow) {
  console.log(`最佳月份: ${data.weatherWindow.bestMonths.join(', ')}`);
  console.log(`可达性评分: ${data.weatherWindow.accessibilityScore}`);
}
```

### 场景2: 只获取DEM证据

```typescript
const response = await fetch('/api/world-model-evidence', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tripId: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1',
    include: 'dem',  // 只获取DEM证据
  }),
});
```

### 场景3: 规划页面获取路线匹配信息

```typescript
const response = await fetch('/api/world-model-evidence', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    countryCode: 'IS',
    month: 7,
    include: 'philosophy',  // 只获取路线哲学
  }),
});
```

---

## ⚠️ 错误处理

### 错误响应格式

```typescript
{
  success: false,
  error: {
    code: string;
    message: string;
  }
}
```

### 常见错误

| 错误码 | HTTP状态码 | 说明 | 解决方案 |
|--------|-----------|------|---------|
| `BAD_REQUEST` | 400 | 必须提供tripId或countryCode | 提供tripId或countryCode参数 |
| `NOT_FOUND` | 404 | 行程不存在 | 检查tripId是否正确 |
| `INTERNAL_ERROR` | 500 | 服务器内部错误 | 联系技术支持 |

---

## 📝 注意事项

1. **缓存**: 世界模型证据使用缓存（TTL: 1小时），相同参数的请求会返回缓存结果
2. **性能**: 构建世界模型可能需要几秒钟，建议前端显示加载状态
3. **数据完整性**: 某些证据可能不存在（如failureProfile），API会返回undefined而不是错误
4. **include参数**: 使用include参数可以只获取需要的证据类型，提高性能

---

**文档生成时间**: 2026-02-10  
**API版本**: 1.0.0
