# RAG 和 LLM 管理 API 测试指南

> 更新时间: 2026-01-21

本文档说明如何测试 RAG 和 LLM 管理 API 接口。

---

## 前置条件

1. **服务器运行**: 确保后端服务正在运行
   ```bash
   # 启动开发服务器
   npm run start:dev
   
   # 或启动生产服务器
   npm run start:prod
   ```

2. **服务器地址**: 默认地址为 `http://localhost:3000`，可通过环境变量 `API_BASE_URL` 修改

---

## 测试方法

### 方法 1: 使用 TypeScript 测试脚本（推荐）

```bash
# 使用 npm script
npm run test:rag-llm-admin-api

# 或直接使用 ts-node
npx ts-node scripts/test-rag-llm-admin-api.ts

# 指定服务器地址
API_BASE_URL=http://localhost:3000 npm run test:rag-llm-admin-api
```

### 方法 2: 使用 Shell 测试脚本

```bash
# 运行 Shell 脚本
./scripts/test-rag-llm-admin-api.sh

# 指定服务器地址
API_BASE_URL=http://localhost:3000 ./scripts/test-rag-llm-admin-api.sh
```

### 方法 3: 使用 cURL 手动测试

#### 1. RAG 搜索

```bash
curl -X POST http://localhost:3000/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "冰岛旅游攻略",
    "collection": "travel_guides",
    "countryCode": "IS",
    "limit": 5
  }'
```

#### 2. RAG 统计

```bash
# 所有集合
curl http://localhost:3000/api/rag/stats

# 指定集合
curl "http://localhost:3000/api/rag/stats?collection=travel_guides"
```

#### 3. 获取模型列表

```bash
curl http://localhost:3000/api/llm/models
```

#### 4. Token 使用统计

```bash
# 总体统计
curl http://localhost:3000/api/llm/usage

# 按时间范围
curl "http://localhost:3000/api/llm/usage?startTime=2025-01-20T00:00:00Z&endTime=2025-01-21T23:59:59Z"

# 按 Sub-Agent
curl "http://localhost:3000/api/llm/usage?subAgent=PlannerAgent"

# 按 Provider
curl "http://localhost:3000/api/llm/usage?provider=deepseek"
```

#### 5. 成本统计

```bash
# 总体成本
curl http://localhost:3000/api/llm/cost

# 按时间范围
curl "http://localhost:3000/api/llm/cost?startTime=2025-01-20T00:00:00Z&endTime=2025-01-21T23:59:59Z"

# 按 Provider
curl "http://localhost:3000/api/llm/cost?provider=deepseek"

# 按 Sub-Agent
curl "http://localhost:3000/api/llm/cost?subAgent=PlannerAgent"
```

### 方法 4: 使用 Swagger UI

1. 启动服务器后，访问 Swagger UI:
   ```
   http://localhost:3000/api-docs
   ```

2. 找到以下标签页:
   - `rag` - RAG 管理接口
   - `llm` - LLM 管理接口

3. 展开对应的接口，点击 "Try it out" 进行测试

---

## 测试检查清单

### RAG 接口测试

- [ ] `POST /api/rag/search` - RAG 搜索
  - [ ] 基本搜索功能正常
  - [ ] 支持 countryCode 参数
  - [ ] 支持 tags 参数
  - [ ] 支持 limit 和 minScore 参数
  - [ ] 返回正确的响应格式

- [ ] `GET /api/rag/stats` - RAG 统计
  - [ ] 返回所有集合的统计
  - [ ] 支持 collection 参数筛选
  - [ ] 返回正确的数据结构

### LLM 接口测试

- [ ] `GET /api/llm/models` - 获取模型列表
  - [ ] 返回所有提供商的模型列表
  - [ ] 正确显示模型可用状态
  - [ ] 返回默认提供商信息

