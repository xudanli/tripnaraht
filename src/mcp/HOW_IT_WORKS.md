# MCP Server 运行模式说明

## 🔄 运行 vs 不运行的区别

### 情况 1: 手动运行 MCP Server（测试/开发模式）

```bash
npm run mcp:server
```

**特点**:
- ✅ 在终端中可见输出和日志
- ✅ 适合开发和调试
- ✅ 可以手动停止（Ctrl+C）
- ❌ 必须保持终端窗口打开
- ❌ 不适合长期运行
- ❌ 不适合生产环境

**输出示例**:
```
Database connected
TripNara MCP Server started and ready
```

---

### 情况 2: 通过客户端自动启动（推荐方式）

当您在 Claude Desktop 中配置 MCP Server 后，**不需要手动运行**。

**工作原理**:

1. **Claude Desktop 启动时**
   - 读取配置文件 `claude_desktop_config.json`
   - 发现 `tripnara` MCP Server 配置

2. **自动启动 MCP Server**
   - Claude Desktop 执行配置中的命令：
     ```json
     "command": "npm",
     "args": ["run", "mcp:server"],
     "cwd": "/home/devbox/project"
     ```
   - 在后台启动 MCP Server 进程

3. **建立连接**
   - Claude Desktop 通过 **stdio**（标准输入输出）与 MCP Server 通信
   - 使用 JSON-RPC 协议

4. **使用工具**
   - 当您在 Claude Desktop 中使用工具时
   - Claude Desktop 发送 JSON-RPC 请求给 MCP Server
   - MCP Server 执行工具并返回结果
   - Claude Desktop 显示结果

5. **自动管理**
   - Claude Desktop 管理 MCP Server 的生命周期
   - 关闭 Claude Desktop 时自动停止 MCP Server

---

## 🔌 客户端和服务端的配合方式

### 通信架构

```
┌─────────────────┐         stdio (JSON-RPC)        ┌──────────────────┐
│                 │  ──────────────────────────────> │                  │
│ Claude Desktop  │                                  │  MCP Server      │
│   (客户端)      │  <────────────────────────────── │  (服务端)        │
│                 │                                  │                  │
└─────────────────┘                                  └──────────────────┘
       │                                                     │
       │                                                     │
       │ 1. 启动进程                                          │
       ├──────────────────────────────────────────────────> │
       │                                                     │
       │ 2. 发送 JSON-RPC 请求                               │
       │    (调用工具)                                        │
       ├──────────────────────────────────────────────────> │
       │                                                     │
       │                                                     │ 3. 执行工具
       │                                                     │    (查询数据库等)
       │                                                     │
       │ 4. 接收 JSON-RPC 响应                               │
       │    (工具结果)                                        │
       │ <───────────────────────────────────────────────────┤
       │                                                     │
       │ 5. 显示结果给用户                                    │
       │                                                     │
```

### 通信协议：JSON-RPC over stdio

**stdio 通信方式**:
- **stdin** (标准输入): MCP Server 读取客户端请求
- **stdout** (标准输出): MCP Server 发送响应给客户端
- **stderr** (标准错误): 日志输出（不影响通信）

**JSON-RPC 请求示例**:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "list_trips",
    "arguments": {
      "limit": 10
    }
  }
}
```

**JSON-RPC 响应示例**:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "[...trip data...]"
      }
    ]
  }
}
```

---

## 📊 两种模式的对比

| 特性 | 手动运行 | 客户端自动启动 |
|------|---------|---------------|
| **启动方式** | 手动执行 `npm run mcp:server` | Claude Desktop 自动启动 |
| **生命周期管理** | 手动管理（Ctrl+C 停止） | Claude Desktop 自动管理 |
| **可见性** | 终端中可见输出 | 后台运行 |
| **适用场景** | 开发、调试、测试 | 日常使用、生产环境 |
| **多客户端支持** | 一个进程，一个连接 | 每个客户端独立进程 |
| **错误处理** | 手动处理 | Claude Desktop 处理 |

---

## 🎯 推荐使用方式

### 开发/测试阶段

```bash
# 手动运行，查看日志
npm run mcp:server
```

**用途**:
- 开发新工具
- 调试问题
- 测试功能

### 日常使用

**不手动运行**，让 Claude Desktop 自动管理：

1. 配置 Claude Desktop（`claude_desktop_config.json`）
2. 启动 Claude Desktop
3. MCP Server 自动启动
4. 直接使用工具

---

## ⚠️ 重要注意事项

### 1. 不要同时运行两个实例

**错误做法**:
```bash
# 终端 1
npm run mcp:server  # ❌ 手动运行

# 同时 Claude Desktop 也在运行  # ❌ 冲突！
```

**结果**: 
- 端口冲突（虽然使用 stdio，但进程冲突）
- 资源浪费
- 不确定哪个进程在响应请求

**正确做法**:
- ✅ 开发时：手动运行（关闭 Claude Desktop）
- ✅ 使用时：让 Claude Desktop 自动运行（不手动运行）

### 2. 环境变量

MCP Server 需要环境变量（如 `DATABASE_URL`）：
- 手动运行时：从 `.env` 文件或系统环境变量读取
- Claude Desktop 启动时：从项目目录的 `.env` 文件读取

### 3. 进程管理

**手动运行**:
- 终端关闭 → 进程停止
- Ctrl+C → 进程停止
- 必须手动管理

**Claude Desktop 管理**:
- 启动 Claude Desktop → 自动启动 MCP Server
- 关闭 Claude Desktop → 自动停止 MCP Server
- 无需手动管理

---

## 🔍 如何检查 MCP Server 是否在运行

### 手动运行模式

在运行 `npm run mcp:server` 的终端中可以看到输出。

### Claude Desktop 管理模式

1. **查看进程**:
   ```bash
   # macOS/Linux
   ps aux | grep mcp-server
   
   # 或查看 npm 进程
   ps aux | grep "npm run mcp:server"
   ```

2. **在 Claude Desktop 中检查**:
   - 查看 MCP Server 连接状态
   - 尝试使用工具，看是否正常响应

---

## 📝 总结

### 运行 vs 不运行

- **开发/测试**: 手动运行，查看日志，调试问题
- **日常使用**: 不手动运行，让 Claude Desktop 自动管理

### 客户端和服务端配合

1. Claude Desktop 读取配置
2. 自动启动 MCP Server 进程
3. 通过 stdio (JSON-RPC) 通信
4. 调用工具并返回结果
5. Claude Desktop 自动管理生命周期

**关键点**: MCP Server **不需要作为独立服务运行**，它是在需要时由客户端启动的进程。

---

## 🔗 相关文档

- `MCP_CLIENT_CONFIG.md` - Claude Desktop 配置指南
- `TEST_RESULTS.md` - 测试结果说明
- `src/mcp/README.md` - MCP Server 文档
- `START_SERVICES.md` - 服务启动指南

