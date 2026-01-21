# RAG 和 LLM API 文档

> 更新时间: 2026-01-21

本文档描述了 RAG 和 LLM 相关的 API 接口，按前端用户系统和后端管理系统分类。

---

## 目录

- [一、前端用户系统 API](#一前端用户系统-api)
  - [RAG 相关接口](#rag-相关接口)
  - [LLM 相关接口](#llm-相关接口)
- [二、后端管理系统 API](#二后端管理系统-api)
  - [RAG 管理接口](#rag-管理接口)
    - [文档列表管理](#1-文档列表管理)
    - [文档详情](#2-获取文档详情)
    - [更新文档](#3-更新文档)
    - [删除文档](#4-删除文档)
    - [RAG 统计](#5-rag-统计)
    - [索引文档](#6-索引文档)
    - [批量索引文档](#7-批量索引文档)
    - [刷新合规规则缓存](#8-刷新合规规则缓存)
    - [生成路线段叙事](#9-生成路线段叙事)
    - [刷新当地洞察缓存](#10-刷新当地洞察缓存)
  - [LLM 管理接口](#llm-管理接口)
- [请求/响应格式](#请求响应格式)
- [错误码说明](#错误码说明)
- [示例](#示例)

---

## 一、前端用户系统 API

前端用户系统面向终端用户，提供 RAG 检索、LLM 交互等功能。

### RAG 相关接口

#### 1. RAG 搜索

**端点**: `POST /api/rag/search`

**描述**: 从 RAG 知识库中搜索相关文档，支持更复杂的查询参数。

**请求体**:

```json
{
  "query": "冰岛旅游攻略",
  "collection": "travel_guides",
  "countryCode": "IS",
  "tags": ["attractions", "tips"],
  "limit": 10,
  "minScore": 0.5
}
```

**参数说明**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| query | string | 是 | 查询文本 |
| collection | string | 是 | 集合名称（如：travel_guides, compliance_rules） |
| countryCode | string | 否 | 国家代码（如：IS, JP） |
| tags | string[] | 否 | 标签列表 |
| limit | number | 否 | 返回数量限制，默认 10 |
| minScore | number | 否 | 最小相似度分数，默认 0.5 |

**响应示例**:

```json
{
  "success": true,
  "data": [
    {
      "id": "doc-123",
      "content": "冰岛是位于北大西洋的岛国...",
      "title": "冰岛旅游指南",
      "source": "travel-guide-2024",
      "score": 0.85,
      "metadata": {
        "author": "TripNara",
        "updatedAt": "2024-01-15"
      }
    }
  ]
}
```

---

#### 2. 检索文档

**端点**: `GET /api/rag/retrieve`

**描述**: 从 RAG 知识库中检索相关文档（简单版本）。

**查询参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| query | string | 是 | 查询文本 |
| collection | string | 是 | 集合名称 |
| countryCode | string | 否 | 国家代码 |
| limit | number | 否 | 返回数量限制，默认 10 |

**示例请求**:

```
GET /api/rag/retrieve?query=冰岛旅游&collection=travel_guides&countryCode=IS&limit=5
```

---

#### 3. 提取 Rail Pass 规则

**端点**: `POST /api/rag/compliance/rail-pass`

**描述**: 从文档中提取铁路通票相关的合规规则。

**请求体**:

```json
{
  "passType": "Eurail Global Pass",
  "countryCode": "CH"
}
```

**响应示例**:

```json
{
  "success": true,
  "data": [
    {
      "passType": "Eurail Global Pass",
      "countryCode": "CH",
      "requiresReservation": true,
      "reservationFee": "9 EUR",
      "validTrainTypes": ["IC", "EC", "ICE"],
      "restrictions": "Glacier Express 需要额外预订",
      "source": "eurail-official"
    }
  ]
}
```

---

#### 4. 提取 Trail Access 规则

**端点**: `POST /api/rag/compliance/trail-access`

**描述**: 从文档中提取步道访问相关的合规规则。

**请求体**:

```json
{
  "trailId": "laugavegur-trail",
  "countryCode": "IS"
}
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "trailId": "laugavegur-trail",
    "countryCode": "IS",
    "permitRequired": true,
    "seasonalRestrictions": "6月-9月开放",
    "bookingRequired": true,
    "maxGroupSize": 12,
    "source": "iceland-trails-official"
  }
}
```

---

#### 5. 生成路线叙事

**端点**: `GET /api/rag/route-narrative/:routeDirectionId`

**描述**: 为指定路线生成丰富的叙事内容。

**路径参数**:

| 参数 | 类型 | 说明 |
|------|------|------|
| routeDirectionId | string | 路线方向 ID |

**查询参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| countryCode | string | 否 | 国家代码 |
| includeLocalInsights | boolean | 否 | 是否包含当地洞察信息 |

**响应示例**:

```json
{
  "routeDirectionId": "route-123",
  "narrative": {
    "title": "黄金圈经典路线",
    "description": "这条路线穿越冰岛最著名的三大景点...",
    "highlights": [
      "辛格维利尔国家公园 - 世界遗产",
      "盖歇尔间歇泉 - 每5-10分钟喷发",
      "黄金瀑布 - 冰岛最壮观的瀑布之一"
    ],
    "tips": [
      "建议早上出发避开人群",
      "带好防水外套"
    ]
  },
  "localInsights": [
    {
      "content": "当地人推荐在 Friðheimar 番茄农场用餐",
      "tags": ["food", "local-tips"]
    }
  ]
}
```

---

#### 6. 获取当地洞察

**端点**: `GET /api/rag/local-insight`

**描述**: 获取指定地区的当地洞察信息。

**查询参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| countryCode | string | 是 | 国家代码 |
| tags | string | 是 | 标签（逗号分隔或数组） |
| region | string | 否 | 地区 |

**示例请求**:

```
GET /api/rag/local-insight?countryCode=IS&tags=culture,tips,food&region=Reykjavik
```

**响应示例**:

```json
{
  "countryCode": "IS",
  "region": "Reykjavik",
  "insights": [
    {
      "content": "冰岛人习惯在晚上9点后用餐",
      "tags": ["culture", "food"],
      "confidence": 0.9
    },
    {
      "content": "大多数商店周日不营业",
      "tags": ["tips"],
      "confidence": 0.95
    }
  ]
}
```

---

#### 7. 获取目的地深度信息

**端点**: `GET /api/rag/destination-insights`

**描述**: 获取行程中目的地的特色贴士和隐藏攻略。

**查询参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| placeId | string | 是 | 地点 ID |
| tripId | string | 否 | 行程 ID |
| countryCode | string | 否 | 国家代码 |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "placeId": "place-123",
    "insights": {
      "tips": [
        {
          "content": "蓝湖最佳游览时间是清晨...",
          "source": "travel-guide-2024",
          "score": 0.92
        }
      ],
      "localInsights": [
        {
          "content": "当地人更推荐 Sky Lagoon...",
          "tags": ["local-tips", "hidden-gem"]
        }
      ],
      "routeInsights": {
        "answer": "从雷克雅未克到蓝湖约45分钟车程",
        "source": "route-knowledge"
      }
    },
    "credibility": {
      "ragSources": 5,
      "localInsightsCount": 3,
      "hasRouteContext": true
    }
  }
}
```

---

#### 8. 提取行程合规规则

**端点**: `POST /api/rag/extract-compliance-rules`

**描述**: 自动获取行程涉及的签证和交通合规信息，生成合规清单。

**请求体**:

```json
{
  "tripId": "trip-123",
  "countryCodes": ["IS", "NO", "SE"],
  "ruleTypes": ["VISA", "TRANSPORT", "ENTRY"]
}
```

**参数说明**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| tripId | string | 是 | 行程 ID |
| countryCodes | string[] | 是 | 国家代码列表 |
| ruleTypes | string[] | 否 | 规则类型：VISA, TRANSPORT, ENTRY, EXIT |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "tripId": "trip-123",
    "countryCodes": ["IS", "NO", "SE"],
    "rules": [...],
    "checklist": [
      {
        "category": "签证规则",
        "items": [
          {
            "description": "申根签证 - 90天内最多停留90天",
            "required": true,
            "deadline": "出发前至少30天",
            "source": "RAG检索"
          }
        ]
      }
    ],
    "summary": {
      "totalRules": 8,
      "totalChecklistItems": 12,
      "categories": ["签证规则", "交通规则", "路线准入规则"]
    }
  }
}
```

---

#### 9. 回答路线问题

**端点**: `POST /api/rag/chat/answer-route-question`

**描述**: 使用增强对话功能回答关于路线的问题。

**请求体**:

```json
{
  "question": "这条路线需要什么装备？",
  "routeDirectionId": "route-123",
  "countryCode": "IS",
  "segmentId": "seg-001",
  "dayIndex": 1,
  "tripId": "trip-456"
}
```

**参数说明**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| question | string | 是 | 问题文本 |
| routeDirectionId | string | 否 | 路线方向 ID |
| countryCode | string | 否 | 国家代码 |
| segmentId | string | 否 | 路线段 ID |
| dayIndex | number | 否 | 天数索引 |
| tripId | string | 否 | 行程 ID |

**响应示例**:

```json
{
  "answer": "建议携带以下装备：防水冲锋衣、登山鞋、保暖层衣物...",
  "sources": [
    {
      "content": "Laugavegur 徒步装备清单...",
      "source": "iceland-trails-guide",
      "score": 0.88
    }
  ],
  "confidence": 0.85
}
```

---

#### 10. 解释路线选择

**端点**: `POST /api/rag/chat/explain-why-not-other-route`

**描述**: 解释为什么选择了当前路线而不是另一条。

**请求体**:

```json
{
  "selectedRouteId": "route-123",
  "alternativeRouteId": "route-456",
  "countryCode": "IS"
}
```

**响应示例**:

```json
{
  "explanation": "选择路线A而非路线B的原因：1. 路线A风景更多样化 2. 路线A有更多补给点 3. 路线B在此季节可能有积雪...",
  "comparison": {
    "selectedRoute": {
      "name": "Laugavegur Trail",
      "pros": ["风景多样", "设施完善"],
      "cons": ["人较多"]
    },
    "alternativeRoute": {
      "name": "Fimmvörðuháls Trail",
      "pros": ["更具挑战性"],
      "cons": ["季节性限制", "难度较高"]
    }
  }
}
```

---

### LLM 相关接口

前端用户系统目前没有独立的 LLM 接口，LLM 功能通过 Agent 接口间接使用。

---

## 二、后端管理系统 API

后端管理系统面向运营人员和管理员，提供 RAG 知识库管理、LLM 监控等功能。

### RAG 管理接口

### 1. RAG 搜索

**端点**: `POST /api/rag/search`

**描述**: 从 RAG 知识库中搜索相关文档，支持更复杂的查询参数。

**请求体**:

```json
{
  "query": "冰岛旅游攻略",
  "collection": "travel_guides",
  "countryCode": "IS",
  "tags": ["attractions", "tips"],
  "limit": 10,
  "minScore": 0.5
}
```

**参数说明**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| query | string | 是 | 查询文本 |
| collection | string | 是 | 集合名称（如：travel_guides, compliance_rules） |
| countryCode | string | 否 | 国家代码（如：IS, JP） |
| tags | string[] | 否 | 标签列表 |
| limit | number | 否 | 返回数量限制，默认 10 |
| minScore | number | 否 | 最小相似度分数，默认 0.5 |

**响应示例**:

```json
{
  "success": true,
  "data": [
    {
      "id": "doc-123",
      "content": "冰岛是位于北大西洋的岛国...",
      "title": "冰岛旅游指南",
      "source": "travel-guide-2024",
      "score": 0.85,
      "metadata": {
        "author": "TripNara",
        "updatedAt": "2024-01-15"
      }
    }
  ]
}
```

**响应字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 文档 ID |
| content | string | 文档内容 |
| title | string | 文档标题 |
| source | string | 文档来源 |
| score | number | 相似度分数（0-1） |
| metadata | object | 文档元数据 |

---

### 2. RAG 统计

**端点**: `GET /api/rag/stats`

**描述**: 获取 RAG 知识库的统计信息，包括文档数量、集合统计等。

**查询参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| collection | string | 否 | 集合名称（可选，不提供则返回所有集合的统计） |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "totalDocuments": 1523,
    "collections": [
      {
        "name": "travel_guides",
        "count": 856,
        "countries": ["IS", "JP", "US"],
        "tags": ["attractions", "tips", "culture"]
      },
      {
        "name": "compliance_rules",
        "count": 667,
        "countries": ["IS", "JP"],
        "tags": ["visa", "transport", "entry"]
      }
    ],
    "byCollection": {
      "name": "travel_guides",
      "count": 856,
      "countries": ["IS", "JP", "US"],
      "tags": ["attractions", "tips", "culture"]
    }
  }
}
```

**响应字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| totalDocuments | number | 总文档数 |
| collections | array | 集合统计列表 |
| collections[].name | string | 集合名称 |
| collections[].count | number | 文档数量 |
| collections[].countries | string[] | 涉及的国家代码列表 |
| collections[].tags | string[] | 标签列表 |
| byCollection | object | 指定集合的详细信息（当提供 collection 参数时） |

---

### 3. 检索文档

**端点**: `GET /api/rag/retrieve`

**描述**: 从 RAG 知识库中检索相关文档（简单版本）。

**查询参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| query | string | 是 | 查询文本 |
| collection | string | 是 | 集合名称 |
| countryCode | string | 否 | 国家代码 |
| limit | number | 否 | 返回数量限制，默认 10 |

**示例请求**:

```
GET /api/rag/retrieve?query=冰岛旅游&collection=travel_guides&countryCode=IS&limit=5
```

---

### 4. 索引文档

**端点**: `POST /api/rag/index`

**描述**: 将单个文档添加到 RAG 知识库索引。

**请求体**:

```json
{
  "id": "doc-001",
  "content": "冰岛是一个位于北大西洋的岛国...",
  "title": "冰岛旅游指南",
  "collection": "travel_guides",
  "countryCode": "IS",
  "tags": ["attractions", "tips"],
  "source": "official-guide",
  "metadata": {
    "author": "TripNara",
    "createdAt": "2024-01-15"
  }
}
```

**参数说明**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 否 | 文档 ID（可选，自动生成） |
| content | string | 是 | 文档内容 |
| title | string | 否 | 文档标题 |
| collection | string | 是 | 集合名称 |
| countryCode | string | 否 | 国家代码 |
| tags | string[] | 否 | 标签列表 |
| source | string | 否 | 文档来源 |
| metadata | object | 否 | 其他元数据 |

**响应示例**:

```json
{
  "id": "doc-001",
  "success": true
}
```

---

### 5. 批量索引文档

**端点**: `POST /api/rag/index/batch`

**描述**: 批量将文档添加到 RAG 知识库索引。

**请求体**:

```json
[
  {
    "content": "文档1内容...",
    "title": "文档1标题",
    "collection": "travel_guides",
    "countryCode": "IS"
  },
  {
    "content": "文档2内容...",
    "title": "文档2标题",
    "collection": "travel_guides",
    "countryCode": "JP"
  }
]
```

**响应示例**:

```json
{
  "ids": ["doc-001", "doc-002"],
  "success": true,
  "count": 2
}
```

---

### 6. 提取 Rail Pass 规则

**端点**: `POST /api/rag/compliance/rail-pass`

**描述**: 从文档中提取铁路通票相关的合规规则。

**请求体**:

```json
{
  "passType": "Eurail Global Pass",
  "countryCode": "CH"
}
```

**响应示例**:

```json
{
  "success": true,
  "data": [
    {
      "passType": "Eurail Global Pass",
      "countryCode": "CH",
      "requiresReservation": true,
      "reservationFee": "9 EUR",
      "validTrainTypes": ["IC", "EC", "ICE"],
      "restrictions": "Glacier Express 需要额外预订",
      "source": "eurail-official"
    }
  ]
}
```

---

### 7. 提取 Trail Access 规则

**端点**: `POST /api/rag/compliance/trail-access`

**描述**: 从文档中提取步道访问相关的合规规则。

**请求体**:

```json
{
  "trailId": "laugavegur-trail",
  "countryCode": "IS"
}
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "trailId": "laugavegur-trail",
    "countryCode": "IS",
    "permitRequired": true,
    "seasonalRestrictions": "6月-9月开放",
    "bookingRequired": true,
    "maxGroupSize": 12,
    "source": "iceland-trails-official"
  }
}
```

---

### 8. 刷新合规规则缓存

**端点**: `POST /api/rag/compliance/refresh`

**描述**: 手动触发合规规则缓存的刷新。此接口用于**后台管理系统**，当知识库中的合规规则文档更新后，需要调用此接口使缓存失效并重新加载最新规则。

**使用场景**:
- 更新了铁路通票规则文档后
- 更新了步道访问规则后
- 修复了合规规则中的错误后
- 定期刷新确保规则最新

**权限要求**: 管理员权限

**请求体**: 无需请求体

**响应示例**:

```json
{
  "success": true,
  "message": "Compliance rules refresh started"
}
```

**注意事项**:
- 刷新操作是异步的，返回成功只表示刷新任务已启动
- 频繁调用可能影响系统性能，建议在非高峰期执行
- 刷新完成后，新请求将使用最新的规则数据

---

### 9. 生成路线叙事

**端点**: `GET /api/rag/route-narrative/:routeDirectionId`

**描述**: 为指定路线生成丰富的叙事内容。

**路径参数**:

| 参数 | 类型 | 说明 |
|------|------|------|
| routeDirectionId | string | 路线方向 ID |

**查询参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| countryCode | string | 否 | 国家代码 |
| includeLocalInsights | boolean | 否 | 是否包含当地洞察信息 |

**响应示例**:

```json
{
  "routeDirectionId": "route-123",
  "narrative": {
    "title": "黄金圈经典路线",
    "description": "这条路线穿越冰岛最著名的三大景点...",
    "highlights": [
      "辛格维利尔国家公园 - 世界遗产",
      "盖歇尔间歇泉 - 每5-10分钟喷发",
      "黄金瀑布 - 冰岛最壮观的瀑布之一"
    ],
    "tips": [
      "建议早上出发避开人群",
      "带好防水外套"
    ]
  },
  "localInsights": [
    {
      "content": "当地人推荐在 Friðheimar 番茄农场用餐",
      "tags": ["food", "local-tips"]
    }
  ]
}
```

---

### 10. 生成路线段叙事

**端点**: `POST /api/rag/segment-narrative`

**描述**: 为指定路线段生成叙事内容。

**请求体**:

```json
{
  "segmentId": "seg-001",
  "dayIndex": 1,
  "name": "从雷克雅未克到辛格维利尔",
  "description": "早上出发...",
  "countryCode": "IS"
}
```

**响应示例**:

```json
{
  "segmentId": "seg-001",
  "narrative": {
    "title": "第1天: 黄金圈之旅的起点",
    "content": "从雷克雅未克出发，沿着1号公路...",
    "duration": "约45分钟车程",
    "scenery": ["火山地貌", "苔原", "远山"]
  }
}
```

---

### 11. 获取当地洞察

**端点**: `GET /api/rag/local-insight`

**描述**: 获取指定地区的当地洞察信息。

**查询参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| countryCode | string | 是 | 国家代码 |
| tags | string | 是 | 标签（逗号分隔或数组） |
| region | string | 否 | 地区 |

**示例请求**:

```
GET /api/rag/local-insight?countryCode=IS&tags=culture,tips,food&region=Reykjavik
```

**响应示例**:

```json
{
  "countryCode": "IS",
  "region": "Reykjavik",
  "insights": [
    {
      "content": "冰岛人习惯在晚上9点后用餐",
      "tags": ["culture", "food"],
      "confidence": 0.9
    },
    {
      "content": "大多数商店周日不营业",
      "tags": ["tips"],
      "confidence": 0.95
    }
  ]
}
```

---

### 12. 刷新当地洞察缓存

**端点**: `POST /api/rag/local-insight/refresh`

**描述**: 手动触发指定地区的当地洞察信息缓存刷新。此接口用于**后台管理系统**，当更新了某个地区的旅行攻略、文化礼仪等信息后，调用此接口使对应的缓存失效。

**使用场景**:
- 更新了某国家/地区的旅行攻略后
- 添加了新的当地文化礼仪信息后
- 修正了错误的当地洞察内容后
- 季节性更新（如开放时间变化）

**权限要求**: 管理员权限

**请求体**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| countryCode | string | 是 | 国家代码（ISO 3166-1 alpha-2） |
| tags | string[] | 是 | 需要刷新的标签列表 |
| region | string | 否 | 具体地区（不指定则刷新全国范围） |

**可用标签**:
- `culture` - 文化礼仪
- `tips` - 实用贴士
- `etiquette` - 礼节规范
- `hidden_gems` - 小众景点
- `food` - 美食推荐
- `transport` - 交通信息
- `travel-guide` - 旅行指南

**请求示例**:

```json
{
  "countryCode": "IS",
  "tags": ["culture", "tips", "etiquette"],
  "region": "Reykjavik"
}
```

**响应示例**:

```json
{
  "success": true,
  "refreshedAt": "2026-01-21T10:30:00Z",
  "countryCode": "IS",
  "tags": ["culture", "tips", "etiquette"],
  "region": "Reykjavik"
}
```

**注意事项**:
- 可以不指定 region 来刷新整个国家的洞察缓存
- 建议按需刷新特定标签，避免全量刷新影响性能

---

### 13. 获取目的地深度信息

**端点**: `GET /api/rag/destination-insights`

**描述**: 获取行程中目的地的特色贴士和隐藏攻略。

**查询参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| placeId | string | 是 | 地点 ID |
| tripId | string | 否 | 行程 ID |
| countryCode | string | 否 | 国家代码 |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "placeId": "place-123",
    "insights": {
      "tips": [
        {
          "content": "蓝湖最佳游览时间是清晨...",
          "source": "travel-guide-2024",
          "score": 0.92
        }
      ],
      "localInsights": [
        {
          "content": "当地人更推荐 Sky Lagoon...",
          "tags": ["local-tips", "hidden-gem"]
        }
      ],
      "routeInsights": {
        "answer": "从雷克雅未克到蓝湖约45分钟车程",
        "source": "route-knowledge"
      }
    },
    "credibility": {
      "ragSources": 5,
      "localInsightsCount": 3,
      "hasRouteContext": true
    }
  }
}
```

---

### 14. 提取行程合规规则

**端点**: `POST /api/rag/extract-compliance-rules`

**描述**: 自动获取行程涉及的签证和交通合规信息，生成合规清单。

**请求体**:

```json
{
  "tripId": "trip-123",
  "countryCodes": ["IS", "NO", "SE"],
  "ruleTypes": ["VISA", "TRANSPORT", "ENTRY"]
}
```

**参数说明**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| tripId | string | 是 | 行程 ID |
| countryCodes | string[] | 是 | 国家代码列表 |
| ruleTypes | string[] | 否 | 规则类型：VISA, TRANSPORT, ENTRY, EXIT |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "tripId": "trip-123",
    "countryCodes": ["IS", "NO", "SE"],
    "rules": [...],
    "checklist": [
      {
        "category": "签证规则",
        "items": [
          {
            "description": "申根签证 - 90天内最多停留90天",
            "required": true,
            "deadline": "出发前至少30天",
            "source": "RAG检索"
          }
        ]
      },
      {
        "category": "交通规则",
        "items": [
          {
            "description": "Eurail Pass 在挪威部分线路需预订",
            "required": true,
            "source": "RAG提取"
          }
        ]
      }
    ],
    "summary": {
      "totalRules": 8,
      "totalChecklistItems": 12,
      "categories": ["签证规则", "交通规则", "路线准入规则"]
    }
  }
}
```

---

### 15. 回答路线问题

**端点**: `POST /api/rag/chat/answer-route-question`

**描述**: 使用增强对话功能回答关于路线的问题。

**请求体**:

```json
{
  "question": "这条路线需要什么装备？",
  "routeDirectionId": "route-123",
  "countryCode": "IS",
  "segmentId": "seg-001",
  "dayIndex": 1,
  "tripId": "trip-456"
}
```

**参数说明**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| question | string | 是 | 问题文本 |
| routeDirectionId | string | 否 | 路线方向 ID |
| countryCode | string | 否 | 国家代码 |
| segmentId | string | 否 | 路线段 ID |
| dayIndex | number | 否 | 天数索引 |
| tripId | string | 否 | 行程 ID |

**响应示例**:

```json
{
  "answer": "建议携带以下装备：防水冲锋衣、登山鞋、保暖层衣物...",
  "sources": [
    {
      "content": "Laugavegur 徒步装备清单...",
      "source": "iceland-trails-guide",
      "score": 0.88
    }
  ],
  "confidence": 0.85
}
```

---

### 16. 解释路线选择

**端点**: `POST /api/rag/chat/explain-why-not-other-route`

**描述**: 解释为什么选择了当前路线而不是另一条。

**请求体**:

```json
{
  "selectedRouteId": "route-123",
  "alternativeRouteId": "route-456",
  "countryCode": "IS"
}
```

**响应示例**:

```json
{
  "explanation": "选择路线A而非路线B的原因：1. 路线A风景更多样化 2. 路线A有更多补给点 3. 路线B在此季节可能有积雪...",
  "comparison": {
    "selectedRoute": {
      "name": "Laugavegur Trail",
      "pros": ["风景多样", "设施完善"],
      "cons": ["人较多"]
    },
    "alternativeRoute": {
      "name": "Fimmvörðuháls Trail",
      "pros": ["更具挑战性"],
      "cons": ["季节性限制", "难度较高"]
    }
  }
}
```

---

### RAG 管理接口

#### 1. 文档列表管理

**端点**: `GET /api/rag/documents`

**描述**: 获取 RAG 知识库中的文档列表，支持分页、筛选等功能。用于后台管理系统查看和管理知识库文档。

**查询参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| collection | string | 否 | 集合名称 |
| countryCode | string | 否 | 国家代码 |
| tags | string | 否 | 标签（逗号分隔） |
| page | number | 否 | 页码，从1开始，默认 1 |
| pageSize | number | 否 | 每页数量，默认 20 |
| search | string | 否 | 搜索关键词（标题或内容） |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "documents": [
      {
        "id": "doc-001",
        "collection": "travel_guides",
        "title": "冰岛旅游指南",
        "content": "冰岛是一个位于北大西洋的岛国...",
        "contentPreview": "冰岛是一个位于北大西洋的岛国...",
        "source": "official-guide",
        "countryCode": "IS",
        "tags": ["attractions", "tips"],
        "metadata": {
          "author": "TripNara",
          "createdAt": "2024-01-15"
        },
        "createdAt": "2024-01-15T10:00:00Z",
        "updatedAt": "2024-01-15T10:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 1523,
      "totalPages": 77
    }
  }
}
```

**响应字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| documents | array | 文档列表 |
| documents[].id | string | 文档 ID |
| documents[].collection | string | 集合名称 |
| documents[].title | string | 文档标题 |
| documents[].content | string | 文档完整内容 |
| documents[].contentPreview | string | 内容预览（前200字符） |
| documents[].source | string | 文档来源 |
| documents[].countryCode | string | 国家代码 |
| documents[].tags | string[] | 标签列表 |
| documents[].metadata | object | 元数据 |
| documents[].createdAt | string | 创建时间 |
| documents[].updatedAt | string | 更新时间 |
| pagination | object | 分页信息 |
| pagination.page | number | 当前页码 |
| pagination.pageSize | number | 每页数量 |
| pagination.total | number | 总文档数 |
| pagination.totalPages | number | 总页数 |

---

#### 2. 获取文档详情

**端点**: `GET /api/rag/documents/:id`

**描述**: 根据文档 ID 获取文档的详细信息。用于后台管理系统查看文档完整内容。

**路径参数**:

| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 文档 ID |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "id": "doc-001",
    "collection": "travel_guides",
    "title": "冰岛旅游指南",
    "content": "冰岛是一个位于北大西洋的岛国，拥有壮丽的自然风光...",
    "source": "official-guide",
    "countryCode": "IS",
    "tags": ["attractions", "tips", "culture"],
    "metadata": {
      "author": "TripNara",
      "createdAt": "2024-01-15",
      "version": "1.0"
    },
    "createdAt": "2024-01-15T10:00:00Z",
    "updatedAt": "2024-01-20T15:30:00Z"
  }
}
```

---

#### 3. 更新文档

**端点**: `PUT /api/rag/documents/:id`

**描述**: 更新 RAG 知识库中的文档。如果内容更新，会自动重新生成 embedding。

**路径参数**:

| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 文档 ID |

**请求体**:

```json
{
  "title": "冰岛旅游指南（更新版）",
  "content": "更新后的内容...",
  "collection": "travel_guides",
  "countryCode": "IS",
  "tags": ["attractions", "tips", "updated"],
  "source": "official-guide-v2",
  "metadata": {
    "author": "TripNara",
    "version": "2.0"
  }
}
```

**参数说明**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| title | string | 否 | 文档标题 |
| content | string | 否 | 文档内容（更新后会重新生成 embedding） |
| collection | string | 否 | 集合名称 |
| countryCode | string | 否 | 国家代码 |
| tags | string[] | 否 | 标签列表 |
| source | string | 否 | 文档来源 |
| metadata | object | 否 | 元数据 |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "id": "doc-001",
    "message": "文档更新成功"
  }
}
```

**注意事项**:
- 如果更新了 `content` 字段，系统会自动重新生成 embedding
- 只更新提供的字段，未提供的字段保持不变

---

#### 4. 删除文档

**端点**: `DELETE /api/rag/documents/:id`

**描述**: 从 RAG 知识库中删除指定文档。

**路径参数**:

| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 文档 ID |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "id": "doc-001",
    "message": "文档删除成功"
  }
}
```

**错误响应**:

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "文档不存在"
  }
}
```

---

#### 5. RAG 统计

**端点**: `GET /api/rag/stats`

**描述**: 获取 RAG 知识库的统计信息，包括文档数量、集合统计等。用于后台管理系统监控知识库状态。

**查询参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| collection | string | 否 | 集合名称（可选，不提供则返回所有集合的统计） |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "totalDocuments": 1523,
    "collections": [
      {
        "name": "travel_guides",
        "count": 856,
        "countries": ["IS", "JP", "US"],
        "tags": ["attractions", "tips", "culture"]
      },
      {
        "name": "compliance_rules",
        "count": 667,
        "countries": ["IS", "JP"],
        "tags": ["visa", "transport", "entry"]
      }
    ],
    "byCollection": {
      "name": "travel_guides",
      "count": 856,
      "countries": ["IS", "JP", "US"],
      "tags": ["attractions", "tips", "culture"]
    }
  }
}
```

**响应字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| totalDocuments | number | 总文档数 |
| collections | array | 集合统计列表 |
| collections[].name | string | 集合名称 |
| collections[].count | number | 文档数量 |
| collections[].countries | string[] | 涉及的国家代码列表 |
| collections[].tags | string[] | 标签列表 |
| byCollection | object | 指定集合的详细信息（当提供 collection 参数时） |

---

#### 6. 索引文档

**端点**: `POST /api/rag/index`

**描述**: 将单个文档添加到 RAG 知识库索引。用于后台管理系统添加或更新知识库内容。

**请求体**:

```json
{
  "id": "doc-001",
  "content": "冰岛是一个位于北大西洋的岛国...",
  "title": "冰岛旅游指南",
  "collection": "travel_guides",
  "countryCode": "IS",
  "tags": ["attractions", "tips"],
  "source": "official-guide",
  "metadata": {
    "author": "TripNara",
    "createdAt": "2024-01-15"
  }
}
```

**参数说明**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 否 | 文档 ID（可选，自动生成） |
| content | string | 是 | 文档内容 |
| title | string | 否 | 文档标题 |
| collection | string | 是 | 集合名称 |
| countryCode | string | 否 | 国家代码 |
| tags | string[] | 否 | 标签列表 |
| source | string | 否 | 文档来源 |
| metadata | object | 否 | 其他元数据 |

**响应示例**:

```json
{
  "id": "doc-001",
  "success": true
}
```

---

#### 7. 批量索引文档

**端点**: `POST /api/rag/index/batch`

**描述**: 批量将文档添加到 RAG 知识库索引。用于后台管理系统批量导入知识库内容。

**请求体**:

```json
[
  {
    "content": "文档1内容...",
    "title": "文档1标题",
    "collection": "travel_guides",
    "countryCode": "IS"
  },
  {
    "content": "文档2内容...",
    "title": "文档2标题",
    "collection": "travel_guides",
    "countryCode": "JP"
  }
]
```

**响应示例**:

```json
{
  "ids": ["doc-001", "doc-002"],
  "success": true,
  "count": 2
}
```

---

#### 8. 刷新合规规则缓存

**端点**: `POST /api/rag/compliance/refresh`

**描述**: 手动触发合规规则缓存的刷新。此接口用于**后台管理系统**，当知识库中的合规规则文档更新后，需要调用此接口使缓存失效并重新加载最新规则。

**使用场景**:
- 更新了铁路通票规则文档后
- 更新了步道访问规则后
- 修复了合规规则中的错误后
- 定期刷新确保规则最新

**权限要求**: 管理员权限

**请求体**: 无需请求体

**响应示例**:

```json
{
  "success": true,
  "message": "Compliance rules refresh started"
}
```

**注意事项**:
- 刷新操作是异步的，返回成功只表示刷新任务已启动
- 频繁调用可能影响系统性能，建议在非高峰期执行
- 刷新完成后，新请求将使用最新的规则数据

---

#### 9. 生成路线段叙事

**端点**: `POST /api/rag/segment-narrative`

**描述**: 为指定路线段生成叙事内容。用于后台管理系统生成或更新路线段描述。

**请求体**:

```json
{
  "segmentId": "seg-001",
  "dayIndex": 1,
  "name": "从雷克雅未克到辛格维利尔",
  "description": "早上出发...",
  "countryCode": "IS"
}
```

**响应示例**:

```json
{
  "segmentId": "seg-001",
  "narrative": {
    "title": "第1天: 黄金圈之旅的起点",
    "content": "从雷克雅未克出发，沿着1号公路...",
    "duration": "约45分钟车程",
    "scenery": ["火山地貌", "苔原", "远山"]
  }
}
```

---

#### 10. 刷新当地洞察缓存

**端点**: `POST /api/rag/local-insight/refresh`

**描述**: 手动触发指定地区的当地洞察信息缓存刷新。此接口用于**后台管理系统**，当更新了某个地区的旅行攻略、文化礼仪等信息后，调用此接口使对应的缓存失效。

**使用场景**:
- 更新了某国家/地区的旅行攻略后
- 添加了新的当地文化礼仪信息后
- 修正了错误的当地洞察内容后
- 季节性更新（如开放时间变化）

**权限要求**: 管理员权限

**请求体**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| countryCode | string | 是 | 国家代码（ISO 3166-1 alpha-2） |
| tags | string[] | 是 | 需要刷新的标签列表 |
| region | string | 否 | 具体地区（不指定则刷新全国范围） |

**可用标签**:
- `culture` - 文化礼仪
- `tips` - 实用贴士
- `etiquette` - 礼节规范
- `hidden_gems` - 小众景点
- `food` - 美食推荐
- `transport` - 交通信息
- `travel-guide` - 旅行指南

**请求示例**:

```json
{
  "countryCode": "IS",
  "tags": ["culture", "tips", "etiquette"],
  "region": "Reykjavik"
}
```

**响应示例**:

```json
{
  "success": true,
  "refreshedAt": "2026-01-21T10:30:00Z",
  "countryCode": "IS",
  "tags": ["culture", "tips", "etiquette"],
  "region": "Reykjavik"
}
```

**注意事项**:
- 可以不指定 region 来刷新整个国家的洞察缓存
- 建议按需刷新特定标签，避免全量刷新影响性能

---

### LLM 管理接口

#### 1. 获取可用模型列表

**端点**: `GET /api/llm/models`

**描述**: 获取系统中可用的 LLM 模型列表，包括提供商、模型名称、状态等信息。

**响应示例**:

```json
{
  "success": true,
  "data": {
    "models": [
      {
        "provider": "openai",
        "models": [
          {
            "name": "gpt-4-turbo",
            "label": "GPT-4 Turbo",
            "available": true
          },
          {
            "name": "gpt-4o",
            "label": "GPT-4o",
            "available": true
          },
          {
            "name": "gpt-4o-mini",
            "label": "GPT-4o Mini",
            "available": true
          },
          {
            "name": "gpt-3.5-turbo",
            "label": "GPT-3.5 Turbo",
            "available": true
          }
        ]
      },
      {
        "provider": "anthropic",
        "models": [
          {
            "name": "claude-3-opus-20240229",
            "label": "Claude 3 Opus",
            "available": true
          },
          {
            "name": "claude-3-sonnet-20240229",
            "label": "Claude 3 Sonnet",
            "available": true
          },
          {
            "name": "claude-3-haiku-20240307",
            "label": "Claude 3 Haiku",
            "available": true
          }
        ]
      },
      {
        "provider": "deepseek",
        "models": [
          {
            "name": "deepseek-chat",
            "label": "DeepSeek Chat",
            "available": true
          },
          {
            "name": "deepseek-coder",
            "label": "DeepSeek Coder",
            "available": true
          }
        ]
      },
      {
        "provider": "gemini",
        "models": [
          {
            "name": "gemini-pro",
            "label": "Gemini Pro",
            "available": false
          },
          {
            "name": "gemini-pro-vision",
            "label": "Gemini Pro Vision",
            "available": false
          }
        ]
      }
    ],
    "defaultProvider": "deepseek",
    "totalModels": 11,
    "availableModels": 9
  }
}
```

**响应字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| models | array | 按提供商分组的模型列表 |
| models[].provider | string | 提供商名称（openai, anthropic, deepseek, gemini） |
| models[].models | array | 该提供商的模型列表 |
| models[].models[].name | string | 模型名称 |
| models[].models[].label | string | 模型显示名称 |
| models[].models[].available | boolean | 是否可用（基于 API Key 配置） |
| defaultProvider | string | 系统默认提供商 |
| totalModels | number | 总模型数 |
| availableModels | number | 可用模型数 |

---

### 2. Token 使用统计

**端点**: `GET /api/llm/usage`

**描述**: 获取 LLM Token 使用统计信息，包括按 Sub-Agent、任务类型、提供商等维度的统计。

**查询参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| subAgent | string | 否 | Sub-Agent 类型（如：PlannerAgent, GatekeeperAgent） |
| provider | string | 否 | LLM 提供商（openai, anthropic, deepseek, gemini） |
| startTime | string | 否 | 开始时间（ISO 8601 格式，如：2025-01-20T00:00:00Z） |
| endTime | string | 否 | 结束时间（ISO 8601 格式，如：2025-01-21T23:59:59Z） |

**响应示例（总体统计）**:

```json
{
  "success": true,
  "data": {
    "totalTokens": 150000,
    "totalPromptTokens": 100000,
    "totalCompletionTokens": 50000,
    "totalCalls": 150,
    "successfulCalls": 148,
    "failedCalls": 2,
    "successRate": 0.9867,
    "avgTokensPerCall": 1000,
    "timeRange": {
      "start": "2025-01-20T00:00:00Z",
      "end": "2025-01-21T23:59:59Z"
    }
  }
}
```

**响应示例（按 Sub-Agent 统计）**:

```json
{
  "success": true,
  "data": {
    "subAgent": {
      "sub_agent": "PlannerAgent",
      "tokens": {
        "total_prompt_tokens": 50000,
        "total_completion_tokens": 25000,
        "total_tokens": 75000,
        "avg_prompt_tokens": 500,
        "avg_completion_tokens": 250,
        "avg_total_tokens": 750,
        "max_tokens": 2000,
        "min_tokens": 100
      },
      "calls": {
        "total_calls": 100,
        "successful_calls": 99,
        "failed_calls": 1,
        "success_rate": 0.99
      },
      "latency": {
        "avg_latency_ms": 2000,
        "p50_latency_ms": 1800,
        "p90_latency_ms": 3000,
        "p99_latency_ms": 5000,
        "max_latency_ms": 8000
      },
      "time_range": {
        "start_time": "2025-01-20T00:00:00Z",
        "end_time": "2025-01-21T23:59:59Z",
        "duration_hours": 48
      }
    }
  }
}
```

**响应字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| totalTokens | number | 总 Token 数 |
| totalPromptTokens | number | 总 Prompt Token 数 |
| totalCompletionTokens | number | 总 Completion Token 数 |
| totalCalls | number | 总调用次数 |
| successfulCalls | number | 成功调用次数 |
| failedCalls | number | 失败调用次数 |
| successRate | number | 成功率（0-1） |
| avgTokensPerCall | number | 平均每次调用的 Token 数 |
| timeRange | object | 时间范围（如果提供了时间参数） |

---

### 3. 成本统计

**端点**: `GET /api/llm/cost`

**描述**: 获取 LLM 调用成本统计信息，包括总成本、按提供商/Sub-Agent 的成本分布等。

**查询参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| subAgent | string | 否 | Sub-Agent 类型 |
| provider | string | 否 | LLM 提供商 |
| startTime | string | 否 | 开始时间（ISO 8601 格式） |
| endTime | string | 否 | 结束时间（ISO 8601 格式） |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "totalCost": 15.234567,
    "currency": "USD",
    "byProvider": {
      "anthropic": 8.5,
      "deepseek": 4.2,
      "openai": 2.534567
    },
    "bySubAgent": {
      "PlannerAgent": 6.5,
      "GatekeeperAgent": 4.2,
      "NarratorAgent": 2.8,
      "ComplianceAgent": 1.734567
    },
    "timeRange": {
      "start": "2025-01-20T00:00:00Z",
      "end": "2025-01-21T23:59:59Z"
    },
    "breakdown": [
      {
        "provider": "anthropic",
        "model": "claude-3-sonnet-20240229",
        "calls": 50,
        "tokens": 50000,
        "cost": 8.5
      },
      {
        "provider": "deepseek",
        "model": "deepseek-chat",
        "calls": 80,
        "tokens": 60000,
        "cost": 4.2
      },
      {
        "provider": "openai",
        "model": "gpt-4o",
        "calls": 20,
        "tokens": 30000,
        "cost": 2.534567
      }
    ]
  }
}
```

**响应字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| totalCost | number | 总成本（美元） |
| currency | string | 货币单位（USD） |
| byProvider | object | 按提供商分组的成本 |
| bySubAgent | object | 按 Sub-Agent 分组的成本 |
| timeRange | object | 时间范围（如果提供了时间参数） |
| breakdown | array | 详细的成本分解（按 Provider+Model） |
| breakdown[].provider | string | 提供商 |
| breakdown[].model | string | 模型名称 |
| breakdown[].calls | number | 调用次数 |
| breakdown[].tokens | number | Token 总数 |
| breakdown[].cost | number | 成本（美元） |

---

## 请求/响应格式

### 统一响应格式

所有接口都使用统一的响应格式：

**成功响应**:

```json
{
  "success": true,
  "data": { ... }
}
```

**错误响应**:

```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "错误描述信息"
  }
}
```

### HTTP 状态码

- `200 OK`: 请求成功
- `400 Bad Request`: 请求参数错误
- `500 Internal Server Error`: 服务器内部错误

---

## 错误码说明

| 错误码 | HTTP 状态码 | 说明 |
|--------|------------|------|
| INTERNAL_ERROR | 500 | 服务器内部错误 |

---

## 示例

### cURL 示例

#### 1. RAG 搜索

```bash
curl -X POST http://localhost:3000/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "冰岛旅游攻略",
    "collection": "travel_guides",
    "countryCode": "IS",
    "limit": 10
  }'
```

#### 2. RAG 统计

```bash
curl -X GET "http://localhost:3000/api/rag/stats?collection=travel_guides"
```

#### 3. 获取可用模型列表

```bash
curl -X GET http://localhost:3000/api/llm/models
```

#### 4. Token 使用统计

```bash
# 总体统计
curl -X GET "http://localhost:3000/api/llm/usage"

# 按时间范围统计
curl -X GET "http://localhost:3000/api/llm/usage?startTime=2025-01-20T00:00:00Z&endTime=2025-01-21T23:59:59Z"

# 按 Sub-Agent 统计
curl -X GET "http://localhost:3000/api/llm/usage?subAgent=PlannerAgent"
```

#### 5. 成本统计

```bash
# 总体成本
curl -X GET http://localhost:3000/api/llm/cost

# 按时间范围统计
curl -X GET "http://localhost:3000/api/llm/cost?startTime=2025-01-20T00:00:00Z&endTime=2025-01-21T23:59:59Z"

# 按提供商统计
curl -X GET "http://localhost:3000/api/llm/cost?provider=anthropic"
```

#### 6. 文档列表管理

```bash
# 获取文档列表（分页）
curl -X GET "http://localhost:3000/api/rag/documents?page=1&pageSize=20"

# 按集合筛选
curl -X GET "http://localhost:3000/api/rag/documents?collection=travel_guides&page=1&pageSize=20"

# 按国家筛选
curl -X GET "http://localhost:3000/api/rag/documents?countryCode=IS&page=1&pageSize=20"

# 搜索文档
curl -X GET "http://localhost:3000/api/rag/documents?search=冰岛&page=1&pageSize=20"

# 获取文档详情
curl -X GET http://localhost:3000/api/rag/documents/doc-001

# 更新文档
curl -X PUT http://localhost:3000/api/rag/documents/doc-001 \
  -H "Content-Type: application/json" \
  -d '{
    "title": "更新后的标题",
    "content": "更新后的内容"
  }'

# 删除文档
curl -X DELETE http://localhost:3000/api/rag/documents/doc-001
```

### JavaScript/TypeScript 示例

```typescript
// RAG 搜索
const searchRAG = async (query: string, collection: string) => {
  const response = await fetch('http://localhost:3000/api/rag/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, collection }),
  });
  const result = await response.json();
  return result.data;
};

// RAG 统计
const getRAGStats = async (collection?: string) => {
  const url = collection 
    ? `http://localhost:3000/api/rag/stats?collection=${collection}`
    : 'http://localhost:3000/api/rag/stats';
  const response = await fetch(url);
  const result = await response.json();
  return result.data;
};

// 获取模型列表
const getModels = async () => {
  const response = await fetch('http://localhost:3000/api/llm/models');
  const result = await response.json();
  return result.data;
};

// Token 使用统计
const getTokenUsage = async (options?: {
  subAgent?: string;
  provider?: string;
  startTime?: string;
  endTime?: string;
}) => {
  const params = new URLSearchParams();
  if (options?.subAgent) params.append('subAgent', options.subAgent);
  if (options?.provider) params.append('provider', options.provider);
  if (options?.startTime) params.append('startTime', options.startTime);
  if (options?.endTime) params.append('endTime', options.endTime);
  
  const url = `http://localhost:3000/api/llm/usage${params.toString() ? '?' + params.toString() : ''}`;
  const response = await fetch(url);
  const result = await response.json();
  return result.data;
};

// 成本统计
const getCost = async (options?: {
  subAgent?: string;
  provider?: string;
  startTime?: string;
  endTime?: string;
}) => {
  const params = new URLSearchParams();
  if (options?.subAgent) params.append('subAgent', options.subAgent);
  if (options?.provider) params.append('provider', options.provider);
  if (options?.startTime) params.append('startTime', options.startTime);
  if (options?.endTime) params.append('endTime', options.endTime);
  
  const url = `http://localhost:3000/api/llm/cost${params.toString() ? '?' + params.toString() : ''}`;
  const response = await fetch(url);
  const result = await response.json();
  return result.data;
};

// 文档列表管理
const getDocuments = async (options?: {
  collection?: string;
  countryCode?: string;
  tags?: string;
  page?: number;
  pageSize?: number;
  search?: string;
}) => {
  const params = new URLSearchParams();
  if (options?.collection) params.append('collection', options.collection);
  if (options?.countryCode) params.append('countryCode', options.countryCode);
  if (options?.tags) params.append('tags', options.tags);
  if (options?.page) params.append('page', options.page.toString());
  if (options?.pageSize) params.append('pageSize', options.pageSize.toString());
  if (options?.search) params.append('search', options.search);
  
  const url = `http://localhost:3000/api/rag/documents${params.toString() ? '?' + params.toString() : ''}`;
  const response = await fetch(url);
  const result = await response.json();
  return result.data;
};

// 获取文档详情
const getDocument = async (id: string) => {
  const response = await fetch(`http://localhost:3000/api/rag/documents/${id}`);
  const result = await response.json();
  return result.data;
};

// 更新文档
const updateDocument = async (id: string, data: Partial<DocumentIndexItem>) => {
  const response = await fetch(`http://localhost:3000/api/rag/documents/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  return result.data;
};

// 删除文档
const deleteDocument = async (id: string) => {
  const response = await fetch(`http://localhost:3000/api/rag/documents/${id}`, {
    method: 'DELETE',
  });
  const result = await response.json();
  return result.data;
};

---

## 接口分类总结

### 前端用户系统 API（公开接口）

| 端点 | 方法 | 说明 | 用途 |
|------|------|------|------|
| `/rag/retrieve` | GET | 检索文档 | 用户搜索知识库 |
| `/rag/search` | POST | RAG 搜索 | 用户搜索知识库（支持复杂参数） |
| `/rag/stats` | GET | RAG 统计 | 查看知识库统计（可选） |
| `/rag/index` | POST | 索引文档 | 用户提交内容（如UGC） |
| `/rag/index/batch` | POST | 批量索引文档 | 批量提交内容 |
| `/rag/compliance/rail-pass` | POST | 提取 Rail Pass 规则 | 查询铁路通票规则 |
| `/rag/compliance/trail-access` | POST | 提取 Trail Access 规则 | 查询步道访问规则 |
| `/rag/route-narrative/:id` | GET | 生成路线叙事 | 获取路线描述 |
| `/rag/local-insight` | GET | 获取当地洞察 | 获取当地信息 |
| `/rag/chat/answer-route-question` | POST | 回答路线问题 | 路线问答 |
| `/rag/extract-compliance-rules` | POST | 提取行程合规规则 | 生成合规清单 |

### 后端管理系统 API（需要认证）

| 端点 | 方法 | 说明 | 用途 |
|------|------|------|------|
| `/rag/compliance/refresh` | POST | 刷新合规规则缓存 | 管理员刷新规则缓存 |
| `/rag/local-insight/refresh` | POST | 刷新当地洞察缓存 | 管理员刷新洞察缓存 |
| `/rag/segment-narrative` | POST | 生成路线段叙事 | 管理员生成路线段描述 |
| `/rag/chat/explain-why-not-other-route` | POST | 解释路线选择 | 管理员查看路线对比 |
| `/rag/destination-insights` | GET | 获取目的地深度信息 | 管理员查看目的地信息 |
| `/rag/documents` | GET | 文档列表 | 管理员查看和管理文档列表 |
| `/rag/documents/:id` | GET | 获取文档详情 | 管理员查看文档完整内容 |
| `/rag/documents/:id` | PUT | 更新文档 | 管理员更新文档内容 |
| `/rag/documents/:id` | DELETE | 删除文档 | 管理员删除文档 |
| `/llm/models` | GET | 获取可用模型列表 | 管理员查看模型配置 |
| `/llm/usage` | GET | Token 使用统计 | 管理员监控 Token 使用 |
| `/llm/cost` | GET | 成本统计 | 管理员监控成本 |

---

## 注意事项

1. **认证**: 
   - **前端用户系统接口**（标记为 `@Public()`）：所有用户都可以访问，无需认证
   - **后端管理系统接口**（未标记 `@Public()`）：需要管理员权限和认证
   - 在生产环境中，建议为所有管理类接口添加适当的认证和授权机制

2. **时间格式**: 时间参数必须使用 ISO 8601 格式（如：`2025-01-20T00:00:00Z`）。

3. **成本计算**: 成本统计基于 Token 使用数据和各提供商的定价配置。定价配置会定期更新，实际成本可能因提供商定价变化而有所不同。

4. **数据范围**: Token 使用统计和成本统计基于内存中的数据。如果服务重启，历史数据可能会丢失。建议在生产环境中将数据持久化到数据库。

5. **性能**: RAG 搜索使用向量相似度搜索，对于大型知识库可能需要一定时间。建议设置合理的 `limit` 参数。

6. **向量嵌入服务**: 
   - RAG 索引和搜索功能依赖向量嵌入服务（OpenAI Embedding API）。
   - 如果嵌入服务不可用，系统会降级到关键词搜索模式。
   - 确保 `OPENAI_API_KEY` 环境变量已正确配置。

7. **路线叙事接口**: 
   - `/rag/route-narrative/:routeDirectionId` 参数必须是有效的数字 ID。
   - 如果传入非数字 ID（如 "route-123"），接口会返回占位叙事而非报错。

8. **LLM 依赖接口**: 
   - 部分接口（如 `/rag/chat/answer-route-question`, `/rag/extract-compliance-rules`）需要调用 LLM。
   - 这些接口的响应时间取决于 LLM API 的响应速度，可能较长。
   - 建议客户端设置适当的超时时间（推荐 60 秒以上）。

---

*文档由 rl-infra 团队维护*
