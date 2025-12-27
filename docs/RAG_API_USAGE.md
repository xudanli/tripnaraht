# RAG API 使用指南

## 概述

RAG 模块提供了完整的 API 端点，用于文档检索、合规规则提取、路线叙事生成和当地洞察查询。

## 基础端点

### 1. 文档检索

**端点**: `GET /rag/retrieve`

**参数**:
- `query` (required): 检索查询文本
- `collection` (required): 文档集合名称（如 'rail_pass_rules', 'travel_guides', 'local_insights'）
- `countryCode` (optional): 国家代码过滤
- `limit` (optional): 返回结果数量（默认 10）

**示例**:
```bash
curl "http://localhost:3000/rag/retrieve?query=Eurail Global Pass rules for Iceland&collection=rail_pass_rules&countryCode=IS&limit=10"
```

**响应**:
```json
[
  {
    "id": "uuid",
    "content": "文档内容...",
    "title": "文档标题",
    "source": "来源 URL",
    "score": 0.85,
    "metadata": {}
  }
]
```

### 2. 索引文档

**端点**: `POST /rag/index`

**请求体**:
```json
{
  "collection": "rail_pass_rules",
  "title": "Eurail Global Pass Rules",
  "content": "完整的文档内容...",
  "source": "https://www.eurail.com/...",
  "countryCode": "IS",
  "tags": ["eurail", "global", "iceland"],
  "metadata": {}
}
```

**响应**:
```json
{
  "id": "uuid",
  "success": true
}
```

### 3. 批量索引文档

**端点**: `POST /rag/index/batch`

**请求体**:
```json
[
  {
    "collection": "travel_guides",
    "title": "Iceland Highlands Guide",
    "content": "...",
    "countryCode": "IS",
    "tags": ["iceland", "highlands"]
  },
  {
    "collection": "travel_guides",
    "title": "Nepal EBC Guide",
    "content": "...",
    "countryCode": "NP",
    "tags": ["nepal", "ebc", "hiking"]
  }
]
```

**响应**:
```json
{
  "ids": ["uuid1", "uuid2"],
  "success": true,
  "count": 2
}
```

## 合规规则提取

### 1. 提取 Rail Pass 规则

**端点**: `POST /rag/compliance/rail-pass`

**请求体**:
```json
{
  "passType": "EURAIL_GLOBAL",
  "countryCode": "IS"
}
```

**响应**:
```json
[
  {
    "passType": "EURAIL_GLOBAL",
    "eligibleTraveler": {
      "regions": ["Europe"],
      "citizenship": []
    },
    "validCountries": ["IS", "NO", "SE"],
    "requiresReservation": true,
    "seatReservationFee": 5,
    "notValidOn": ["某些列车类型"],
    "seasonalRestrictions": {
      "months": [11, 12, 1, 2],
      "reason": "冬季服务减少"
    }
  }
]
```

### 2. 提取 Trail Access 规则

**端点**: `POST /rag/compliance/trail-access`

**请求体**:
```json
{
  "trailId": "iceland-highlands-f26",
  "countryCode": "IS"
}
```

**响应**:
```json
[
  {
    "trailId": "iceland-highlands-f26",
    "requiresPermit": false,
    "permitType": null,
    "bookingRequired": false,
    "seasonalClosure": {
      "months": [11, 12, 1, 2, 3, 4],
      "reason": "冬季封路"
    }
  }
]
```

### 3. 刷新合规规则

**端点**: `POST /rag/compliance/refresh`

**说明**: 手动触发定时任务，更新所有合规规则

**响应**:
```json
{
  "success": true,
  "message": "Compliance rules refresh started"
}
```

## 路线叙事生成

### 1. 生成路线叙事

**端点**: `GET /rag/route-narrative/:routeDirectionId`

**参数**:
- `routeDirectionId` (path): 路线方向 ID
- `countryCode` (query, optional): 国家代码

