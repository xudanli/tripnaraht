# 测试运行指南

## 快速开始

### 1. 确保服务正在运行

```bash
# 检查服务状态
ps aux | grep "node.*dist/src/main" | grep -v grep

# 如果服务未运行，启动服务
npm run start:dev
```

服务启动后，你应该看到：
```
🚀 Application is running on: http://localhost:3000
📚 Swagger 文档: http://localhost:3000/api
```

### 2. 运行测试脚本

```bash
# 运行完整的测试脚本
./test-us-mapbox.sh

# 或者使用超时控制（60秒）
timeout 60 ./test-us-mapbox.sh
```

### 3. 测试单个端点

```bash
# 测试冰岛（更小的国家，响应更快）
curl "http://127.0.0.1:3000/places/overpass/IS?tourismTypes=attraction"

# 测试美国（可能需要较长时间）
curl "http://127.0.0.1:3000/places/overpass/US?tourismTypes=attraction"

# 查看详细响应
curl -v "http://127.0.0.1:3000/places/overpass/IS?tourismTypes=attraction"
```

### 4. 查看 Swagger API 文档

在浏览器中打开：
```
http://localhost:3000/api
```

## 测试脚本说明

### 测试脚本功能

`test-us-mapbox.sh` 会测试以下端点：
- `GET /places/overpass/US?tourismTypes=attraction` - 获取美国景点
- `GET /places/overpass/US?tourismTypes=museum` - 获取美国博物馆
- `GET /places/overpass/US?tourismTypes=attraction,museum,viewpoint` - 获取所有类型

### 测试脚本特性

- ✅ 正确的 HTTP 状态码提取
- ✅ 超时处理（30秒）
- ✅ JSON 格式化输出
- ✅ 错误信息显示

## 常见问题

### 问题 1: 服务未运行

**症状**: 测试返回 `000` 状态码或连接错误

**解决**:
```bash
npm run start:dev
```

### 问题 2: 请求超时

**症状**: 测试显示 `000` 状态码，curl 错误显示超时

**可能原因**:
- Google Places API 响应慢
- 网络连接问题
- API Key 未配置或无效

**解决**:
1. 检查 API Key 配置：
   ```bash
   grep GOOGLE_PLACES_API_KEY .env
   ```

2. 测试更小的国家（如冰岛）：
   ```bash
   curl "http://127.0.0.1:3000/places/overpass/IS?tourismTypes=attraction"
   ```

3. 检查服务日志，查看是否有错误信息

### 问题 3: 服务需要重新编译

**症状**: 代码已修改但行为未改变

**解决**:
1. 停止服务（Ctrl+C）
2. 重新启动：
   ```bash
   npm run start:dev
   ```

## 超时配置

### 客户端超时（测试脚本）
- 连接超时: 3 秒
- 总超时: 30 秒

### 服务端超时
- 控制器层: 45 秒（返回 504）
- 服务层: 50 秒（返回部分结果）

## 测试结果解读

### 成功响应
- 状态码: `200`
- 返回 JSON 数组，包含景点数据

### 超时响应
- 状态码: `000`（客户端超时）或 `504`（服务端超时）
- 可能原因: Google Places API 响应慢或网络问题

### 错误响应
- 状态码: `400`, `404`, `500` 等
- 查看响应体获取详细错误信息

## 性能优化建议

1. **使用更小的测试数据集**
   - 优先测试小国家（如冰岛 IS）
   - 减少 `tourismTypes` 数量

2. **分批测试**
   - 分别测试不同类型的景点
   - 避免一次性请求所有类型

3. **监控服务日志**
   - 查看服务端处理时间
   - 检查是否有 API 错误

