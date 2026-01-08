# Cities API 模块

城市 API 模块，提供城市查询和搜索功能，支持创建行程时选择城市。

## 接口列表

### 1. 获取城市列表

**GET** `/cities`

获取城市列表，支持按国家代码过滤和关键词搜索。

#### 查询参数

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| `countryCode` | string | 否 | 国家代码（ISO 3166-1 alpha-2） | `JP` |
| `q` | string | 否 | 搜索关键词（支持中文名、英文名、名称） | `东京` |
| `limit` | number | 否 | 返回数量限制（默认 50） | `50` |
| `offset` | number | 否 | 偏移量（用于分页，默认 0） | `0` |

#### 请求示例

```bash
# 获取日本的所有城市
GET /cities?countryCode=JP

# 搜索城市（支持中文、英文）
GET /cities?q=东京&countryCode=JP
GET /cities?q=Tokyo&countryCode=JP

# 分页查询
GET /cities?countryCode=JP&limit=20&offset=0
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "cities": [
      {
        "id": 1,
        "name": "Tokyo",
        "countryCode": "JP",
        "nameCN": "东京",
        "nameEN": "Tokyo",
        "adcode": "131000",
        "timezone": "Asia/Tokyo",
        "lat": 35.6762,
        "lng": 139.6503,
        "metadata": {}
      }
    ],
    "total": 1,
    "countryCode": "JP",
    "totalInCountry": 100
  }
}
```

### 2. 获取城市详情

**GET** `/cities/:id`

根据城市 ID 获取完整的城市信息。

#### 路径参数

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| `id` | number | 是 | 城市 ID | `1` |

#### 请求示例

```bash
GET /cities/1
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Tokyo",
    "countryCode": "JP",
    "nameCN": "东京",
    "nameEN": "Tokyo",
    "adcode": "131000",
    "timezone": "Asia/Tokyo",
    "lat": 35.6762,
    "lng": 139.6503,
    "metadata": {}
  }
}
```

## 功能特性

### 1. 多语言搜索

支持使用中文名、英文名或通用名称搜索城市：

- 中文搜索：`q=东京` → 匹配 `nameCN` 字段
- 英文搜索：`q=Tokyo` → 匹配 `nameEN` 字段
- 通用搜索：`q=Tokyo` → 匹配 `name` 字段

### 2. 不区分大小写

所有搜索都是不区分大小写的，使用 PostgreSQL 的 `LOWER()` 函数实现。

### 3. 坐标提取

自动从 PostGIS `location` 字段提取经纬度坐标，支持多种格式：
- 字符串格式：`POINT(lng lat)`
- 对象格式：`{ coordinates: [lng, lat] }`
- 对象格式：`{ lat, lng }`

### 4. 分页支持

支持 `limit` 和 `offset` 参数进行分页查询。

## 数据库模型

城市数据存储在 `City` 表中，包含以下字段：

- `id`: 城市 ID（主键）
- `name`: 城市名称
- `countryCode`: 国家代码（ISO 3166-1 alpha-2）
- `nameCN`: 中文名称
- `nameEN`: 英文名称
- `adcode`: 行政区划代码
- `location`: PostGIS geography 类型（坐标）
- `timezone`: 时区
- `metadata`: 扩展元数据（JSON）

## 测试

运行测试脚本：

```bash
npx ts-node scripts/test-cities-api.ts [baseUrl]
```

示例：

```bash
# 使用默认 URL (http://localhost:3000)
npx ts-node scripts/test-cities-api.ts

# 使用自定义 URL
npx ts-node scripts/test-cities-api.ts http://localhost:3001
```

## 使用场景

### 场景 1: 创建行程时选择城市

```typescript
// 1. 获取某个国家的所有城市
const response = await fetch('/cities?countryCode=JP');
const { cities } = await response.json();

// 2. 用户选择城市后，获取城市详情
const cityDetail = await fetch(`/cities/${selectedCityId}`);
```

### 场景 2: 城市搜索

```typescript
// 用户输入"东京"，搜索匹配的城市
const response = await fetch('/cities?q=东京&countryCode=JP');
const { cities } = await response.json();
```

## 文件结构

```
src/cities/
├── cities.controller.ts    # 控制器（路由定义）
├── cities.service.ts       # 服务（业务逻辑）
├── cities.module.ts        # 模块定义
├── dto/
│   └── city.dto.ts        # 数据传输对象
└── README.md              # 本文档
```

## 相关模块

- `PrismaModule`: 数据库访问
- `CountriesModule`: 国家档案模块（相关）
