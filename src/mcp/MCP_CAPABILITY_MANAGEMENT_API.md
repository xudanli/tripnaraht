# MCP 能力管理 API 文档

## 概述

MCP 能力管理 API 提供统一接口来控制各个 MCP 能力的开启和关闭。管理员可以通过 REST API 动态管理所有 MCP 服务的启用状态。

## 基础路径

```
/mcp/capabilities
```

**说明**：此 API 用于统一管理所有 MCP（Model Context Protocol）能力的启用和禁用状态。管理员可以通过这些接口动态控制各个 MCP 服务是否可用，无需重启服务即可生效（需要重启 MCP Server 才能完全生效）。

## API 端点

### 1. 获取所有能力列表

**GET** `/mcp/capabilities`

获取所有 MCP 能力的列表，支持过滤。

#### 查询参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `serviceName` | string | 否 | 按服务名称过滤 |
| `status` | enum | 否 | 按启用状态过滤 (`enabled` / `disabled`) |
| `category` | string | 否 | 按分类过滤 |

**响应字段说明**：
- `description`: 服务功能描述，用于列表显示，说明该 MCP 服务的主要功能和用途

#### 响应示例

```json
{
  "success": true,
  "data": [
    {
      "serviceName": "google_maps",
      "displayName": "Google Maps",
      "description": "Google Maps API 服务，提供地点搜索、路线规划、地理编码等功能",
      "enabled": true,
      "tools": [
        "google_maps.searchPlaces",
        "google_maps.geocode",
        "google_maps.getRoute",
        "google_maps.computeDistanceMatrix"
      ],
      "category": "mapping",
      "authRequired": false
    },
    {
      "serviceName": "weather",
      "displayName": "Weather",
      "description": "天气服务，提供当前天气和天气预报",
      "enabled": true,
      "tools": [
        "weather.getCurrentWeather",
        "weather.getWeatherByDatetimeRange",
        "weather.getCurrentDateTime"
      ],
      "category": "weather",
      "authRequired": false
    }
  ]
}
```

#### 示例请求

```bash
# 获取所有能力
curl http://localhost:3000/mcp/capabilities

# 只获取启用的能力
curl http://localhost:3000/mcp/capabilities?status=enabled

# 按分类过滤
curl http://localhost:3000/mcp/capabilities?category=mapping

# 获取特定服务
curl http://localhost:3000/mcp/capabilities?serviceName=google_maps
```

---

### 2. 获取能力统计信息

**GET** `/mcp/capabilities/statistics`

获取 MCP 能力的统计信息。

#### 响应示例

```json
{
  "success": true,
  "data": {
    "total": 14,
    "enabled": 12,
    "disabled": 2,
    "byCategory": {
      "mapping": {
        "total": 1,
        "enabled": 1,
        "disabled": 0
      },
      "weather": {
        "total": 1,
        "enabled": 1,
        "disabled": 0
      },
      "accommodation": {
        "total": 2,
        "enabled": 2,
        "disabled": 0
      }
    }
  }
}
```

#### 示例请求

```bash
curl http://localhost:3000/mcp/capabilities/statistics
```

---

### 3. 获取单个能力信息

**GET** `/mcp/capabilities/:serviceName`

根据服务名称获取单个能力的详细信息。

#### 路径参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `serviceName` | string | 是 | 服务名称 |

#### 响应示例

```json
{
  "success": true,
  "data": {
    "serviceName": "google_maps",
    "displayName": "Google Maps",
    "description": "Google Maps API 服务，提供地点搜索、路线规划、地理编码等功能",
    "enabled": true,
    "tools": [
      "google_maps.searchPlaces",
      "google_maps.geocode",
      "google_maps.getRoute",
      "google_maps.computeDistanceMatrix"
    ],
    "category": "mapping",
    "authRequired": false
  }
}
```

#### 示例请求

```bash
curl http://localhost:3000/mcp/capabilities/google_maps
```

---

### 4. 更新能力状态

**PUT** `/mcp/capabilities/:serviceName/status`

启用或禁用指定的 MCP 能力。

#### 路径参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `serviceName` | string | 是 | 服务名称 |

#### 请求体

```json
{
  "serviceName": "google_maps",
  "status": "enabled"
}
```

#### 请求体字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `serviceName` | string | 是 | 服务名称（必须与路径参数一致） |
| `status` | enum | 是 | 状态 (`enabled` / `disabled`) |

#### 响应示例

```json
{
  "success": true,
  "data": {
    "serviceName": "google_maps",
    "enabled": true
  }
}
```

#### 示例请求

```bash
# 启用能力
curl -X PUT http://localhost:3000/mcp/capabilities/google_maps/status \
  -H "Content-Type: application/json" \
  -d '{
    "serviceName": "google_maps",
    "status": "enabled"
  }'

# 禁用能力
curl -X PUT http://localhost:3000/mcp/capabilities/google_maps/status \
  -H "Content-Type: application/json" \
  -d '{
    "serviceName": "google_maps",
    "status": "disabled"
  }'
```

---

### 5. 批量更新能力状态

**POST** `/mcp/capabilities/batch-update`

批量启用或禁用多个 MCP 能力。

#### 请求体

```json
{
  "updates": [
    {
      "serviceName": "google_maps",
      "status": "enabled"
    },
    {
      "serviceName": "weather",
      "status": "disabled"
    },
    {
      "serviceName": "stripe",
      "status": "enabled"
    }
  ]
}
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "success": 3,
    "failed": 0,
    "results": [
      {
        "serviceName": "google_maps",
        "success": true
      },
      {
        "serviceName": "weather",
        "success": true
      },
      {
        "serviceName": "stripe",
        "success": true
      }
    ]
  }
}
```

#### 示例请求

