# TripNARA MCP Skills Server 使用指南

## ✅ 状态：已成功启动！

MCP Skills Server 已经成功启动，所有模块都已初始化完成。

## 🎯 已注册的 Skills

根据 `SkillsRegistryService`，以下 **9 个 Skills** 已成功注册：

### 1. DEM Skills
- **`tripnara.dem.getProfile`** - 获取路线的高程剖面、累计爬升、最大坡度、疲劳指数

### 2. Decision Skills
- **`tripnara.decision.abuCheck`** - 基于物理现实和合规的安全检查（Abu 策略）
- **`tripnara.decision.drdrePace`** - 基于人类能力模型的节奏调整（Dr.Dre 策略）
- **`tripnara.decision.neptuneRepair`** - 修复损坏的计划，替换高风险段（Neptune 策略）

### 3. RouteDirection Skills
- **`tripnara.routeDirection.pickForIntent`** - 根据用户意图、国家、季节选择路线方向

### 4. Readiness Skills
- **`tripnara.readiness.generateChecklist`** - 生成行前清单（证件、装备、健康、车辆配置等）

### 5. CountryPack Skills
- **`tripnara.countryPack.newSkeleton`** - 创建国家 Pack 骨架（ReadinessPack 或 RouteDirectionPack）
- **`tripnara.countryPack.validate`** - 验证 Pack 数据的完整性和正确性
- **`tripnara.countryPack.generateRegressionTests`** - 为 Pack 生成回归测试用例

### 6. 辅助工具
- **`tripnara.listSkills`** - 列出所有可用的 TripNARA Skills

## 🚀 如何使用

### 方式 1: 作为 MCP Server 运行（推荐）

MCP Server 通过 stdio（标准输入输出）进行通信，这是 MCP 协议的标准方式。

```bash
# 启动 MCP Server
npm run mcp:skills
```

服务器会：
- 初始化所有 NestJS 模块
- 注册所有 Skills 为 MCP 工具
- 等待通过 stdio 接收 JSON-RPC 请求

### 方式 2: 使用测试脚本

我们提供了一个测试脚本来验证所有 Skills：

```bash
# 运行测试脚本
npm run mcp:test
```

测试脚本会：
1. 连接到 MCP Server
2. 列出所有可用的 Skills
3. 测试几个核心 Skills（DEM、CountryPack、RouteDirection）
4. 显示所有注册的工具

### 方式 3: 集成到 ChatGPT / Claude Desktop

#### 配置 Claude Desktop

编辑 `~/Library/Application Support/Claude/claude_desktop_config.json`（macOS）或 `%APPDATA%\Claude\claude_desktop_config.json`（Windows）：

```json
{
  "mcpServers": {
    "tripnara": {
      "command": "npm",
      "args": ["run", "mcp:skills"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

#### 配置 ChatGPT

在 ChatGPT 的 MCP 设置中添加：

```json
{
  "mcpServers": {
    "tripnara-route-intel": {
      "command": "npm",
      "args": ["run", "mcp:skills"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

## 📝 使用示例

### 示例 1: 获取路线高程剖面

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "tripnara.dem.getProfile",
    "arguments": {
      "polyline": [
        { "lat": 64.1283, "lng": -21.8278 },
        { "lat": 64.1466, "lng": -21.9426 }
      ],
      "samples": 10
    }
  }
}
```

### 示例 2: 创建冰岛 ReadinessPack 骨架

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "tripnara.countryPack.newSkeleton",
    "arguments": {
      "countryCode": "IS",
      "countryName": "Iceland",
      "countryNameCN": "冰岛",
      "packType": "readiness",
      "supportedSeasons": ["summer", "winter"]
    }
  }
}
```

### 示例 3: 根据意图选择路线方向

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "tripnara.routeDirection.pickForIntent",
    "arguments": {
      "countryCode": "IS",
      "season": 7,
      "userIntentTags": ["hiking", "scenic", "hotSpring"]
    }
  }
}
```

### 示例 4: 列出所有 Skills

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "tripnara.listSkills",
    "arguments": {}
  }
}
```

## 🔧 架构说明

### Skills = 能力颗粒
- 最小可复用的能力单元
- 每个 Skill 只做一件事
- 有清晰的输入输出接口

### MCP = 能力的"插座标准"
- 将 Skills 暴露为标准的 MCP 工具
- 任何支持 MCP 的客户端都可以使用
- 工具名称格式：`tripnara.{skillName}`

### Agent = 会用这些能力的人
- LLM（如 ChatGPT、Claude）可以通过 MCP 调用这些 Skills
- LangGraph / DeepAgents 可以编排这些 Skills
- 前端可以通过 MCP 客户端调用这些 Skills

## 🐛 故障排除

### 问题 1: ConfigService 未定义

**症状**: `TypeError: Cannot read properties of undefined (reading 'get')`

**解决**: 已修复！所有服务现在都使用可选链和 `process.env` 作为保底。

### 问题 2: Skill 注册失败

**症状**: `TypeError: Cannot read properties of undefined (reading 'metadata')`

**解决**: 已修复！`SkillsRegistryService` 现在会检查 Skill 是否存在再注册。

### 问题 3: 数据库连接失败

**症状**: `MemoryService: Database not available`

**解决**: 这是正常的警告。MCP Server 可以在没有数据库的情况下运行，会使用内存存储。

## 📚 下一步

1. **测试所有 Skills**: 运行 `npm run mcp:test` 验证所有功能
2. **集成到 Agent**: 将 MCP Server 配置到 ChatGPT / Claude Desktop
3. **扩展 Skills**: 添加更多 Skills（如 `skill.rag.searchKnowledge`、`skill.whatIf.evaluateChange`）
4. **前端集成**: 在前端应用中通过 MCP 客户端调用这些 Skills

## 🎉 恭喜！

你的 TripNARA MCP Skills Server 已经成功启动并运行！现在你可以：

- ✅ 通过 MCP 协议暴露所有 TripNARA 核心能力
- ✅ 让任何支持 MCP 的 AI 助手使用这些能力
- ✅ 在 LangGraph / DeepAgents 中编排这些 Skills
- ✅ 在前端应用中通过 MCP 客户端调用这些 Skills

享受使用 TripNARA 的 Route Intelligence 能力吧！🚀

