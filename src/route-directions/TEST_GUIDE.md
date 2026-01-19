# 路线模块 CRUD 接口测试指南

本文档说明如何测试路线模块的 CRUD 接口。

## 前置条件

1. **服务器运行**: 确保 NestJS 服务器正在运行
   ```bash
   npm run dev
   # 或
   npm run start
   ```

2. **数据库连接**: 确保数据库连接正常，`RouteDirection` 和 `RouteTemplate` 表已创建

3. **端口**: 默认端口为 3000，可通过 `PORT` 环境变量修改

## 运行测试

### 方法 1: 使用 npm 脚本

```bash
npm run test:route-crud
```

### 方法 2: 直接运行 TypeScript 文件

```bash
ts-node scripts/test-route-crud-api.ts
```

### 方法 3: 指定 API 地址

```bash
API_URL=http://localhost:3000 ts-node scripts/test-route-crud-api.ts
```

## 测试内容

测试脚本会依次测试以下接口：

### 1. 路线方向（RouteDirection）CRUD

- ✅ **创建路线方向**: `POST /route-directions`
- ✅ **查询路线方向列表**: `GET /route-directions?countryCode=IS&isActive=true`
- ✅ **根据ID获取路线方向**: `GET /route-directions/:id`
- ✅ **根据UUID获取路线方向**: `GET /route-directions/uuid/:uuid`
- ✅ **更新路线方向**: `PUT /route-directions/:id`
- ✅ **根据国家获取路线方向**: `GET /route-directions/by-country/:countryCode`
- ✅ **删除路线方向**: `DELETE /route-directions/:id` (软删除)

### 2. 路线模板（RouteTemplate）CRUD

- ✅ **创建路线模板**: `POST /route-directions/templates`
- ✅ **查询路线模板列表**: `GET /route-directions/templates?routeDirectionId=1&isActive=true`
- ✅ **根据ID获取路线模板**: `GET /route-directions/templates/:id`
- ✅ **更新路线模板**: `PUT /route-directions/templates/:id`
- ✅ **删除路线模板**: `DELETE /route-directions/templates/:id` (软删除)

## 测试输出示例

```
🧪 开始测试路线模块 CRUD 接口...

📍 API 地址: http://localhost:3000/route-directions

🔍 检查服务器状态...
✅ 服务器运行正常

📋 1. 路线方向（RouteDirection）CRUD 测试

  ➕ 测试创建路线方向...
    ✅ 创建路线方向: 成功
    📌 创建的路线方向 ID: 1, UUID: 550e8400-e29b-41d4-a716-446655440000

  📋 测试查询路线方向列表...
    ✅ 查询路线方向列表: 成功，返回 1 条记录

  🔍 测试根据ID获取路线方向...
    ✅ 根据ID获取路线方向: 成功

  🔍 测试根据UUID获取路线方向...
    ✅ 根据UUID获取路线方向: 成功

  ✏️  测试更新路线方向...
    ✅ 更新路线方向: 成功

  🌍 测试根据国家获取路线方向...
    ✅ 根据国家获取路线方向: 成功

  🗑️  测试删除路线方向（软删除）...
    ✅ 删除路线方向: 成功

📋 2. 路线模板（RouteTemplate）CRUD 测试

  ➕ 测试创建路线模板...
    ✅ 创建路线模板: 成功
    📌 创建的路线模板 ID: 1

  📋 测试查询路线模板列表...
    ✅ 查询路线模板列表: 成功，返回 1 条记录

  🔍 测试根据ID获取路线模板...
    ✅ 根据ID获取路线模板: 成功

  ✏️  测试更新路线模板...
    ✅ 更新路线模板: 成功

  🗑️  测试删除路线模板（软删除）...
    ✅ 删除路线模板: 成功

📊 测试结果汇总
============================================================
总计: 12 个测试
✅ 成功: 12
❌ 失败: 0
============================================================
```

## 使用 curl 手动测试

如果不想运行完整的测试脚本，也可以使用 curl 手动测试各个接口：

### 创建路线方向

```bash
curl -X POST http://localhost:3000/route-directions \
  -H "Content-Type: application/json" \
  -d '{
    "countryCode": "IS",
    "name": "Test Route",
    "nameCN": "测试路线",
    "nameEN": "Test Route",
    "tags": ["test"],
    "isActive": true
  }'
```

### 查询路线方向列表

```bash
curl http://localhost:3000/route-directions?countryCode=IS&isActive=true
```

### 根据ID获取路线方向

```bash
curl http://localhost:3000/route-directions/1
```

### 更新路线方向

```bash
curl -X PUT http://localhost:3000/route-directions/1 \
  -H "Content-Type: application/json" \
  -d '{
    "nameCN": "更新后的名称",
    "description": "更新后的描述"
  }'
```

### 删除路线方向

```bash
curl -X DELETE http://localhost:3000/route-directions/1
```

## 注意事项

1. **无需认证**: 所有 CRUD 接口都使用 `@Public()` 装饰器，无需提供认证 token

2. **软删除**: 删除操作是软删除，只是设置 `isActive = false`，不会真正删除数据

3. **数据清理**: 测试脚本会创建测试数据，测试完成后会删除（软删除）

4. **错误处理**: 如果测试失败，会显示详细的错误信息

5. **服务器检查**: 测试开始前会自动检查服务器是否运行

## 故障排查

### 服务器未运行

```
❌ 服务器未运行或无法访问！
   请确保服务器正在运行在 http://localhost:3000
   启动服务器: npm run dev
```

**解决方案**: 启动服务器后再运行测试

### 数据库连接错误

如果看到数据库相关的错误，检查：
1. `DATABASE_URL` 环境变量是否正确设置
2. 数据库是否正在运行
3. `RouteDirection` 和 `RouteTemplate` 表是否已创建（运行迁移）

### 端口被占用

如果端口 3000 被占用，可以：
1. 修改服务器端口: `PORT=3001 npm run dev`
2. 运行测试时指定端口: `API_URL=http://localhost:3001 npm run test:route-crud`

## 相关文档

- [CRUD API 文档](./ROUTE_CRUD_API.md) - 完整的 API 接口文档
- [路线方向接口文档](./FRONTEND_API.md) - 前端接口文档
- [路线模板接口文档](./ROUTE_TEMPLATE_API.md) - 路线模板接口文档
