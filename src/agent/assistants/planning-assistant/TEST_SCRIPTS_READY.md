# Planning Assistant V2 - MCP 服务自然语言调用测试脚本已就绪

**创建日期**: 2026-02-08  
**状态**: ✅ 测试脚本已创建并配置完成

---

## 📋 测试脚本概览

已创建完整的测试脚本，用于测试所有 MCP 服务的自然语言调用功能。

### 测试脚本文件

1. **`scripts/test-planning-assistant-mcp-natural-language.ts`** ⭐ 推荐
   - TypeScript 版本
   - 完整的错误处理
   - 详细的测试输出
   - 自动检查服务器状态

2. **`scripts/test-planning-assistant-mcp-natural-language.sh`**
   - Bash 版本
   - 需要安装 `jq` 工具
   - 适合 CI/CD 环境

### 文档文件

1. **`scripts/test-planning-assistant-mcp-natural-language-README.md`**
   - 完整的测试指南
   - 详细的测试用例说明
   - 故障排查指南

2. **`scripts/TEST_MCP_NATURAL_LANGUAGE_QUICK_START.md`**
   - 快速开始指南
   - 常见问题解答

---

## 🚀 如何使用

### 步骤 1: 启动服务器

```bash
# 在第一个终端
npm run dev
```

等待服务器启动完成（看到 "Application is running on: http://localhost:3000"）。

### 步骤 2: 运行测试

```bash
# 在第二个终端
npm run test:planning-assistant-mcp
```

### 步骤 3: 查看结果

测试脚本会自动：
- ✅ 检查服务器连接
- ✅ 创建测试会话
- ✅ 测试所有 11 个 MCP 服务
- ✅ 显示详细的测试结果
- ✅ 输出测试汇总

---

## 📊 测试覆盖范围

### 已实现的测试（11个）

| # | MCP 服务 | 测试输入 | 路由目标 | 状态 |
|---|---------|---------|---------|------|
| 1 | Hotel Direct API | "推荐冰岛的酒店" | `hotel` | ✅ |
| 2 | Airbnb MCP | "推荐 Airbnb 房源" | `airbnb` | ✅ |
| 3 | Accommodation | "推荐住宿" | `accommodation` | ✅ |
| 4 | Restaurant Direct API | "推荐餐厅" | `restaurant` | ✅ |
| 5 | Weather Direct API | "冰岛天气怎么样" | `weather` | ✅ |
| 6 | Exa MCP | "搜索冰岛旅游攻略" | `search` | ✅ |
| 7 | Amadeus MCP | "搜索从北京到上海的航班" | `flight` | ✅ |
| 8 | Rail MCP | "查询从巴黎到伦敦的火车" | `rail` | ✅ |
| 9 | Translation Direct API | "翻译一下 Hello World" | `translate` | ✅ |
| 10 | Currency Direct API | "100美元换人民币" | `currency` | ✅ |
| 11 | Image Direct API | "找一些冰岛的图片" | `image` | ✅ |

---

## ✅ 测试验证点

每个测试会验证：

1. ✅ **路由目标正确**: 检查 `routing.target` 是否匹配期望值
2. ✅ **响应字段存在**: 检查相应的响应字段是否存在（如 `hotels`、`airbnbListings` 等）
3. ✅ **消息字段存在**: 检查 `messageCN` 或 `message` 字段是否存在
4. ✅ **数据格式正确**: 检查返回数据的格式是否正确

---

## 📝 测试输出示例

### 成功输出

```
╔══════════════════════════════════════════════════════════════════════════════╗
║  Planning Assistant V2 - MCP 服务自然语言调用测试                            ║
╚══════════════════════════════════════════════════════════════════════════════╝

ℹ️  API 基础 URL: http://localhost:3000/api/agent/planning-assistant/v2
ℹ️  用户 ID: test_user_1707408000000

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  创建会话
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ℹ️  检查服务器连接...
✅ 服务器连接正常
✅ 会话创建成功: 550e8400-e29b-41d4-a716-446655440000

开始测试 MCP 服务自然语言调用...

📋 测试: 酒店搜索 (Hotel Direct API)
ℹ️  输入: "推荐冰岛的酒店"
ℹ️  期望路由: hotel
ℹ️  期望字段: hotels
✅ 测试通过
ℹ️  路由目标: hotel
ℹ️  响应消息: 我为您找到了5家酒店（已排除Airbnb）。
ℹ️  返回数据数量: 5

...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  测试结果汇总
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
总测试数: 11
通过: 11
失败: 0

🎉 所有测试通过！
```

### 服务器未运行时的输出

```
ℹ️  检查服务器连接...
❌ 服务器未运行！
ℹ️  请先启动服务器:
ℹ️    npm run dev
ℹ️    或
ℹ️    npm run backend:dev

❌ 无法创建会话，测试终止
```

---

## 🔧 配置选项

### 环境变量

```bash
# 自定义 API 基础 URL
BASE_URL=http://localhost:3000 npm run test:planning-assistant-mcp

# 或导出环境变量
export BASE_URL=http://localhost:3000
npm run test:planning-assistant-mcp
```

### npm 脚本

已在 `package.json` 中添加：

```json
{
  "scripts": {
    "test:planning-assistant-mcp": "npx tsx scripts/test-planning-assistant-mcp-natural-language.ts"
  }
}
```

---

## 📚 相关文档

- [快速开始指南](../scripts/TEST_MCP_NATURAL_LANGUAGE_QUICK_START.md)
- [完整测试指南](../scripts/test-planning-assistant-mcp-natural-language-README.md)
- [API 文档](./API_DOCUMENTATION_COMPLETE.md)
- [MCP 服务自然语言调用集成报告](./MCP_NATURAL_LANGUAGE_INTEGRATION_FINAL.md)

---

## ✅ 总结

- ✅ 测试脚本已创建（TypeScript + Bash）
- ✅ npm 脚本已配置
- ✅ 测试文档已编写
- ✅ 服务器状态检查已实现
- ✅ 错误处理已完善

**下一步**: 启动服务器并运行测试！

```bash
# 终端 1: 启动服务器
npm run dev

# 终端 2: 运行测试
npm run test:planning-assistant-mcp
```

---

**创建日期**: 2026-02-08  
**状态**: ✅ 测试脚本已就绪，等待服务器启动后即可运行测试
