# Agent 模块测试（无数据库模式）

## 问题

在本地开发环境中，如果数据库服务器不可用（如 Kubernetes 集群内的数据库），应用启动时会因为 Prisma 连接失败而无法启动。

## 解决方案

### 方案 1: 启用无数据库模式（推荐用于测试）

设置环境变量 `ALLOW_NO_DATABASE=true`，允许应用在没有数据库连接的情况下启动：

```bash
export ALLOW_NO_DATABASE=true
npm run backend:dev
```

**注意**: 
- 此模式下，需要数据库的功能将不可用
- Agent 模块的 Router 逻辑可以正常测试（不依赖数据库）
- System1 和 System2 的部分功能可能需要数据库，会失败但不会阻塞启动

### 方案 2: 配置本地数据库

创建 `.env` 文件，配置本地 PostgreSQL 连接：

```bash
DATABASE_URL="postgresql://user:password@localhost:5432/tripnara"
```

然后启动本地 PostgreSQL 数据库。

### 方案 3: 使用 Docker 运行数据库

```bash
docker run --name tripnara-db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=tripnara \
  -p 5432:5432 \
  -d postgres:15
```

然后在 `.env` 中配置：
```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/tripnara"
```

## 测试 Agent Router（无需数据库）

Agent Router 逻辑不依赖数据库，可以直接测试：

```bash
# 不需要启动服务
npx ts-node --project tsconfig.backend.json scripts/test-agent-router.ts
```

## 测试完整 Agent API（需要服务运行）

如果只需要测试 Router 逻辑，可以使用无数据库模式：

```bash
# 1. 设置环境变量
export ALLOW_NO_DATABASE=true

# 2. 启动服务
npm run backend:dev

# 3. 在另一个终端运行测试
npx ts-node --project tsconfig.backend.json scripts/test-agent.ts
```

**限制**:
- System1 执行器中的数据库操作会失败
- System2 Orchestrator 中的数据库操作会失败
- 但 Router 逻辑可以正常工作

## 推荐测试流程

### 1. Router 逻辑测试（无需服务）
```bash
npx ts-node --project tsconfig.backend.json scripts/test-agent-router.ts
```

### 2. 完整功能测试（需要数据库）
```bash
# 配置数据库连接
export DATABASE_URL="postgresql://user:password@localhost:5432/tripnara"

# 启动服务
npm run backend:dev

# 运行端到端测试
npx ts-node --project tsconfig.backend.json scripts/test-agent.ts
```

## 环境变量说明

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ALLOW_NO_DATABASE` | 允许无数据库模式（用于测试） | `false` |
| `DATABASE_URL` | PostgreSQL 连接字符串 | 必需（除非 `ALLOW_NO_DATABASE=true`） |

