# 城市 API 测试结果

## 接口实现状态 ✅

所有三个接口已成功实现：

1. ✅ **GET /api/cities?countryCode=JP** - 获取某个国家的所有城市
2. ✅ **GET /api/cities?q=东京&countryCode=JP** - 搜索城市
3. ✅ **GET /api/cities/:id** - 获取城市详情

## 测试方法

### 方法 1: 使用测试脚本（推荐）

```bash
# 确保服务器正在运行
npm run start:dev

# 在另一个终端运行测试
npx ts-node scripts/test-cities-api.ts http://localhost:3000
```

### 方法 2: 使用 curl 命令

```bash
# 1. 获取某个国家的所有城市
curl "http://localhost:3000/api/cities?countryCode=JP&limit=5"

# 2. 搜索城市
curl "http://localhost:3000/api/cities?q=Tokyo&countryCode=JP&limit=3"

# 3. 获取城市详情（先获取一个城市 ID）
CITY_ID=$(curl -s "http://localhost:3000/api/cities?countryCode=JP&limit=1" | jq -r '.data.cities[0].id')
curl "http://localhost:3000/api/cities/$CITY_ID"
```

### 方法 3: 使用 Swagger 文档

访问 Swagger UI 进行交互式测试：
```
http://localhost:3000/api-docs
```

在 Swagger UI 中找到 `cities` 标签，可以测试所有接口。

## 接口详情

### 1. 获取城市列表

**请求：**
```http
GET /api/cities?countryCode=JP&limit=10&offset=0
```

**响应示例：**
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
        "timezone": "Asia/Tokyo",
        "lat": 35.6762,
        "lng": 139.6503
      }
    ],
    "total": 10,
    "countryCode": "JP",
    "totalInCountry": 100
  }
}
```

### 2. 搜索城市

**请求：**
```http
GET /api/cities?q=Tokyo&countryCode=JP&limit=10
```

**功能：**
- 支持中文名、英文名、通用名称搜索
- 不区分大小写
- 支持模糊匹配（LIKE 查询）

**响应格式：** 与获取城市列表相同

### 3. 获取城市详情

**请求：**
```http
GET /api/cities/1
```

**响应示例：**
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

✅ **多语言支持**：支持中文名、英文名搜索  
✅ **不区分大小写**：所有搜索都不区分大小写  
✅ **分页支持**：支持 `limit` 和 `offset` 参数  
✅ **坐标提取**：自动从 PostGIS `location` 字段提取经纬度  
✅ **统一响应格式**：使用 `successResponse` 和 `errorResponse`  
✅ **Swagger 文档**：完整的 API 文档  
✅ **公开访问**：使用 `@Public()` 装饰器，无需认证  

## 注意事项

1. **全局 API 前缀**：所有接口路径以 `/api` 开头
2. **服务器必须运行**：测试前确保 NestJS 服务器正在运行
3. **数据库连接**：确保数据库连接正常，City 表有数据

## 启动服务器

```bash
# 开发模式
npm run start:dev

# 生产模式
npm run start:prod
```

## 验证服务器运行

```bash
# 检查端口
netstat -tlnp | grep :3000
# 或
ss -tlnp | grep :3000

# 测试健康检查接口（如果有）
curl http://localhost:3000/api/system/health
```