**示例**:
```bash
curl "http://localhost:3000/rag/route-narrative/1?countryCode=IS"
```

**响应**:
```json
{
  "routeDirectionId": "1",
  "philosophyExplanation": "这条路线从文明进入高地，再回到人间...",
  "whyThisRoute": [
    "独特的冰岛高地体验",
    "F-road 穿越的刺激感",
    "温泉和火山景观"
  ],
  "whatToExpect": [
    "碎石路和颠簸",
    "壮观的火山景观",
    "高地小屋住宿体验"
  ],
  "commonMistakes": [
    "没有准备 4x4 车辆",
    "低估天气变化",
    "没有带足够的食物"
  ],
  "evidenceSnippets": [
    "F-roads are typically open from mid-June...",
    "4x4 vehicles are required..."
  ]
}
```

### 2. 生成路线段叙事

**端点**: `POST /rag/segment-narrative`

**请求体**:
```json
{
  "segmentId": "segment-1",
  "dayIndex": 1,
  "name": "Reykjavik to Landmannalaugar",
  "description": "从雷克雅未克出发，前往高地起点",
  "countryCode": "IS"
}
```

**响应**:
```json
{
  "segmentId": "segment-1",
  "dayIndex": 1,
  "storyText": "第一天从雷克雅未克出发，沿途可以看到...",
  "practicalTips": [
    "记得在雷克雅未克加满油",
    "准备足够的现金（高地没有 ATM）",
    "下载离线地图"
  ],
  "localInsights": [
    "高地小屋通常需要提前预订",
    "当地人对 F-road 驾驶很有经验"
  ],
  "evidenceSnippets": [
    "The drive from Reykjavik to Landmannalaugar...",
    "Make sure to fill up your tank..."
  ]
}
```

## 当地洞察

### 1. 获取当地洞察

**端点**: `GET /rag/local-insight`

**参数**:
- `countryCode` (required): 国家代码
- `tags` (required): 标签（逗号分隔或数组）
- `region` (optional): 地区名称

**示例**:
```bash
curl "http://localhost:3000/rag/local-insight?countryCode=IS&tags=f_road,highlands&region=Highlands"
```

**响应**:
```json
[
  {
    "countryCode": "IS",
    "region": "Highlands",
    "tags": ["f_road", "highlands"],
    "content": "冰岛 F-road 通常在 6 月中旬到 9 月中旬开放，但具体日期取决于积雪情况。大多数 F-road 要求 4x4 车辆，且不允许拖车。",
    "evidenceSnippets": [
      "F-roads are typically open from mid-June to mid-September...",
      "4x4 vehicles are required for all F-roads..."
    ],
    "confidence": "HIGH",
    "source": "https://..."
  }
]
```

### 2. 刷新当地洞察

**端点**: `POST /rag/local-insight/refresh`

**请求体**:
```json
{
  "countryCode": "IS",
  "tags": ["f_road", "highlands"],
  "region": "Highlands"
}
```

**说明**: 删除旧的洞察并重新生成

**响应**: 返回新的 LocalInsight 数组

## 错误处理

所有端点都可能返回以下错误：

**400 Bad Request**: 请求参数错误
```json
{
  "statusCode": 400,
  "message": "Invalid parameters",
  "error": "Bad Request"
}
```

**500 Internal Server Error**: 服务器内部错误
```json
{
  "statusCode": 500,
  "message": "Internal server error",
  "error": "Internal Server Error"
}
```

## 最佳实践

1. **文档索引**: 在系统初始化时批量索引文档，建立知识库
2. **缓存利用**: 当地洞察有 30 天缓存，避免频繁查询
3. **定时任务**: 合规规则每周日自动更新，无需手动触发
4. **错误处理**: 所有端点都有错误处理，失败时返回空数组或默认值

## 下一步

1. 集成到用户对话层（Chat Service）
2. 添加监控和优化机制
3. 建立置信度评估系统