```bash
curl -X POST http://localhost:3000/mcp/capabilities/batch-update \
  -H "Content-Type: application/json" \
  -d '{
    "updates": [
      {
        "serviceName": "google_maps",
        "status": "enabled"
      },
      {
        "serviceName": "weather",
        "status": "disabled"
      }
    ]
  }'
```

---

### 6. 检查能力是否启用

**GET** `/mcp/capabilities/:serviceName/enabled`

检查指定的 MCP 能力是否已启用。

#### 路径参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `serviceName` | string | 是 | 服务名称 |

#### 响应示例

```json
{
  "success": true,
  "data": {
    "serviceName": "google_maps",
    "enabled": true
  }
}
```

#### 示例请求

```bash
curl http://localhost:3000/mcp/capabilities/google_maps/enabled
```

---

### 7. 重置所有能力为默认状态

**POST** `/mcp/capabilities/reset`

将所有 MCP 能力重置为默认的启用/禁用状态。

#### 响应示例

```json
{
  "success": true,
  "data": {
    "message": "All capabilities reset to default state"
  }
}
```

#### 示例请求

```bash
curl -X POST http://localhost:3000/mcp/capabilities/reset
```

---

## 支持的服务列表

| 服务名称 | 显示名称 | 描述 | 分类 | 默认启用 |
|---------|---------|------|------|---------|
| `google_maps` | Google Maps | Google Maps API 服务，提供地点搜索、路线规划、地理编码等功能 | mapping | ✅ |
| `weather` | Weather | 天气服务，提供当前天气和天气预报 | weather | ✅ |
| `postgresql` | PostgreSQL | PostgreSQL 数据库查询服务 | database | ✅ |
| `airbnb` | Airbnb | Airbnb 房源搜索服务 | accommodation | ✅ |
| `rail` | Rail | 铁路查询服务 | transportation | ✅ |
| `file_extractor` | File Extractor | 文件内容提取服务 | utility | ✅ |
| `stripe` | Stripe | Stripe 支付服务 | payment | ✅ |
| `browserbase` | Browserbase | Browserbase 浏览器自动化服务 | automation | ✅ |
| `currency` | Currency Exchange | 货币汇率转换服务 | finance | ✅ |
| `hotel` | Hotel | 酒店搜索服务 | accommodation | ✅ |
| `restaurant` | Restaurant | 餐厅搜索服务 | dining | ✅ |
| `translation` | Translation | 翻译服务 | utility | ✅ |
| `image` | Image Search | 图片搜索服务 | media | ✅ |
| `vision` | Vision Service | 视觉识别服务，提供 OCR 和 POI 识别 | vision | ✅ |

---

## 使用场景

### 1. 临时禁用某个服务

当某个服务出现问题或需要维护时，可以临时禁用它：

```bash
curl -X PUT http://localhost:3000/mcp/capabilities/stripe/status \
  -H "Content-Type: application/json" \
  -d '{"serviceName": "stripe", "status": "disabled"}'
```

### 2. 批量禁用多个服务

在系统维护期间，可以批量禁用多个服务：

```bash
curl -X POST http://localhost:3000/mcp/capabilities/batch-update \
  -H "Content-Type: application/json" \
  -d '{
    "updates": [
      {"serviceName": "stripe", "status": "disabled"},
      {"serviceName": "browserbase", "status": "disabled"}
    ]
  }'
```

### 3. 查看所有启用的服务

```bash
curl http://localhost:3000/mcp/capabilities?status=enabled
```

### 4. 查看统计信息

```bash
curl http://localhost:3000/mcp/capabilities/statistics
```

---

## 注意事项

1. **状态持久化**：✅ 已实现数据库持久化存储，使用 PostgreSQL 数据库。所有能力状态变更都会保存到数据库，重启后状态会保持。

2. **MCP Server 重启**：修改能力状态后，需要重启 MCP Server 才能生效（因为工具注册发生在启动时）。

3. **默认状态**：所有服务的默认状态都是启用（`enabled: true`），除非在代码中明确指定。首次启动时会自动在数据库中创建所有能力的默认记录。

4. **错误处理**：如果尝试禁用不存在的服务，API 会返回 404 错误。

5. **性能优化**：服务使用内存缓存来提高查询性能，同时保证数据一致性。数据库操作失败时会自动降级到内存缓存。

---

## 集成示例

### JavaScript/TypeScript

```typescript
// 禁用 Stripe 服务
async function disableStripe() {
  const response = await fetch('http://localhost:3000/mcp/capabilities/stripe/status', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      serviceName: 'stripe',
      status: 'disabled',
    }),
  });
  
  const result = await response.json();
  console.log('Stripe disabled:', result);
}

// 获取所有启用的能力
async function getEnabledCapabilities() {
  const response = await fetch('http://localhost:3000/mcp/capabilities?status=enabled');
  const result = await response.json();
  return result.data;
}
```

### Python

```python
import requests

# 禁用 Stripe 服务
def disable_stripe():
    response = requests.put(
        'http://localhost:3000/mcp/capabilities/stripe/status',
        json={
            'serviceName': 'stripe',
            'status': 'disabled'
        }
    )
    return response.json()

# 获取所有启用的能力
def get_enabled_capabilities():
    response = requests.get(
        'http://localhost:3000/mcp/capabilities',
        params={'status': 'enabled'}
    )
    return response.json()['data']
```

---

## 未来改进

1. **持久化存储**：将能力状态存储到数据库，支持跨重启持久化
2. **实时更新**：支持在不重启 MCP Server 的情况下动态启用/禁用能力
3. **权限控制**：添加管理员权限验证
4. **审计日志**：记录所有能力状态变更的历史
5. **健康检查**：自动检测服务可用性并更新状态
