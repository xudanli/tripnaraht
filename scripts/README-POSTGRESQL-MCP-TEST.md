# PostgreSQL MCP API 测试指南

本文档介绍如何测试 PostgreSQL MCP 服务的 API 端点。

---

## 📋 目录

1. [前置要求](#前置要求)
2. [启动服务器](#启动服务器)
3. [运行测试](#运行测试)
4. [手动测试](#手动测试)
5. [Swagger UI](#swagger-ui)
6. [常见问题](#常见问题)

---

## ✅ 前置要求

### 1. 环境变量配置（可选）

如果需要使用自定义的 PostgreSQL MCP Server URL，可以在 `.env` 文件中配置：

```env
# PostgreSQL MCP Server URL（可选）
POSTGRESQL_MCP_SERVER_URL=https://server.smithery.ai/1Levick3/postgresql-mcp-server
```

**注意**: PostgreSQL MCP Server 本身需要配置数据库连接，这通常在服务器端完成。

### 2. 安装依赖

```bash
npm install
```

---

## 🚀 启动服务器

### 开发模式

```bash
npm run start:dev
```

服务器将在 `http://localhost:3000` 启动。

### 生产模式

```bash
npm run build
npm run start:prod
```

---

## 🧪 运行测试

### 自动化测试脚本

运行完整的测试套件：

```bash
npm run test:postgresql-mcp:api
```

或者直接运行：

```bash
npx tsx scripts/test-postgresql-mcp-api.ts
```

### 测试内容

测试脚本会测试以下端点：

1. ✅ **健康检查** (`GET /api/postgresql-mcp/health`)
   - 检查服务是否可用

2. ✅ **列出工具** (`GET /api/postgresql-mcp/tools`)
   - 获取所有可用的工具列表

3. ✅ **执行查询** (`POST /api/postgresql-mcp/query`)
   - 执行 SQL SELECT 查询

4. ✅ **执行命令** (`POST /api/postgresql-mcp/execute`)
   - 执行 SQL INSERT/UPDATE/DELETE 命令

5. ✅ **错误处理** (`POST /api/postgresql-mcp/query`)
   - 无效查询处理

---

## 🔧 手动测试

### 1. 检查服务状态

```bash
curl http://localhost:3000/api/postgresql-mcp/health
```

### 2. 列出所有可用工具

```bash
curl http://localhost:3000/api/postgresql-mcp/tools
```

### 3. 执行 SQL 查询

```bash
curl -X POST http://localhost:3000/api/postgresql-mcp/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "SELECT version() as pg_version",
    "params": []
  }'
```

### 4. 执行 SQL 命令（示例：只读查询）

```bash
curl -X POST http://localhost:3000/api/postgresql-mcp/execute \
  -H "Content-Type: application/json" \
  -d '{
    "query": "SELECT current_database() as db_name",
    "params": []
  }'
```

---

## 📚 Swagger UI

访问 Swagger UI 查看完整的 API 文档和交互式测试：

```
http://localhost:3000/api-docs
```

在 Swagger UI 中：
1. 找到 `postgresql-mcp` 标签
2. 展开相应的端点
3. 点击 "Try it out"
4. 填写参数
5. 点击 "Execute" 执行请求

---

## ❓ 常见问题

### 1. 服务不可用

**错误**: `PostgreSQL MCP service is not available`

**解决方案**:
1. 检查 PostgreSQL MCP Server URL 是否正确
2. 确保 PostgreSQL MCP Server 正在运行
3. 检查网络连接

### 2. 连接被拒绝

**错误**: `ECONNREFUSED` 或 `无法连接到服务器`

**解决方案**:
1. 确保服务器正在运行
2. 检查端口是否正确（默认 3000）
3. 检查防火墙设置

### 3. SQL 查询失败

**错误**: `PostgreSQL query failed`

**可能原因**:
1. SQL 语法错误
2. 数据库连接配置错误
3. 权限不足
4. 表或列不存在

**解决方案**:
1. 检查 SQL 语法
2. 验证数据库连接配置
3. 检查数据库权限
4. 查看服务器日志获取详细错误信息

### 4. 工具列表为空

**现象**: 工具列表返回空数组

**原因**: 
- PostgreSQL MCP Server 未正确连接
- 服务器未提供工具

**解决方案**:
1. 检查 PostgreSQL MCP Server 状态
2. 查看服务器日志
3. 验证服务器 URL 配置

---

## 🔗 相关文档

- **前端 API 文档**: `src/mcp/POSTGRESQL_MCP_FRONTEND_API.md`
- **MCP 服务器文档**: https://smithery.ai/server/1Levick3/postgresql-mcp-server

---

**最后更新**: 2026-02-06
