# 准备度检查 API 接口文档

## 概述

准备度检查（Readiness Check）系统用于评估旅行者在特定目的地的准备情况，返回必须做/强烈建议/可选的准备清单、风险预警和证据引用。本文档描述了准备度相关的所有 API 接口。

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
    totalShould: number;           // 建议项总数
    totalOptional: number;           // 可选项总数
  };
  risks: Risk[];                      // 风险列表
  constraints: Constraint[];         // 约束列表
}
```

### ReadinessFinding 接口

```typescript
interface ReadinessFinding {
  category: string;                   // 分类（如 'entry', 'safety', 'health'）
  blockers: ReadinessFindingItem[];  // 阻塞项（必须解决）
  must: ReadinessFindingItem[];      // 必须项
  should: ReadinessFindingItem[];    // 建议项
  optional: ReadinessFindingItem[];   // 可选项
  risks: Risk[];                      // 风险列表
}
```

### ReadinessFindingItem 接口

```typescript
interface ReadinessFindingItem {
  message: string;                    // 消息描述
  tasks?: string[];                   // 任务列表
  evidence?: string;                  // 证据引用
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
      "totalOptional": 2
    },
    "risks": [
      {
        "type": "altitude",
        "severity": "medium",
        "summary": "高海拔地区可能出现高原反应"
      }
    ],
    "constraints": [
      {
        "type": "entry",
        "message": "必须持有有效护照和 NZeTA"
      }
    ]
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
      "totalOptional": 0
    },
    "risks": [],
    "constraints": []
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

提前知晓行程中的潜在风险，提供应对措施和救援信息。

**接口**: `GET /readiness/risk-warnings`

**查询参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| tripId | string | 是 | 行程ID |

**请求示例**:

```http
GET /readiness/risk-warnings?tripId=trip-123
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "tripId": "trip-123",
    "risks": [
      {
        "type": "altitude",
        "severity": "medium",
        "message": "高海拔地区可能出现高原反应",
        "mitigation": [
          "逐步适应海拔",
          "准备抗高反药物",
          "避免剧烈运动"
        ],
        "emergencyContacts": []
      },
      {
        "type": "weather",
        "severity": "high",
        "message": "冬季可能出现极端天气",
        "mitigation": [
          "关注天气预报",
          "准备应急装备",
          "制定备用路线"
        ],
        "emergencyContacts": []
      }
    ],
    "summary": {
      "totalRisks": 2,
      "highSeverity": 1,
      "mediumSeverity": 1,
      "lowSeverity": 0
    }
  },
  "error": null
}
```

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

| 接口 | 方法 | 用途 | 适用场景 |
|------|------|------|----------|
| `POST /readiness/check` | POST | 手动传入参数检查准备度 | 行程创建前，用户输入目的地和计划 |
| `GET /readiness/trip/:id` | GET | 根据行程ID自动检查准备度 | **行程创建后，快速查看准备度（推荐）** |
| `GET /readiness/personalized-checklist` | GET | 获取个性化清单（格式化） | 显示格式化的准备清单 |
| `GET /readiness/risk-warnings` | GET | 获取风险预警 | 显示风险信息 |
| `GET /readiness/capability-packs` | GET | 获取能力包列表 | 了解可用的能力包 |
| `POST /readiness/capability-packs/evaluate` | POST | 评估能力包 | 判断哪些能力包适用 |

**推荐使用 `GET /readiness/trip/:id`**，因为：
- 无需手动传入参数，自动从行程中提取信息
- 前端调用简单，只需传入行程ID
- 信息更准确，基于实际行程数据

---

## 更新日志

- **2025-01-03**: 新增 `GET /readiness/trip/:id` 接口，支持根据行程ID自动检查准备度
- **2024-01-01**: 初始版本，包含5个核心接口

