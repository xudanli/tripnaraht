# 准备度检查 API 接口文档

## 目录

- [概述](#概述)
- [数据模型](#数据模型)
- [API 接口](#api-接口)
  - [1. 检查旅行准备度](#1-检查旅行准备度)
  - [2. 根据行程ID检查准备度](#2-根据行程id检查准备度)
  - [3. 获取能力包列表](#3-获取能力包列表)
  - [4. 评估能力包](#4-评估能力包)
  - [5. 获取个性化准备清单](#5-获取个性化准备清单)
  - [6. 行程潜在风险预警](#6-行程潜在风险预警)
- [POI 分类枚举](#poi-分类枚举)
- [新增接口（P0/P1/P2）](#新增接口p0p1p2)
  - [7. 添加能力包规则到准备清单](#7-添加能力包规则到准备清单)
  - [8. 获取能力包清单项](#8-获取能力包清单项)
  - [9. 更新清单项状态](#9-更新清单项状态)
  - [10. 删除清单项](#10-删除清单项)
  - [11. 风险预警（增强版）](#11-风险预警增强版)
  - [12. 能力包评估（增强版）](#12-能力包评估增强版)
- [接口对比](#接口对比)
- [更新日志](#更新日志)

---

## 概述

准备度检查（Readiness Check）系统用于评估旅行者在特定目的地的准备情况，返回必须做/强烈建议/可选的准备清单、风险预警和证据引用。本文档描述了准备度相关的所有 API 接口。

> 📖 **最新变更（2026-01-29）**: 
> - 所有检查接口响应现在包含 `disclaimer` 字段（免责声明）
> - 约束编译结果新增 `constraintType` 字段，用于区分blocker和must
> - 完善数据模型定义，包含完整的字段说明
> - 🆕 **风险预警接口大幅增强**：
>   - ✅ 新增风险类型标签（中文/英文）、分类、图标
>   - ✅ 新增严重程度标签（中文/英文）
>   - ✅ 新增详细说明和影响描述
>   - ✅ 新增影响的POI信息（名称、天数）
>   - ✅ 新增按分类分组和统计
>   - ✅ 修复风险描述为空的问题
>   - ✅ 支持大小写不敏感的风险类型匹配
>   - 📖 详细说明请参考 [11. 风险预警（增强版）](#11-风险预警增强版)
> 
> 📋 **快速参考**: 最新接口文档请参考 [`docs/READINESS_API_LATEST.md`](../../docs/READINESS_API_LATEST.md)

## 基础信息

- **基础路径**: `/readiness`
- **响应格式**: 统一使用标准响应格式
  ```json
  {
    "success": true,
    "data": { ... },
    "error": null
  }
  ```

## 数据模型

### CheckReadinessDto 接口

```typescript
interface CheckReadinessDto {
  destinationId: string;              // 目的地ID（必填）
  traveler?: {                        // 旅行者信息（可选）
    nationality?: string;              // 国籍（ISO 3166-1 alpha-2）
    residencyCountry?: string;         // 居住国
    tags?: string[];                   // 标签
    budgetLevel?: 'low' | 'medium' | 'high';  // 预算水平
    riskTolerance?: 'low' | 'medium' | 'high';  // 风险承受度
  };
  trip?: {                            // 行程信息（可选）
    startDate?: string;                // 开始日期（ISO 8601）
    endDate?: string;                  // 结束日期（ISO 8601）
  };
  itinerary?: {                       // 行程详情（可选）
    countries?: string[];              // 国家代码列表
    activities?: string[];            // 活动类型列表
    season?: string;                  // 季节
    region?: string;                  // 地区
    hasSeaCrossing?: boolean;         // 是否有海上穿越
    hasAuroraActivity?: boolean;      // 是否有极光活动
    vehicleType?: string;             // 车辆类型
    routeLength?: number;             // 路线长度
  };
  geo?: {                             // 地理位置（可选）
    lat?: number;                     // 纬度
    lng?: number;                     // 经度
    enhanceWithGeo?: boolean;         // 是否使用地理位置增强（默认 true）
  };
}
```

### ReadinessCheckResult 接口

```typescript
interface ReadinessCheckResult {
  findings: ReadinessFinding[];       // 检查结果列表
  summary: {                          // 摘要信息
    totalBlockers: number;            // 阻塞项总数
    totalMust: number;                // 必须项总数
    totalShould: number;              // 建议项总数
    totalOptional: number;            // 可选项总数
    totalRisks: number;                // 风险总数
  };
  /**
   * 免责声明和责任边界
   * 必须包含在API响应中，前端必须显示给用户
   */
  disclaimer?: ReadinessDisclaimer;
}
```

### ReadinessDisclaimer 接口

```typescript
interface ReadinessDisclaimer {
  /**
   * 免责声明消息
   * 告知用户本检查结果仅供参考，实际要求以官方机构为准
   */
  message: string;
  
  /**
   * 数据最后更新时间
   * 格式：ISO 8601 datetime
   * 来源：所有Pack的lastReviewedAt中的最新日期
   */
  lastUpdated?: string;
  
  /**
   * 数据来源列表
   * 例如：['pack.is.iceland', 'facts.NZ']
   */
  dataSources?: string[];
  
  /**
   * 用户必须自行验证的事项
   * 例如：['签证要求', '保险覆盖范围']
   */
  userActionRequired?: string[];
}
```

### ReadinessFinding 接口

```typescript
interface ReadinessFinding {
  destinationId: string;              // 目的地ID
  packId: string;                      // Pack ID
  packVersion: string;                 // Pack 版本号
  blockers: ReadinessFindingItem[];     // 阻塞项（必须解决）
  must: ReadinessFindingItem[];        // 必须项
  should: ReadinessFindingItem[];      // 建议项
  optional: ReadinessFindingItem[];    // 可选项
  risks: Array<{                        // 风险列表
    type: HazardType;
    severity: RuleSeverity;
    summary: string;
    mitigations: string[];
  }>;
  missingInfo?: string[];               // 需要用户提供的信息
}
```

### ReadinessFindingItem 接口

```typescript
interface ReadinessFindingItem {
  id: string;                          // 规则ID
  category: ReadinessCategory;         // 分类（entry_transit, safety_hazards等）
  severity: RuleSeverity;              // 严重程度（low, medium, high）
  level: ActionLevel;                  // 优先级级别（blocker, must, should, optional）
  message: string;                     // 消息描述
  tasks?: Array<{                      // 任务列表
    title: string;                     // 任务标题
    dueOffsetDays?: number;            // 相对出发日期的偏移天数（负数表示提前）
    tags?: string[];                   // 标签
  }>;
  askUser?: string[];                  // 需要用户提供的信息
  evidence?: Array<{                   // 证据引用
    sourceId: string;
    sectionId?: string;
    quote?: string;
  }>;
}
```

### ReadinessConstraint 接口（约束编译结果）

```typescript
interface ReadinessConstraint {
  id: string;                          // 约束ID
  type: 'hard' | 'soft';              // 约束类型
  severity: 'error' | 'warning' | 'info'; // 严重程度
  /**
   * 约束类型，用于区分blocker和must
   * - 'legal_blocker': 法律/法规硬性要求（blocker级别，entry_transit/health_insurance类别）
   * - 'safety_blocker': 安全硬性要求（blocker级别，其他类别）
   * - 'strong_recommendation': 强烈建议（must级别）
   * - 'recommendation': 建议（should级别）
   * - 'optional': 可选（optional级别）
   */
  constraintType?: 'legal_blocker' | 'safety_blocker' | 'strong_recommendation' | 'recommendation' | 'optional';
  message: string;                     // 消息描述
  evidence?: Array<{                   // 证据引用
    sourceId: string;
    sectionId?: string;
    quote?: string;
  }>;
  tasks?: Array<{                      // 任务列表
    title: string;
    dueOffsetDays?: number;
    tags?: string[];
  }>;
  askUser?: string[];                  // 需要用户提供的信息
  penalty?: (state: any) => number;     // 软约束的惩罚函数（仅soft类型）
}
```

---

## API 接口

### 1. 检查旅行准备度

基于目的地和行程信息，检查旅行准备度并返回 must/should/optional 清单。

**接口**: `POST /readiness/check`

**请求体**:

```json
{
  "destinationId": "NZ",
  "traveler": {
    "nationality": "CN",
    "residencyCountry": "CN",
    "tags": ["photography", "hiking"],
    "budgetLevel": "medium",
    "riskTolerance": "medium"
  },
  "trip": {
    "startDate": "2024-12-01",
    "endDate": "2024-12-15"
  },
  "itinerary": {
    "countries": ["NZ"],
    "activities": ["hiking", "photography"],
    "season": "summer",
    "region": "South Island",
    "hasSeaCrossing": false
  },
  "geo": {
    "lat": -43.5321,
    "lng": 172.6362,
    "enhanceWithGeo": true
  }
}
```

**字段说明**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| destinationId | string | 是 | 目的地ID（国家代码或城市ID） |
| traveler.nationality | string | 否 | 国籍（ISO 3166-1 alpha-2） |
| traveler.residencyCountry | string | 否 | 居住国 |
| traveler.tags | string[] | 否 | 旅行者标签 |
| traveler.budgetLevel | enum | 否 | 预算水平：low/medium/high |
| traveler.riskTolerance | enum | 否 | 风险承受度：low/medium/high |
| trip.startDate | string | 否 | 开始日期（ISO 8601） |
| trip.endDate | string | 否 | 结束日期（ISO 8601） |
| itinerary.countries | string[] | 否 | 国家代码列表 |
| itinerary.activities | string[] | 否 | 活动类型列表 |
| itinerary.season | string | 否 | 季节 |
| itinerary.region | string | 否 | 地区 |
| itinerary.hasSeaCrossing | boolean | 否 | 是否有海上穿越 |
| itinerary.hasAuroraActivity | boolean | 否 | 是否有极光活动 |
| itinerary.vehicleType | string | 否 | 车辆类型 |
| itinerary.routeLength | number | 否 | 路线长度 |
| geo.lat | number | 否 | 纬度 |
| geo.lng | number | 否 | 经度 |
| geo.enhanceWithGeo | boolean | 否 | 是否使用地理位置增强（默认 true） |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "findings": [
      {
        "category": "entry",
        "blockers": [
          {
            "message": "需要办理新西兰电子旅行授权（NZeTA）",
            "tasks": [
              "访问新西兰移民局官网申请 NZeTA",
              "准备护照信息",
              "支付申请费用"
            ],
            "evidence": "https://www.immigration.govt.nz/nzeta"
          }
        ],
        "must": [
          {
            "message": "购买旅行保险，需覆盖高海拔活动",
            "tasks": [
              "选择覆盖高风险活动的保险",
              "确认保险覆盖海拔3000米以上活动"
            ]
          }
        ],
        "should": [
          {
            "message": "准备适合高海拔的装备",
            "tasks": [
              "准备保暖衣物",
              "准备防晒用品"
            ]
          }
        ],
        "optional": [
          {
            "message": "学习基本的新西兰英语短语",
            "tasks": []
          }
        ],
        "risks": [
          {
            "type": "altitude",
            "severity": "medium",
            "summary": "高海拔地区可能出现高原反应",
            "mitigations": [
              "逐步适应海拔",
              "准备抗高反药物"
            ]
          }
        ]
      }
    ],
    "summary": {
      "totalBlockers": 1,
      "totalMust": 3,
      "totalShould": 5,
      "totalOptional": 2,
      "totalRisks": 1
    },
    "disclaimer": {
      "message": "本检查结果仅供参考，实际要求以官方机构（如大使馆、移民局、旅游局）的最新政策为准。建议在出发前再次确认关键信息（如签证、保险、健康证明等）。",
      "dataSources": ["pack.nz.new-zealand"],
      "userActionRequired": ["签证要求", "保险覆盖范围"]
    }
  },
  "error": null
}
```

**错误响应**:

- `400`: 请求参数错误
- `404`: 目的地不存在
- `500`: 服务器内部错误

---

### 2. 根据行程ID检查准备度

基于行程ID自动获取行程信息并检查准备度，返回 must/should/optional 清单。这是前端最常用的接口，会自动从行程中提取目的地、日期、活动类型等信息。

**接口**: `GET /readiness/trip/:id`

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 行程 ID (UUID) |

**请求示例**:

```http
GET /readiness/trip/d125c30f-44ab-4a9e-9970-b899fccdc3d8
```

**响应格式**:

与 `POST /readiness/check` 返回相同的 `ReadinessCheckResult` 格式。

**响应示例**:

```json
{
  "success": true,
  "data": {
    "findings": [
      {
        "category": "entry",
        "blockers": [
          {
            "message": "需要办理冰岛签证",
            "tasks": [
              "访问冰岛大使馆官网申请签证",
              "准备护照和行程单"
            ],
            "evidence": "https://www.iceland.is/visas"
          }
        ],
        "must": [
          {
            "message": "购买旅行保险，需覆盖高风险活动",
            "tasks": [
              "选择覆盖高风险活动的保险"
            ]
          }
        ],
        "should": [
          {
            "message": "准备适合寒冷天气的装备",
            "tasks": [
              "准备保暖衣物",
              "准备防水装备"
            ]
          }
        ],
        "optional": [],
        "risks": []
      }
    ],
    "summary": {
      "totalBlockers": 1,
      "totalMust": 2,
      "totalShould": 3,
      "totalOptional": 0,
      "totalRisks": 0
    },
    "disclaimer": {
      "message": "本检查结果仅供参考，实际要求以官方机构（如大使馆、移民局、旅游局）的最新政策为准。建议在出发前再次确认关键信息（如签证、保险、健康证明等）。",
      "dataSources": ["pack.is.iceland"],
      "userActionRequired": ["签证要求", "保险覆盖范围"]
    }
  },
  "error": null
}
```

**字段说明**:

- 系统会自动从行程中提取以下信息：
  - **目的地**: 从 `trip.destination` 获取
  - **日期**: 从 `trip.startDate` 和 `trip.endDate` 获取
  - **活动类型**: 从行程项（ItineraryItem）的 Place 分类和名称中推断
  - **季节**: 根据开始日期自动计算
  - **旅行者偏好**: 从 `trip.metadata.preferences` 获取（如预算水平、风险承受度）
- **免责声明**: 所有响应都包含 `disclaimer` 字段，前端必须显示给用户

**错误响应**:

- `404`: 行程不存在
- `500`: 服务器内部错误

**使用场景**:

- 前端在行程详情页显示准备度检查结果
- 自动获取行程相关信息，无需手动输入参数
- 适用于已创建的行程，快速查看准备度状态

---

### 3. 获取能力包列表

返回所有可用的能力包信息。

**接口**: `GET /readiness/capability-packs`

**请求示例**:

```http
GET /readiness/capability-packs
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "packs": [
      {
        "type": "high-altitude",
        "displayName": "高海拔适应包",
        "description": "适用于海拔3000米以上的目的地"
      },
      {
        "type": "sparse-supply",
        "displayName": "物资稀缺包",
        "description": "适用于物资供应稀缺的地区"
      },
      {
        "type": "seasonal-road",
        "displayName": "季节性道路包",
        "description": "适用于有季节性封路的目的地"
      },
      {
        "type": "permit-checkpoint",
        "displayName": "许可检查点包",
        "description": "适用于需要许可或检查点的目的地"
      },
      {
        "type": "emergency",
        "displayName": "紧急救援包",
        "description": "适用于偏远或高风险地区"
      }
    ]
  },
  "error": null
}
```

---

### 4. 评估能力包

评估哪些能力包应该被触发。

**接口**: `POST /readiness/capability-packs/evaluate`

**请求体**:

与 `POST /readiness/check` 使用相同的 `CheckReadinessDto` 格式。

**请求示例**:

```json
{
  "destinationId": "NZ",
  "traveler": {
    "nationality": "CN",
    "riskTolerance": "medium"
  },
  "itinerary": {
    "countries": ["NZ"],
    "activities": ["hiking"],
    "region": "South Island"
  },
  "geo": {
    "lat": -43.5321,
    "lng": 172.6362
  }
}
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "total": 5,
    "triggered": 2,
    "results": [
      {
        "pack": {
          "type": "high-altitude",
          "displayName": "高海拔适应包"
        },
        "triggered": true,
        "reason": "目的地海拔超过3000米"
      },
      {
        "pack": {
          "type": "seasonal-road",
          "displayName": "季节性道路包"
        },
        "triggered": true,
        "reason": "目的地存在季节性封路"
      }
    ]
  },
  "error": null
}
```

---

### 5. 获取个性化准备清单

获取适配行程的准备事项清单，按 blocker/must/should/optional 分类。

**接口**: `GET /readiness/personalized-checklist`

**查询参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| tripId | string | 是 | 行程ID |

**请求示例**:

```http
GET /readiness/personalized-checklist?tripId=trip-123
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "tripId": "trip-123",
    "checklist": {
      "blocker": [
        {
          "message": "需要办理新西兰电子旅行授权（NZeTA）",
          "tasks": [
            "访问新西兰移民局官网申请 NZeTA",
            "准备护照信息"
          ],
          "deadline": null,
          "channel": null
        }
      ],
      "must": [
        {
          "message": "购买旅行保险，需覆盖高海拔活动",
          "tasks": [
            "选择覆盖高风险活动的保险"
          ],
          "deadline": null,
          "channel": null
        }
      ],
      "should": [
        {
          "message": "准备适合高海拔的装备",
          "tasks": [
            "准备保暖衣物"
          ],
          "deadline": null,
          "channel": null
        }
      ],
      "optional": [
        {
          "message": "学习基本的新西兰英语短语",
          "tasks": [],
          "deadline": null,
          "channel": null
        }
      ]
    },
    "summary": {
      "totalBlockers": 1,
      "totalMust": 3,
      "totalShould": 5,
      "totalOptional": 2
    }
  },
  "error": null
}
```

---

### 6. 行程潜在风险预警

> ⚠️ **已更新**: 本接口已增强，请参考 [11. 风险预警（增强版）](#11-风险预警增强版) 获取完整功能。

提前知晓行程中的潜在风险，提供应对措施和救援信息。

**接口**: `GET /readiness/risk-warnings`

**查询参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| tripId | string | 是 | 行程ID |
| lang | string | 否 | 语言（`en` 或 `zh`，默认 `en`） |
| userId | string | 否 | 用户ID（可选，用于个性化） |
| includeCapabilityPackHazards | boolean | 否 | 是否包含能力包风险（默认 `false`） |

**请求示例**:

```http
GET /readiness/risk-warnings?tripId=trip-123&lang=zh
```

**响应示例**（增强版）:

```json
{
  "success": true,
  "data": {
    "tripId": "trip-123",
    "risks": [
      {
        "id": "risk-1",
        "type": "WEATHER",
        "typeLabel": "天气风险",
        "typeLabelEn": "Weather Risk",
        "typeIcon": "🌨️",
        "category": "weather",
        "severity": "medium",
        "severityLabel": "中",
        "severityLabelEn": "Medium",
        "message": "天气相关风险，如极端天气、暴风雪等",
        "description": "天气相关风险，如极端天气、暴风雪等",
        "impact": "可能影响行程执行",
        "mitigation": [],
        "mitigationDetails": [],
        "affectedPois": [],
        "sourceType": "readiness",
        "originalSeverity": "medium",
        "emergencyContacts": []
      }
    ],
    "risksByCategory": {
      "weather": [...],
      "terrain": [...],
      "safety": [],
      "logistics": [],
      "other": []
    },
    "summary": {
      "totalRisks": 2,
      "highSeverity": 1,
      "mediumSeverity": 1,
      "lowSeverity": 0,
      "byCategory": {
        "weather": 1,
        "terrain": 0,
        "safety": 0,
        "logistics": 0,
        "other": 1
      }
    },
    "aiEnhanced": false
  },
  "error": null
}
```

> 📖 **注意**: 响应格式已增强，包含更多字段。详细说明请参考 [11. 风险预警（增强版）](#11-风险预警增强版)。

---

## 使用示例

### 示例 1: 基本准备度检查

```bash
curl -X POST http://localhost:3000/readiness/check \
  -H "Content-Type: application/json" \
  -d '{
    "destinationId": "NZ",
    "traveler": {
      "nationality": "CN",
      "budgetLevel": "medium"
    },
    "itinerary": {
      "countries": ["NZ"],
      "activities": ["hiking"]
    }
  }'
```

### 示例 2: 带地理位置的准备度检查

```bash
curl -X POST http://localhost:3000/readiness/check \
  -H "Content-Type: application/json" \
  -d '{
    "destinationId": "NZ",
    "traveler": {
      "nationality": "CN"
    },
    "itinerary": {
      "countries": ["NZ"]
    },
    "geo": {
      "lat": -43.5321,
      "lng": 172.6362,
      "enhanceWithGeo": true
    }
  }'
```

### 示例 3: 根据行程ID检查准备度（推荐）

```bash
curl "http://localhost:3000/readiness/trip/d125c30f-44ab-4a9e-9970-b899fccdc3d8"
```

### 示例 4: 评估能力包

```bash
curl -X POST http://localhost:3000/readiness/capability-packs/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "destinationId": "NZ",
    "itinerary": {
      "countries": ["NZ"],
      "activities": ["hiking"]
    }
  }'
```

### 示例 5: 获取个性化清单

```bash
curl "http://localhost:3000/readiness/personalized-checklist?tripId=trip-123"
```

### 示例 6: 获取风险预警

```bash
curl "http://localhost:3000/readiness/risk-warnings?tripId=trip-123"
```

---

## 准备度分类

准备度检查结果按以下分类组织：

1. **Entry & Transit（入境与过境）**
   - 签证/免签/电子签
   - 入境材料
   - 过境要求

2. **Safety & Hazards（安全与风险）**
   - 野生动物
   - 治安
   - 极端天气
   - 地形风险

3. **Health & Insurance（医疗与保险）**
   - 医疗水平
   - 必须覆盖的保险项目
   - 疫苗接种要求

4. **Gear & Packing（装备与穿搭）**
   - 气候相关装备
   - 活动相关装备
   - 城市基础设施要求

5. **Activities & Bookings（活动与预订）**
   - 需要提前预订的项目
   - 运营商合规要求
   - 许可要求

6. **Logistics（物流与后勤）**
   - 到达方式
   - 货币/网络/电源/通讯
   - 预算区间

---

## 能力包类型

系统支持以下能力包：

1. **high-altitude（高海拔适应包）**
   - 适用于海拔3000米以上的目的地
   - 检查高原反应风险
   - 提供适应建议

2. **sparse-supply（物资稀缺包）**
   - 适用于物资供应稀缺的地区
   - 检查物资准备情况
   - 提供采购建议

3. **seasonal-road（季节性道路包）**
   - 适用于有季节性封路的目的地
   - 检查道路开放情况
   - 提供替代路线建议

4. **permit-checkpoint（许可检查点包）**
   - 适用于需要许可或检查点的目的地
   - 检查许可要求
   - 提供申请流程

5. **emergency（紧急救援包）**
   - 适用于偏远或高风险地区
   - 检查救援资源
   - 提供应急联系方式

---

## 注意事项

1. **目的地ID**: `destinationId` 可以是国家代码（如 "NZ"）或城市ID，系统会自动识别。

2. **地理位置增强**: 当提供 `geo.lat` 和 `geo.lng` 时，系统会使用地理位置信息增强检查结果，提供更精确的建议。

3. **能力包评估**: 能力包评估是自动的，系统会根据行程信息自动判断哪些能力包应该被触发。

4. **风险等级**: 风险等级分为 `high`、`medium`、`low` 三个级别。

5. **准备度优先级**: 
   - **blocker**: 阻塞项，必须解决才能继续
   - **must**: 必须项，强烈建议完成
   - **should**: 建议项，建议完成
   - **optional**: 可选项，可选完成

---

## 相关接口

- [路线方向 API](../route-directions/README.md) - 路线方向相关接口
- [行程规划 API](../trips/README.md) - 行程规划相关接口
- [决策层 API](../decision/QUICK_REFERENCE.md) - 决策层相关接口

---

## 接口对比

### 核心接口

| 接口 | 方法 | 用途 | 适用场景 |
|------|------|------|----------|
| `POST /readiness/check` | POST | 手动传入参数检查准备度 | 行程创建前，用户输入目的地和计划 |
| `GET /readiness/trip/:id` | GET | 根据行程ID自动检查准备度 | **行程创建后，快速查看准备度（推荐）** |
| `GET /readiness/personalized-checklist` | GET | 获取个性化清单（格式化） | 显示格式化的准备清单 |
| `GET /readiness/risk-warnings` | GET | 获取风险预警 | 显示风险信息 |
| `GET /readiness/capability-packs` | GET | 获取能力包列表 | 了解可用的能力包 |
| `POST /readiness/capability-packs/evaluate` | POST | 评估能力包 | 判断哪些能力包适用 |

### 能力包清单同步接口（P0）

| 接口 | 方法 | 用途 |
|------|------|------|
| `POST /readiness/trip/:tripId/checklist/add-from-capability-pack` | POST | 添加能力包规则到清单 |
| `GET /readiness/trip/:tripId/checklist/capability-pack-items` | GET | 获取能力包清单项 |
| `PUT /readiness/trip/:tripId/checklist/capability-pack-items/:itemId/status` | PUT | 更新清单项状态 |
| `DELETE /readiness/trip/:tripId/checklist/capability-pack-items/:itemId` | DELETE | 删除清单项 |

**推荐使用 `GET /readiness/trip/:id`**，因为：
- 无需手动传入参数，自动从行程中提取信息
- 前端调用简单，只需传入行程ID
- 信息更准确，基于实际行程数据

---

---

## POI 分类枚举

### PlaceCategory（一级分类）

数据库 `Place.category` 字段存储的高级分类：

| 枚举值 | 说明 |
|--------|------|
| `ATTRACTION` | 景点（自然/人文） |
| `RESTAURANT` | 餐饮 |
| `SHOPPING` | 购物/补给 |
| `HOTEL` | 住宿 |
| `TRANSIT_HUB` | 交通/服务设施 |
| `HOSPITAL` | 医疗/安全设施 |

### CanonicalType（详细分类）

存储在 `Place.metadata.canonicalType` 中的详细类型：

#### 自然景观

| CanonicalType | 中文名 | 说明 |
|---------------|--------|------|
| `ATTRACTION_NATURE_WATERFALL` | 瀑布 | 如黄金瀑布、塞里雅兰瀑布 |
| `ATTRACTION_NATURE_GLACIER` | 冰川 | 如瓦特纳冰川 |
| `ATTRACTION_NATURE_GLACIER_LAGOON` | 冰川湖 | 如杰古沙龙冰河湖 |
| `ATTRACTION_NATURE_VOLCANO` | 火山 | 如斯奈菲尔火山 |
| `ATTRACTION_NATURE_GEOTHERMAL` | 地热区 | 如米湖地热区 |
| `ATTRACTION_NATURE_GEYSER` | 间歇泉 | 如盖歇尔间歇泉 |
| `ATTRACTION_NATURE_HOT_SPRING` | 温泉 | 天然温泉 |
| `ATTRACTION_NATURE_BEACH` | 海滩 | 普通海滩 |
| `ATTRACTION_NATURE_BLACK_BEACH` | 黑沙滩 | 如雷尼斯黑沙滩 |
| `ATTRACTION_NATURE_CANYON` | 峡谷 | 如大裂谷 |
| `ATTRACTION_NATURE_CAVE` | 洞穴 | 熔岩洞等 |
| `ATTRACTION_NATURE_FJORD` | 峡湾 | 冰岛峡湾 |
| `ATTRACTION_NATURE_HIGHLAND` | 高地 | 内陆高地 |
| `ATTRACTION_NATURE_BIRD_CLIFF` | 鸟崖 | 海鹦栖息地 |
| `NATIONAL_PARK` | 国家公园 | 如辛格维利尔国家公园 |
| `NATURE_RESERVE` | 自然保护区 | 保护区域 |
| `VIEWPOINT` | 观景台 | 如迪霍拉里海岬 |
| `AURORA_VIEWING` | 极光观测点 | 极光观测地点 |

#### 人文景观

| CanonicalType | 中文名 | 说明 |
|---------------|--------|------|
| `MUSEUM` | 博物馆 | 博物馆、展览馆 |
| `CHURCH` | 教堂 | 如哈尔格林姆斯教堂 |
| `LIGHTHOUSE` | 灯塔 | 海岸灯塔 |
| `HISTORICAL_SITE` | 历史遗迹 | 历史遗址 |

#### 补给设施

| CanonicalType | 中文名 | 说明 |
|---------------|--------|------|
| `FUEL_STATION` | 加油站 | 通用加油站 |
| `FUEL_N1` | N1 加油站 | 冰岛 N1 品牌 |
| `FUEL_ORKAN` | Orkan 加油站 | Orkan 品牌 |
| `FUEL_OB` | ÓB 加油站 | ÓB 品牌 |
| `EV_CHARGING` | 电动车充电站 | 电车充电点 |
| `SUPERMARKET` | 超市 | 通用超市 |
| `SUPERMARKET_BONUS` | Bonus 超市 | 冰岛平价超市 |
| `SUPERMARKET_KRONAN` | Krónan 超市 | 冰岛连锁超市 |
| `CONVENIENCE_STORE` | 便利店 | 便利店 |

#### 住宿设施

| CanonicalType | 中文名 | 说明 |
|---------------|--------|------|
| `HOTEL` | 酒店 | 酒店 |
| `GUESTHOUSE` | 民宿 | 宾馆/民宿 |
| `HOSTEL` | 青年旅舍 | 背包客旅馆 |
| `CAMPING` | 营地 | 露营地 |
| `CABIN` | 小木屋 | 独立小屋 |
| `FARM_STAY` | 农场住宿 | 农家乐 |

#### 安全设施

| CanonicalType | 中文名 | 说明 |
|---------------|--------|------|
| `HOSPITAL` | 医院 | 综合医院 |
| `CLINIC` | 诊所 | 诊所/健康中心 |
| `PHARMACY` | 药房 | 药店 |
| `POLICE` | 警察局 | 警局 |
| `RESCUE_HUT` | 救援小屋 | 紧急避难点 |

#### 服务设施

| CanonicalType | 中文名 | 说明 |
|---------------|--------|------|
| `INFORMATION_CENTER` | 游客中心 | 旅游信息中心 |
| `CAR_RENTAL` | 租车点 | 租车公司 |
| `PARKING` | 停车场 | 停车区域 |
| `TOILETS` | 公共厕所 | 卫生间 |
| `WIFI_HOTSPOT` | WiFi 热点 | 免费 WiFi |

#### 活动体验

| CanonicalType | 中文名 | 说明 |
|---------------|--------|------|
| `TRAILHEAD` | 徒步起点 | 徒步路线入口 |
| `SPA_POOL` | 温泉泳池 | 如蓝湖温泉 |
| `WHALE_WATCHING` | 观鲸点 | 如胡萨维克 |
| `GLACIER_WALK` | 冰川徒步 | 冰川行走活动点 |
| `ICE_CAVE` | 冰洞探险 | 冰洞游览 |
| `NORTHERN_LIGHTS_TOUR` | 极光团 | 极光旅游 |

---

## 新增接口（P0/P1/P2）

### 7. 添加能力包规则到准备清单

将能力包的规则同步到个人准备清单。

**接口**: `POST /readiness/trip/:tripId/checklist/add-from-capability-pack`

**请求体**:

```typescript
interface AddFromCapabilityPackRequest {
  packType: string;           // 能力包类型
  rules: Array<{
    id: string;               // 规则ID
    level: 'blocker' | 'must' | 'should' | 'optional';
    message: string;          // 规则消息
    category?: string;        // 分类
    tasks?: string[];         // 关联任务
  }>;
}
```

**请求示例**:

```json
{
  "packType": "seasonal-road",
  "rules": [
    {
      "id": "sr-001",
      "level": "must",
      "message": "检查 F 路开放状态",
      "tasks": ["访问 road.is 查看最新路况"]
    },
    {
      "id": "sr-002",
      "level": "should",
      "message": "准备备用路线",
      "tasks": ["下载离线地图", "标记替代路线"]
    }
  ]
}
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "addedCount": 2,
    "items": [
      {
        "id": "uuid-1",
        "ruleId": "sr-001",
        "message": "检查 F 路开放状态",
        "level": "must",
        "sourcePackType": "seasonal-road",
        "checked": false
      },
      {
        "id": "uuid-2",
        "ruleId": "sr-002",
        "message": "准备备用路线",
        "level": "should",
        "sourcePackType": "seasonal-road",
        "checked": false
      }
    ]
  }
}
```

---

### 8. 获取能力包清单项

获取行程中来自能力包的准备清单项。

**接口**: `GET /readiness/trip/:tripId/checklist/capability-pack-items`

**查询参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| packType | string | 否 | 筛选特定能力包类型 |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid-1",
        "ruleId": "sr-001",
        "message": "检查 F 路开放状态",
        "level": "must",
        "sourcePackType": "seasonal-road",
        "checked": false,
        "tasks": ["访问 road.is 查看最新路况"]
      }
    ],
    "summary": {
      "total": 5,
      "checked": 2,
      "unchecked": 3
    }
  }
}
```

---

### 9. 更新清单项状态

更新能力包清单项的完成状态。

**接口**: `PUT /readiness/trip/:tripId/checklist/capability-pack-items/:itemId/status`

**请求体**:

```json
{
  "checked": true
}
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "id": "uuid-1",
    "checked": true,
    "updatedAt": "2025-01-27T10:00:00Z"
  }
}
```

---

### 10. 删除清单项

从准备清单中移除能力包规则项。

**接口**: `DELETE /readiness/trip/:tripId/checklist/capability-pack-items/:itemId`

**响应示例**:

```json
{
  "success": true,
  "data": {
    "deleted": true,
    "itemId": "uuid-1"
  }
}
```

---

### 11. 风险预警（增强版）

获取行程潜在风险，支持包含能力包危害信息。

**接口**: `GET /readiness/risk-warnings`

**新增查询参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| tripId | string | 是 | 行程ID |
| includeCapabilityPackHazards | boolean | 否 | 是否包含能力包危害（默认 false） |

**请求示例**:

```http
GET /readiness/risk-warnings?tripId=trip-123&includeCapabilityPackHazards=true
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "tripId": "trip-123",
    "risks": [
      {
        "id": "risk-1",
        "type": "weather_extreme",
        "typeLabel": "极端天气",
        "typeLabelEn": "Extreme Weather",
        "typeIcon": "🌨️",
        "category": "weather",
        "severity": "high",
        "severityLabel": "高",
        "severityLabelEn": "High",
        "message": "冬季可能出现极端天气，道路可能封闭",
        "description": "冬季可能出现极端天气，道路可能封闭",
        "impact": "影响 2 个POI",
        "mitigation": [
          "关注天气预报",
          "准备应急装备",
          "准备备用路线"
        ],
        "mitigationDetails": [
          {
            "action": "关注天气预报",
            "priority": "high"
          },
          {
            "action": "准备应急装备",
            "priority": "medium"
          },
          {
            "action": "准备备用路线",
            "priority": "low"
          }
        ],
        "affectedPois": [
          {
            "id": "123",
            "name": "Thingvellir National Park",
            "nameCN": "辛格维利尔国家公园",
            "day": 1
          },
          {
            "id": "456",
            "name": "Golden Circle",
            "nameCN": "黄金圈",
            "day": 1
          }
        ],
        "sourceType": "readiness",
        "sourcePackType": null,
        "originalSeverity": "high",
        "emergencyContacts": [],
        "sources": [
          {
            "sourceId": "src.safetravel.is",
            "authority": "SafeTravel Iceland",
            "type": "html",
            "title": "冰岛旅行安全信息",
            "canonicalUrl": "https://www.safetravel.is/"
          },
          {
            "sourceId": "src.vedur.is",
            "authority": "Icelandic Meteorological Office",
            "type": "html",
            "title": "天气预报和预警",
            "canonicalUrl": "https://www.vedur.is/"
          }
        ]
      },
      {
        "id": "risk-2",
        "type": "terrain",
        "typeLabel": "地形风险",
        "typeLabelEn": "Terrain Risk",
        "typeIcon": "⛰️",
        "category": "terrain",
        "severity": "medium",
        "severityLabel": "中",
        "severityLabelEn": "Medium",
        "message": "F 路可能因天气关闭",
        "description": "F 路可能因天气关闭",
        "impact": "影响 1 个POI",
        "mitigation": [
          "提前查询路况",
          "准备备用路线"
        ],
        "mitigationDetails": [
          {
            "action": "提前查询路况",
            "priority": "high"
          },
          {
            "action": "准备备用路线",
            "priority": "medium"
          }
        ],
        "affectedPois": [
          {
            "id": "789",
            "name": "Landmannalaugar",
            "nameCN": "兰德曼纳劳卡",
            "day": 2
          }
        ],
        "sourceType": "capability_pack",
        "sourcePackType": "seasonal-road",
        "originalSeverity": "medium",
        "emergencyContacts": []
      }
    ],
    "risksByCategory": {
      "weather": [
        {
          "id": "risk-1",
          "type": "weather_extreme",
          "typeLabel": "极端天气",
          "severity": "high",
          "message": "冬季可能出现极端天气，道路可能封闭"
        }
      ],
      "terrain": [
        {
          "id": "risk-2",
          "type": "terrain",
          "typeLabel": "地形风险",
          "severity": "medium",
          "message": "F 路可能因天气关闭"
        }
      ],
      "safety": [],
      "logistics": [],
      "other": []
    },
    "summary": {
      "totalRisks": 2,
      "highSeverity": 1,
      "mediumSeverity": 1,
      "lowSeverity": 0,
      "byCategory": {
        "weather": 1,
        "terrain": 1,
        "safety": 0,
        "logistics": 0,
        "other": 0
      }
    },
    "aiEnhanced": false,
    "packSources": [
      {
        "sourceId": "src.safetravel.is",
        "authority": "SafeTravel Iceland",
        "type": "html",
        "title": "冰岛旅行安全信息",
        "canonicalUrl": "https://www.safetravel.is/"
      },
      {
        "sourceId": "src.vedur.is",
        "authority": "Icelandic Meteorological Office",
        "type": "html",
        "title": "天气预报和预警",
        "canonicalUrl": "https://www.vedur.is/"
      }
    ]
  }
}
```

**响应字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `risks` | Array | 风险列表（增强版） |
| `risks[].id` | string | 风险ID |
| `risks[].type` | string | 风险类型（技术标识，如 `weather_extreme`） |
| `risks[].typeLabel` | string | 🆕 风险类型中文显示名称（如 `极端天气`） |
| `risks[].typeLabelEn` | string | 🆕 风险类型英文显示名称 |
| `risks[].typeIcon` | string | 🆕 风险类型图标（emoji） |
| `risks[].category` | string | 🆕 风险分类（`weather`/`terrain`/`safety`/`logistics`/`other`） |
| `risks[].severity` | string | 严重程度（`high`/`medium`/`low`） |
| `risks[].severityLabel` | string | 🆕 严重程度中文显示（`高`/`中`/`低`） |
| `risks[].severityLabelEn` | string | 🆕 严重程度英文显示 |
| `risks[].message` | string | 风险描述 |
| `risks[].description` | string | 🆕 详细说明（当前与message相同） |
| `risks[].impact` | string | 🆕 影响说明 |
| `risks[].mitigation` | string[] | 缓解建议列表 |
| `risks[].mitigationDetails` | Array | 🆕 详细缓解建议（包含优先级） |
| `risks[].affectedPois` | Array | 🆕 影响的POI列表（包含名称、天数） |
| `risks[].affectedPois[].id` | string | POI ID |
| `risks[].affectedPois[].name` | string | POI名称（英文） |
| `risks[].affectedPois[].nameCN` | string | POI名称（中文） |
| `risks[].affectedPois[].day` | number | 影响的天数（1-based） |
| `risks[].sourceType` | string | 来源类型：`readiness` 或 `capability_pack` |
| `risks[].sourcePackType` | string | 能力包类型（仅当 sourceType 为 capability_pack 时） |
| `risks[].originalSeverity` | string | 原始严重程度（AI增强前） |
| `risks[].emergencyContacts` | Array | 紧急联系方式 |
| `risks[].sources` | Array | 🆕 官方来源列表（可选） |
| `risks[].sources[].sourceId` | string | 来源ID |
| `risks[].sources[].authority` | string | 官方机构名称（如 "SafeTravel Iceland"） |
| `risks[].sources[].type` | string | 来源类型（`html`/`pdf`/`api`/`regulation`/`manual`） |
| `risks[].sources[].title` | string | 来源标题（多语言） |
| `risks[].sources[].canonicalUrl` | string | 官方链接 |
| `risksByCategory` | Object | 🆕 按分类分组的风险 |
| `packSources` | Array | 🆕 Pack 级别的官方来源（所有风险共享） |
| `packSources[].sourceId` | string | 来源ID |
| `packSources[].authority` | string | 官方机构名称 |
| `packSources[].type` | string | 来源类型 |
| `packSources[].title` | string | 来源标题 |
| `packSources[].canonicalUrl` | string | 官方链接 |
| `summary.byCategory` | Object | 🆕 按分类统计的风险数量 |
| `aiEnhanced` | boolean | 是否启用AI增强 |

---

### 12. 能力包评估（增强版）

评估能力包，支持自动增强地理信息。

**接口**: `POST /readiness/capability-packs/evaluate`

**新增查询参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| autoEnhanceGeo | boolean | 否 | 自动获取目的地 geo 特征（默认 false） |

**请求示例**:

```http
POST /readiness/capability-packs/evaluate?autoEnhanceGeo=true
Content-Type: application/json

{
  "destinationId": "IS",
  "itinerary": {
    "countries": ["IS"],
    "activities": ["glacier_walking", "self_drive"],
    "routeLength": 1200
  }
}
```

**增强响应示例**:

```json
{
  "success": true,
  "data": {
    "total": 5,
    "triggered": 3,
    "geoEnhanced": true,
    "results": [
      {
        "pack": {
          "type": "seasonal-road",
          "displayName": "季节性道路包"
        },
        "triggered": true,
        "triggerReason": "检测到冰岛高地区域，F 路可能因季节关闭"
      },
      {
        "pack": {
          "type": "sparse-supply",
          "displayName": "物资稀缺包"
        },
        "triggered": true,
        "triggerReason": "路线长度 1200km 且补给点密度较低"
      },
      {
        "pack": {
          "type": "emergency",
          "displayName": "紧急救援包"
        },
        "triggered": true,
        "triggerReason": "检测到偏远区域，最近医院距离超过 50km"
      }
    ],
    "context": {
      "geo": {
        "hasMountainPass": true,
        "supplyDensity": "low"
      }
    }
  }
}
```

**新增响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `geoEnhanced` | boolean | 是否使用了地理增强 |
| `triggerReason` | string | 触发原因的详细描述 |
| `context` | object | 用于调试的上下文信息 |

---

### 13. 行程覆盖地图数据

获取行程的地图覆盖数据，用于前端渲染覆盖地图。

**接口**: `GET /readiness/trip/:tripId/coverage-map`

**请求参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| tripId | string | 是 | 行程 ID |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "tripId": "ed69d9c5-660f-4549-bf03-85654e972403",
    "bounds": {
      "northeast": { "lat": 64.9631, "lng": -13.4909 },
      "southwest": { "lat": 63.4194, "lng": -22.7267 }
    },
    "center": { "lat": 64.1466, "lng": -18.1088 },
    "zoom": 6,
    
    "pois": [
      {
        "id": "poi-1",
        "day": 1,
        "order": 1,
        "name": "雷克雅未克",
        "type": "city",
        "coordinates": { "lat": 64.1466, "lng": -21.9426 },
        "coverageStatus": "covered",
        "evidenceCount": 3,
        "evidenceTypes": ["opening_hours", "weather"]
      },
      {
        "id": "poi-2",
        "day": 2,
        "order": 1,
        "name": "斯卡夫塔山国家公园",
        "type": "attraction",
        "coordinates": { "lat": 64.0167, "lng": -16.9667 },
        "coverageStatus": "partial",
        "evidenceCount": 1,
        "evidenceTypes": ["other"],
        "missingEvidence": ["road_closure", "weather"]
      },
      {
        "id": "poi-3",
        "day": 3,
        "order": 1,
        "name": "杰古沙龙冰河湖",
        "type": "attraction",
        "coordinates": { "lat": 64.0784, "lng": -16.2306 },
        "coverageStatus": "uncovered",
        "evidenceCount": 0,
        "missingEvidence": ["opening_hours", "weather", "road_closure"]
      }
    ],
    
    "segments": [
      {
        "id": "seg-1",
        "fromPoiId": "poi-1",
        "toPoiId": "poi-2",
        "day": 1,
        "distance": 327,
        "duration": 240,
        "routeType": "driving",
        "coverageStatus": "covered",
        "polyline": "encoded_polyline_string_here",
        "hazards": []
      },
      {
        "id": "seg-2",
        "fromPoiId": "poi-2",
        "toPoiId": "poi-3",
        "day": 2,
        "distance": 58,
        "duration": 50,
        "routeType": "driving",
        "coverageStatus": "warning",
        "polyline": "encoded_polyline_string_here",
        "hazards": [
          {
            "type": "road_closure",
            "severity": "high",
            "message": "冬季山口可能封闭"
          }
        ]
      }
    ],
    
    "gaps": [
      {
        "id": "gap-1",
        "type": "poi",
        "relatedId": "poi-3",
        "coordinates": { "lat": 64.0784, "lng": -16.2306 },
        "severity": "medium",
        "message": "杰古沙龙冰河湖缺少证据覆盖",
        "missingEvidence": ["opening_hours", "weather"]
      },
      {
        "id": "gap-2",
        "type": "segment",
        "relatedId": "seg-2",
        "coordinates": { "lat": 64.0475, "lng": -16.5986 },
        "severity": "high",
        "message": "路段存在道路封闭风险",
        "hazards": ["road_closure"]
      }
    ],
    
    "summary": {
      "totalPois": 3,
      "coveredPois": 1,
      "partialPois": 1,
      "uncoveredPois": 1,
      "totalSegments": 2,
      "coveredSegments": 1,
      "warningSegments": 1,
      "blockedSegments": 0,
      "totalGaps": 2,
      "coverageRate": 0.67
    }
  }
}
```

**字段说明**:

**POI 覆盖状态 (coverageStatus)**:

| 值 | 说明 | 地图显示 |
|------|------|------|
| `covered` | 有充分证据 | 绿色标记 |
| `partial` | 部分证据 | 黄色标记 |
| `uncovered` | 无证据 | 红色标记 |

**路段覆盖状态**:

| 值 | 说明 | 地图显示 |
|------|------|------|
| `covered` | 无风险 | 绿色实线 |
| `warning` | 有潜在风险 | 橙色虚线 |
| `blocked` | 阻塞/不可通行 | 红色虚线 |

**证据类型 (evidenceTypes)**:

| 值 | 说明 |
|------|------|
| `opening_hours` | 营业时间信息 |
| `weather` | 天气信息 |
| `road_closure` | 道路封闭信息 |
| `booking_confirmation` | 预订确认 |
| `permit` | 许可证 |
| `other` | 其他 |

**路线编码 (polyline)**:

使用 Google Encoded Polyline 格式，兼容 Mapbox。前端可使用 `@mapbox/polyline` 或 `google-polyline` 库解码。

---

### 14. 阻塞项修复选项

获取准备度检查阻塞项的可用修复选项。

**接口**: `POST /readiness/repair-options`

**请求体**:

```json
{
  "tripId": "ed69d9c5-660f-4549-bf03-85654e972403",
  "blockerId": "finding-1"
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| tripId | string | 是 | 行程 ID |
| blockerId | string | 是 | 阻塞项 ID（从准备度检查结果中获取） |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "blockerId": "finding-1",
    "blockerMessage": "斯卡夫塔山国家公园缺少证据覆盖",
    "options": [
      {
        "id": "option-1",
        "title": "查询天气预报",
        "description": "获取该地点的天气信息，了解天气状况",
        "impact": "medium",
        "timeEstimate": "2分钟",
        "actionType": "fetch_weather"
      },
      {
        "id": "option-2",
        "title": "查询道路状况",
        "description": "检查前往该地点的道路是否开放",
        "impact": "high",
        "timeEstimate": "5分钟",
        "actionType": "check_road"
      },
      {
        "id": "option-3",
        "title": "手动标记已确认",
        "description": "如果您已自行确认相关信息，可以手动标记",
        "impact": "low",
        "timeEstimate": "1分钟",
        "actionType": "manual_confirm"
      }
    ]
  }
}
```

**修复选项字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 选项唯一标识 |
| `title` | string | 选项标题 |
| `description` | string | 选项描述 |
| `cost` | number | 预估费用（可选） |
| `impact` | string | 影响程度: `high`, `medium`, `low` |
| `timeEstimate` | string | 预估耗时 |
| `actionType` | string | 操作类型，用于前端触发对应操作 |

**操作类型 (actionType)**:

| 值 | 说明 |
|------|------|
| `fetch_weather` | 查询天气预报 |
| `check_road` | 查询道路状况 |
| `check_hours` | 确认营业时间 |
| `manual_confirm` | 手动标记已确认 |
| `reorder_pois` | 调整行程顺序 |
| `move_to_day` | 移动到其他天 |
| `remove_pois` | 减少景点数量 |
| `book_transport` | 预订交通 |
| `change_hotel` | 更换酒店 |
| `buy_insurance` | 购买旅行保险 |

---

### 15. 行程准备度分数

获取行程的准备度分数分解，包含多维度评分。

**接口**: `GET /readiness/trip/:tripId/score`

**请求参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| tripId | string | 是 | 行程 ID |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "tripId": "ed69d9c5-660f-4549-bf03-85654e972403",
    "score": {
      "overall": 78,
      "evidenceCoverage": 45,
      "scheduleFeasibility": 85,
      "transportCertainty": 70,
      "safetyRisk": 90,
      "buffers": 65
    },
    "findings": [
      {
        "id": "finding-1",
        "type": "warning",
        "category": "evidence",
        "message": "斯卡夫塔山国家公园缺少证据覆盖",
        "severity": "medium",
        "affectedDays": [1],
        "actionRequired": "补充: weather, road_closure"
      }
    ],
    "risks": [
      {
        "id": "risk-1",
        "type": "road_closure",
        "severity": "high",
        "message": "冬季山口可能封闭",
        "mitigation": ["查询路况", "准备备用路线"],
        "affectedPois": ["poi-1", "poi-2"]
      }
    ],
    "summary": {
      "totalFindings": 3,
      "blockers": 0,
      "must": 2,
      "should": 1,
      "warnings": 2,
      "suggestions": 1,
      "highRisks": 1,
      "mediumRisks": 1,
      "lowRisks": 0
    },
    "calculatedAt": "2026-01-27T06:00:00.000Z"
  }
}
```

**分数字段说明**:

| 字段 | 说明 | 计算依据 |
|------|------|------|
| `overall` | 总体准备度分数 (0-100) | 各维度加权平均 |
| `evidenceCoverage` | 证据覆盖率 (0-100) | POI 证据数量、覆盖状态 |
| `scheduleFeasibility` | 时间可行性 (0-100) | 每日 POI 数量、行驶时间 |
| `transportCertainty` | 交通确定性 (0-100) | 路段状态、道路风险 |
| `safetyRisk` | 安全风险分数 (0-100) | 越高越安全，基于覆盖缺口和风险 |
| `buffers` | 缓冲时间分数 (0-100) | POI 密度、总行驶时间 |

**Finding 类型**:

| 值 | 说明 | 状态级别 |
|------|------|----------|
| `blocker` | 阻塞项，必须解决 | blocker |
| `must` | 必须项，强烈建议完成 | must |
| `should` | 建议项，可选优化 | should |
| `warning` | ⚠️ 已废弃，使用 `must` 替代 | must |
| `suggestion` | ⚠️ 已废弃，使用 `should` 替代 | should |

**🆕 字段统一规范（v1.7.0）**:
- `summary.must` - 必须项数量（对应 `must` 状态）
- `summary.should` - 建议项数量（对应 `should` 状态）
- `summary.warnings` - ⚠️ 已废弃，值等于 `must`（向后兼容保留）
- `summary.suggestions` - ⚠️ 已废弃，值等于 `should`（向后兼容保留）

---

## 更新日志

- **2026-01-29**: 
  - **🆕 v1.8.0：风险预警接口大幅增强**
    - **新增字段**：
      - `typeLabel` / `typeLabelEn`：风险类型中文/英文标签（如"天气风险"/"Weather Risk"）
      - `category`：风险分类（weather/terrain/safety/logistics/other）
      - `typeIcon`：风险类型图标（emoji，如🌨️⛰️🌊）
      - `severityLabel` / `severityLabelEn`：严重程度中文/英文标签（如"高"/"High"）
      - `description`：详细说明（当summary为空时使用typeDescription）
      - `impact`：影响说明
      - `mitigationDetails`：详细缓解建议（包含优先级）
      - `affectedPois`：影响的POI信息（包含名称、天数）
      - `risksByCategory`：按分类分组的风险
      - `summary.byCategory`：按分类统计的风险数量
    - **功能增强**：
      - 支持大小写不敏感的风险类型匹配（兼容 WEATHER/TERRAIN 等大写类型）
      - 修复风险描述为空的问题（使用typeDescription作为默认描述）
      - 自动查询行程POI信息以增强affectedPois字段
      - 添加错误处理，确保POI查询失败不影响主流程
    - **向后兼容**：保留所有原有字段，新增字段不影响现有客户端
  - **🆕 v1.7.0：字段统一规范**
    - 统一字段命名：`warnings` → `must`，`suggestions` → `should`
    - `ReadinessScoreResponse.summary` 新增 `must` 和 `should` 字段
    - `ReadinessSummaryDto` 新增 `must` 和 `should` 字段
    - `ReadinessScoreFinding.type` 支持 `must` 和 `should` 类型
    - 保持向后兼容：保留 `warnings` 和 `suggestions` 字段（标记为废弃）
    - 更新相关服务代码使用新字段名
  - **P0修复：判断逻辑优化**
    - 新增 `disclaimer` 字段到 `ReadinessCheckResult`，包含免责声明和责任边界
    - 新增 `constraintType` 字段到 `ReadinessConstraint`，用于区分blocker和must
    - 更新数据模型：完善 `ReadinessFinding` 和 `ReadinessFindingItem` 接口定义
    - 所有检查接口（`POST /readiness/check`、`GET /readiness/trip/:id`等）现在自动包含免责声明
    - 约束编译结果现在包含 `constraintType` 字段，决策层可以区分：
      - `legal_blocker` / `safety_blocker`：法律/安全硬性要求（blocker级别）
      - `strong_recommendation`：强烈建议（must级别）
      - `recommendation`：建议（should级别）
      - `optional`：可选（optional级别）
  - **文档更新**
    - 添加规则Level业务定义说明（blocker/must/should/optional）
    - 添加约束编译映射规则说明
    - 更新所有响应示例，包含disclaimer字段
    - 更新风险预警接口文档，包含所有新增字段说明
- **2025-01-27**: 
  - 新增 POI 分类枚举文档（IcelandCanonicalType）
  - 新增清单同步接口（P0）：添加/获取/更新/删除能力包规则
  - 增强风险预警接口（P1）：支持 `includeCapabilityPackHazards` 参数
  - 增强能力包评估接口（P2）：支持 `autoEnhanceGeo` 和 `triggerReason`
  - 新增覆盖地图接口：`GET /readiness/trip/:tripId/coverage-map`
  - 新增准备度分数接口：`GET /readiness/trip/:tripId/score`
  - 新增修复选项接口：`POST /readiness/repair-options`
- **2025-01-03**: 新增 `GET /readiness/trip/:id` 接口，支持根据行程ID自动检查准备度
- **2024-01-01**: 初始版本，包含5个核心接口

