# 用户偏好接口文档

本文档描述了系统中所有与用户偏好相关的 API 接口。

## 目录

1. [用户偏好画像接口](#一用户偏好画像接口)
   - [获取用户偏好画像](#11-获取用户偏好画像)
   - [更新用户偏好画像](#12-更新用户偏好画像)
2. [规划助手偏好接口](#二规划助手偏好接口)
   - [获取用户偏好摘要](#21-获取用户偏好摘要)
   - [清除用户偏好](#22-清除用户偏好)
3. [决策风格偏好接口](#三决策风格偏好接口)
   - [推断用户偏好](#31-推断用户偏好)

---

## 一、用户偏好画像接口

### 1.1 获取用户偏好画像

**端点**: `GET /api/users/profile`

**说明**: 获取当前用户的偏好画像（如喜欢的景点类型、忌口食物、是否偏好小众景点等）。如果用户没有设置过偏好，返回空画像。

**认证**: 需要 JWT Bearer Token

**请求头**:
```
Authorization: Bearer <accessToken>
```

**请求示例**:
```bash
curl -X GET "https://api.example.com/api/users/profile" \
  -H "Authorization: Bearer <accessToken>"
```

**响应示例**（统一响应格式）:
```json
{
  "success": true,
  "data": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "preferences": {
      "preferredAttractionTypes": ["ATTRACTION", "NATURE", "CULTURE"],
      "dietaryRestrictions": ["VEGETARIAN"],
      "preferOffbeatAttractions": true,
      "travelPreferences": {
        "pace": "LEISURE",
        "budget": "MEDIUM",
        "accommodation": "COMFORTABLE"
      },
      "nationality": "CN",
      "residencyCountry": "CN",
      "tags": ["senior", "family_with_children"],
      "other": {
        "accessibility": true,
        "petFriendly": false
      }
    },
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-02T00:00:00.000Z"
  }
}
```

**响应字段**:
| 字段 | 类型 | 说明 |
|------|------|------|
| userId | string | 用户ID |
| preferences | object \| null | 用户偏好配置（如果未设置则为 null） |
| preferences.preferredAttractionTypes | string[] | 喜欢的景点类型（如：ATTRACTION, NATURE, CULTURE） |
| preferences.dietaryRestrictions | string[] | 饮食禁忌（如：VEGETARIAN, NO_PORK, NO_SEAFOOD） |
| preferences.preferOffbeatAttractions | boolean | 是否偏好小众景点 |
| preferences.travelPreferences | object | 出行偏好 |
| preferences.travelPreferences.pace | string | 节奏（LEISURE, MODERATE, FAST） |
| preferences.travelPreferences.budget | string | 预算（LOW, MEDIUM, HIGH） |
| preferences.travelPreferences.accommodation | string | 住宿（BUDGET, COMFORTABLE, LUXURY） |
| preferences.nationality | string | 国籍（ISO 3166-1 alpha-2） |
| preferences.residencyCountry | string | 居住国（ISO 3166-1 alpha-2） |
| preferences.tags | string[] | 旅行者标签（如：senior, family_with_children, solo） |
| preferences.other | object | 其他偏好（JSON格式，可自定义） |
| createdAt | string (ISO 8601) | 创建时间 |
| updatedAt | string (ISO 8601) | 更新时间 |

**注意事项**:
- 如果用户从未设置过偏好，`preferences` 字段可能为 `null` 或空对象
- 所有偏好字段都是可选的

**错误响应**:
- `401 Unauthorized`: 未认证或 token 无效
- `500 Internal Server Error`: 服务器内部错误

---

### 1.2 更新用户偏好画像

**端点**: `PUT /api/users/profile`

**说明**: 更新或创建用户偏好信息。支持部分更新。

**认证**: 需要 JWT Bearer Token

**请求头**:
```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**请求体**:
```json
{
  "preferences": {
    "preferredAttractionTypes": ["ATTRACTION", "NATURE"],
    "dietaryRestrictions": ["VEGETARIAN"],
    "preferOffbeatAttractions": true,
    "travelPreferences": {
      "pace": "MODERATE",
      "budget": "HIGH",
      "accommodation": "LUXURY"
    },
    "nationality": "US",
    "residencyCountry": "US",
    "tags": ["solo", "adventure"],
    "other": {
      "accessibility": false,
      "petFriendly": true
    }
  }
}
```

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| preferences | object | 否 | 用户偏好配置（支持部分更新） |
| preferences.preferredAttractionTypes | string[] | 否 | 喜欢的景点类型 |
| preferences.dietaryRestrictions | string[] | 否 | 饮食禁忌 |
| preferences.preferOffbeatAttractions | boolean | 否 | 是否偏好小众景点 |
| preferences.travelPreferences | object | 否 | 出行偏好 |
| preferences.travelPreferences.pace | string | 否 | 节奏（LEISURE, MODERATE, FAST） |
| preferences.travelPreferences.budget | string | 否 | 预算（LOW, MEDIUM, HIGH） |
| preferences.travelPreferences.accommodation | string | 否 | 住宿（BUDGET, COMFORTABLE, LUXURY） |
| preferences.nationality | string | 否 | 国籍（ISO 3166-1 alpha-2） |
| preferences.residencyCountry | string | 否 | 居住国（ISO 3166-1 alpha-2） |
| preferences.tags | string[] | 否 | 旅行者标签 |
| preferences.other | object | 否 | 其他偏好（JSON格式） |

**请求示例**:
```bash
curl -X PUT "https://api.example.com/api/users/profile" \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "preferences": {
      "preferredAttractionTypes": ["ATTRACTION", "NATURE"],
      "dietaryRestrictions": ["VEGETARIAN"],
      "travelPreferences": {
        "pace": "MODERATE",
        "budget": "HIGH"
      }
    }
  }'
```

**响应示例**: 同 `GET /api/users/profile`

**注意事项**:
- 支持部分更新（只传需要更新的字段）
- 如果用户之前没有偏好设置，会创建新的偏好配置
- `preferences` 对象中的所有字段都是可选的

**错误响应**:
- `400 Bad Request`: 输入数据验证失败
- `401 Unauthorized`: 未认证或 token 无效
- `500 Internal Server Error`: 服务器内部错误

---

## 二、规划助手偏好接口

### 2.1 获取用户偏好摘要

**端点**: `GET /api/agent/planning-assistant/users/:userId/preferences`

**说明**: 获取系统学习到的用户旅行偏好摘要，用于个性化推荐。该接口会返回从用户历史行为中学习到的偏好信息。

**认证**: 当前为公开接口（生产环境建议添加认证）

**路径参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| userId | string | 是 | 用户ID |

**请求示例**:
```bash
curl -X GET "https://api.example.com/api/agent/planning-assistant/users/user-123/preferences"
```

**响应示例**:
```json
{
  "summary": "User prefers moderate-paced travel with medium budget, enjoys nature and cultural attractions, travels solo or with small groups.",
  "summaryCN": "用户偏好中等节奏的旅行，中等预算，喜欢自然和文化景点，通常独自或小团体出行。",
  "topPreferences": [
    {
      "label": "Travel Pace",
      "labelCN": "旅行节奏",
      "value": "MODERATE"
    },
    {
      "label": "Budget Level",
      "labelCN": "预算水平",
      "value": "MEDIUM"
    },
    {
      "label": "Preferred Activities",
      "labelCN": "偏好活动",
      "value": "Nature, Culture"
    }
  ],
  "learnedPreferences": {
    "travelers": {
      "adults": 1
    },
    "budget": {
      "level": "medium"
    },
    "activities": {
      "pacePreference": "moderate"
    },
    "destination": {
      "type": ["nature", "culture"]
    }
  }
}
```

**响应字段**:
| 字段 | 类型 | 说明 |
|------|------|------|
| summary | string | 偏好摘要（英文） |
| summaryCN | string | 偏好摘要（中文） |
| topPreferences | array | 主要偏好列表 |
| topPreferences[].label | string | 偏好标签（英文） |
| topPreferences[].labelCN | string | 偏好标签（中文） |
| topPreferences[].value | string | 偏好值 |
| learnedPreferences | object | 学习到的偏好详情（UserPreferences 格式） |

**注意事项**:
- 如果用户没有历史数据或偏好学习服务不可用，将返回空摘要
- `learnedPreferences` 字段的结构与 `UserPreferences` 接口一致

**错误响应**:
- `500 Internal Server Error`: 服务器内部错误

---

### 2.2 清除用户偏好

**端点**: `POST /api/agent/planning-assistant/users/:userId/preferences/clear`

**说明**: 清除系统学习到的用户旅行偏好。此操作会删除所有从历史行为中学习到的偏好数据。

**认证**: 当前为公开接口（生产环境建议添加认证）

**路径参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| userId | string | 是 | 用户ID |

**请求示例**:
```bash
curl -X POST "https://api.example.com/api/agent/planning-assistant/users/user-123/preferences/clear"
```

**响应示例**:
```json
{
  "success": true
}
```

**响应字段**:
| 字段 | 类型 | 说明 |
|------|------|------|
| success | boolean | 操作是否成功 |

**注意事项**:
- 此操作不可逆，清除后需要重新学习用户偏好
- 只清除学习到的偏好，不会影响用户手动设置的偏好画像（`/api/users/profile`）

**错误响应**:
- `500 Internal Server Error`: 服务器内部错误

---

## 三、决策风格偏好接口

### 3.1 推断用户偏好

**端点**: `GET /api/v1/decision-replay/style/:userId/preferences`

**说明**: 基于用户历史决策数据推断用户偏好。该接口分析用户的决策历史，提取决策风格和偏好模式。

**认证**: 需要 JWT Bearer Token

**请求头**:
```
Authorization: Bearer <accessToken>
```

**路径参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| userId | string | 是 | 用户ID |

**请求示例**:
```bash
curl -X GET "https://api.example.com/api/v1/decision-replay/style/user-123/preferences" \
  -H "Authorization: Bearer <accessToken>"
```

**响应示例**:
```json
{
  "riskTolerance": "MEDIUM",
  "preferredPace": "MODERATE",
  "budgetPreference": "MEDIUM",
  "decisionPatterns": {
    "prefersDetailedPlans": true,
    "oftenModifiesPlans": false,
    "prefersSafety": true
  },
  "inferredTags": ["solo", "adventure"],
  "confidence": 0.75
}
```

**响应字段**:
| 字段 | 类型 | 说明 |
|------|------|------|
| riskTolerance | string | 风险承受度（LOW, MEDIUM, HIGH） |
| preferredPace | string | 偏好节奏（LEISURE, MODERATE, FAST） |
| budgetPreference | string | 预算偏好（LOW, MEDIUM, HIGH） |
| decisionPatterns | object | 决策模式 |
| decisionPatterns.prefersDetailedPlans | boolean | 是否偏好详细计划 |
| decisionPatterns.oftenModifiesPlans | boolean | 是否经常修改计划 |
| decisionPatterns.prefersSafety | boolean | 是否偏好安全选项 |
| inferredTags | string[] | 推断的标签 |
| confidence | number | 推断置信度（0-1） |

**注意事项**:
- 需要用户有足够的历史决策数据才能进行推断
- `confidence` 值表示推断的可靠性，值越高越可靠

**错误响应**:
- `401 Unauthorized`: 未认证或 token 无效
- `404 Not Found`: 用户不存在或没有足够的历史数据
- `500 Internal Server Error`: 服务器内部错误

---

## 四、偏好字段说明

### 4.1 景点类型 (preferredAttractionTypes)

可选值：
- `ATTRACTION`: 景点
- `NATURE`: 自然景观
- `CULTURE`: 文化景点
- `ADVENTURE`: 冒险活动
- `FOOD`: 美食
- `SHOPPING`: 购物
- `NIGHTLIFE`: 夜生活

### 4.2 饮食禁忌 (dietaryRestrictions)

可选值：
- `VEGETARIAN`: 素食
- `VEGAN`: 纯素
- `NO_PORK`: 不吃猪肉
- `NO_BEEF`: 不吃牛肉
- `NO_SEAFOOD`: 不吃海鲜
- `HALAL`: 清真
- `KOSHER`: 犹太洁食
- `GLUTEN_FREE`: 无麸质
- `LACTOSE_FREE`: 无乳糖

### 4.3 旅行节奏 (pace)

可选值：
- `LEISURE`: 悠闲
- `MODERATE`: 中等
- `FAST`: 快速

### 4.4 预算级别 (budget)

可选值：
- `LOW`: 低预算
- `MEDIUM`: 中等预算
- `HIGH`: 高预算
- `LUXURY`: 奢华

### 4.5 住宿类型 (accommodation)

可选值：
- `BUDGET`: 经济型
- `COMFORTABLE`: 舒适型
- `LUXURY`: 奢华型

### 4.6 旅行者标签 (tags)

常见标签：
- `solo`: 独自旅行
- `couple`: 情侣
- `family_with_children`: 带小孩的家庭
- `family_without_children`: 无小孩的家庭
- `senior`: 老年人
- `adventure`: 冒险爱好者
- `budget`: 预算旅行者
- `luxury`: 奢华旅行者
- `backpacker`: 背包客
- `business`: 商务旅行

---

## 五、使用示例

### 5.1 完整流程示例

```javascript
// 1. 获取当前用户偏好
const response = await fetch('/api/users/profile', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
const { data } = await response.json();
console.log('当前偏好:', data.preferences);

// 2. 更新用户偏好
await fetch('/api/users/profile', {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    preferences: {
      preferredAttractionTypes: ['NATURE', 'CULTURE'],
      travelPreferences: {
        pace: 'MODERATE',
        budget: 'MEDIUM'
      },
      tags: ['solo', 'adventure']
    }
  })
});

// 3. 获取学习到的偏好摘要
const summaryResponse = await fetch(
  `/api/agent/planning-assistant/users/${userId}/preferences`
);
const summary = await summaryResponse.json();
console.log('偏好摘要:', summary.summaryCN);
```

### 5.2 部分更新示例

```javascript
// 只更新旅行节奏
await fetch('/api/users/profile', {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    preferences: {
      travelPreferences: {
        pace: 'FAST'
      }
    }
  })
});
```

---

## 六、常见问题

### Q1: 用户偏好画像和学习到的偏好有什么区别？

**A**: 
- **用户偏好画像** (`/api/users/profile`): 用户手动设置的偏好，存储在用户配置中
- **学习到的偏好** (`/api/agent/planning-assistant/users/:userId/preferences`): 系统从用户历史行为中自动学习到的偏好

两者可以结合使用，学习到的偏好可以作为用户画像的补充。

### Q2: 清除偏好会影响用户手动设置的偏好吗？

**A**: 不会。`/api/agent/planning-assistant/users/:userId/preferences/clear` 只清除学习到的偏好，不会影响 `/api/users/profile` 中用户手动设置的偏好。

### Q3: 如何判断用户是否有偏好数据？

**A**: 
- 对于用户偏好画像：检查 `GET /api/users/profile` 响应中的 `preferences` 字段是否为 `null`
- 对于学习到的偏好：检查 `GET /api/agent/planning-assistant/users/:userId/preferences` 响应中的 `topPreferences` 数组是否为空

### Q4: 偏好字段是否支持国际化？

**A**: 部分接口返回了中英文双语内容（如规划助手偏好摘要），但用户设置的偏好值本身不支持国际化，建议使用标准值（如 ISO 3166-1 alpha-2 国家代码）。

---

## 七、更新日志

- **2024-01-XX**: 初始版本，包含用户偏好画像和规划助手偏好接口
- **2024-XX-XX**: 添加决策风格偏好接口
