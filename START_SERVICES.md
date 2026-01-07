# 服务启动指南

MCP Server 和 NestJS 后端服务是**完全独立**的，可以分别启动，也可以同时运行。

---

## 🚀 独立启动方式

### 1. 启动 NestJS 后端服务（开发模式）

```bash
# 方式 1: 使用 dev 脚本（推荐）
npm run dev

# 方式 2: 使用 backend:dev 脚本（功能相同）
npm run backend:dev
```

**说明**:
- 监听端口: `3000` (可通过 `PORT` 环境变量修改)
- API 地址: `http://localhost:3000/api`
- Swagger 文档: `http://localhost:3000/api-docs`
- 支持热重载 (watch mode)

### 2. 启动 MCP Server（独立进程）

```bash
# 启动 MCP Server
npm run mcp:server
```

**说明**:
- 使用 stdio 通信（标准输入输出），不占用 HTTP 端口
- 通过 `StdioServerTransport` 与 MCP 客户端通信
- 可以直接在终端运行，也可以通过进程管理工具（如 PM2）运行
- 使用 `console.error()` 输出日志（stdout 用于 JSON-RPC 通信）

---

## 🔄 同时启动两个服务

由于 MCP Server 使用 stdio 通信（不占用端口），可以**同时启动**两个服务：

### 方式 1: 两个终端窗口

**终端 1 - 启动 NestJS 后端**:
```bash
npm run dev
```

**终端 2 - 启动 MCP Server**:
```bash
npm run mcp:server
```

### 方式 2: 使用进程管理工具（推荐生产环境）

使用 `pm2` 或其他进程管理工具：

```bash
# 安装 pm2（如果还没有）
npm install -g pm2

# 启动后端服务
pm2 start npm --name "tripnara-backend" -- run dev

# 启动 MCP Server
pm2 start npm --name "tripnara-mcp" -- run mcp:server

# 查看运行状态
pm2 status

# 查看日志
pm2 logs

# 停止服务
pm2 stop tripnara-backend tripnara-mcp
```

---

## 📋 启动脚本说明

### NestJS 后端脚本

| 脚本 | 命令 | 说明 |
|------|------|------|
| `dev` | `npm run dev` | 开发模式，支持热重载 |
| `backend:dev` | `npm run backend:dev` | 同 `dev`，明确标识后端服务 |
| `build` | `npm run build` | 构建生产版本 |
| `start` | `npm run start` | 运行构建后的生产版本 |
| `backend:start` | `npm run backend:start` | 同 `start`，明确标识后端服务 |

### MCP Server 脚本

| 脚本 | 命令 | 说明 |
|------|------|------|
| `mcp:server` | `npm run mcp:server` | 启动 MCP Server |
| `mcp:check` | `npm run mcp:check` | TypeScript 类型检查 |

---

## ⚙️ 环境变量

两个服务共享相同的环境变量配置（如数据库连接、API keys 等），通过 `.env` 文件配置。

### 后端服务相关环境变量

```bash
# 端口配置（默认 3000）
PORT=3000

# 数据库连接
DATABASE_URL="postgresql://..."

# 日志级别
LOG_LEVEL="error,warn,log,debug"

# 前端 URL（CORS 配置）
FRONTEND_URL="http://localhost:3001"
```

### MCP Server 相关环境变量

MCP Server 使用与后端相同的数据库配置（`DATABASE_URL`），不需要额外的端口配置（使用 stdio）。

---

## 🛑 停止服务

### 开发模式

- 按 `Ctrl+C` 停止当前终端运行的服务

### 使用 PM2

```bash
# 停止所有服务
pm2 stop all

# 停止特定服务
pm2 stop tripnara-backend
pm2 stop tripnara-mcp

# 删除服务
pm2 delete tripnara-backend tripnara-mcp
```

---

## ✅ 验证服务运行状态

### 验证后端服务

```bash
# 检查端口是否监听
curl http://localhost:3000/api/health

# 或访问 Swagger 文档
open http://localhost:3000/api-docs
```

### 验证 MCP Server

MCP Server 使用 stdio 通信，需要通过 MCP 客户端连接测试。如果直接运行，应该看到：

```
Database connected
TripNara MCP Server started and ready
```

---

## 📝 注意事项

1. **数据库连接**: 两个服务都需要连接同一个数据库（通过 `DATABASE_URL`）
2. **端口冲突**: 后端服务使用端口 3000，MCP Server 不使用端口（stdio 通信）
3. **日志输出**: MCP Server 的日志输出到 `stderr`（使用 `console.error()`），因为 `stdout` 用于 JSON-RPC 通信
4. **进程管理**: 生产环境建议使用 PM2 或其他进程管理工具管理两个服务

---

## 🔗 相关文档

- `src/mcp/README.md` - MCP Server 详细文档
- `src/agent/README.md` - Agent 模块文档
- `AGENT_ARCHITECTURE_SUMMARY.md` - Agent 架构总结