- [ ] `GET /api/llm/usage` - Token 使用统计
  - [ ] 总体统计正常
  - [ ] 支持时间范围筛选
  - [ ] 支持按 Sub-Agent 筛选
  - [ ] 支持按 Provider 筛选
  - [ ] 返回正确的统计数据

- [ ] `GET /api/llm/cost` - 成本统计
  - [ ] 总体成本计算正确
  - [ ] 支持时间范围筛选
  - [ ] 支持按 Provider 筛选
  - [ ] 支持按 Sub-Agent 筛选
  - [ ] 返回正确的成本分解

---

## 预期结果

### 成功响应格式

所有接口都应返回以下格式：

```json
{
  "success": true,
  "data": { ... }
}
```

### 错误响应格式

```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "错误描述"
  }
}
```

---

## 常见问题

### 1. 连接被拒绝

**问题**: `ECONNREFUSED` 或 `Connection refused`

**解决**:
- 检查服务器是否正在运行: `curl http://localhost:3000/api/system/health`
- 检查端口是否正确（默认 3000）
- 检查防火墙设置

### 2. 404 Not Found

**问题**: 接口返回 404

**解决**:
- 确认接口路径正确（注意 `/api` 前缀）
- 检查路由配置是否正确注册

### 3. RAG 搜索返回空结果

**问题**: RAG 搜索没有返回结果

**解决**:
- 检查数据库中是否有文档数据
- 检查 collection 名称是否正确
- 检查 embedding 是否已生成

### 4. Token 统计返回空数据

**问题**: Token 使用统计返回空数据

**解决**:
- 这是正常的，如果还没有 LLM 调用记录
- 可以先执行一些 Agent 操作来生成 Token 使用记录
- 检查 TokenStatsService 是否正确记录数据

### 5. 成本统计为 0

**问题**: 成本统计显示为 0

**解决**:
- 检查是否有 Token 使用记录
- 检查定价配置是否正确
- 确认时间范围是否包含有数据的时段

---

## 性能测试

### 压力测试示例

```bash
# 使用 Apache Bench (ab) 进行压力测试
ab -n 100 -c 10 http://localhost:3000/api/llm/models

# 使用 wrk 进行压力测试
wrk -t4 -c100 -d30s http://localhost:3000/api/rag/stats
```

### 响应时间基准

- RAG 搜索: < 500ms（取决于文档数量和向量搜索性能）
- RAG 统计: < 200ms
- 模型列表: < 100ms
- Token 统计: < 100ms（内存查询）
- 成本统计: < 200ms

---

## 集成测试

### 完整流程测试

```bash
# 1. 创建测试文档索引
curl -X POST http://localhost:3000/api/rag/index \
  -H "Content-Type: application/json" \
  -d '{
    "collection": "test_collection",
    "title": "测试文档",
    "content": "这是一个测试文档",
    "countryCode": "IS"
  }'

# 2. 搜索文档
curl -X POST http://localhost:3000/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "测试",
    "collection": "test_collection"
  }'

# 3. 查看统计
curl http://localhost:3000/api/rag/stats?collection=test_collection

# 4. 查看模型列表
curl http://localhost:3000/api/llm/models

# 5. 查看 Token 使用（如果有数据）
curl http://localhost:3000/api/llm/usage

# 6. 查看成本统计（如果有数据）
curl http://localhost:3000/api/llm/cost
```

---

## 自动化测试

### CI/CD 集成

可以在 CI/CD 流程中添加测试：

```yaml
# .github/workflows/test-api.yml
- name: Test RAG and LLM Admin API
  run: |
    npm run start:dev &
    sleep 10
    npm run test:rag-llm-admin-api
```

---

## 相关文档

- [RAG 和 LLM 管理 API 文档](./RAG_LLM_ADMIN_API_DOCUMENTATION.md)
- [前端后端 API 对接指南](./FRONTEND_BACKEND_API_MAPPING.md)
- [后台管理 API 文档](./ADMIN_API_DOCUMENTATION.md)

---

*文档由 rl-infra 团队维护*
