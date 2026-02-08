# Planning Assistant V2 - MCP 服务自然语言调用测试指南

**测试脚本**: `test-planning-assistant-mcp-natural-language.ts`  
**创建日期**: 2026-02-08

---

## 📋 概述

本测试脚本用于测试 Planning Assistant V2 接口的所有 MCP 服务自然语言调用功能。

### 测试范围

测试所有 14 个 MCP 服务的自然语言调用：

1. ✅ Hotel Direct API - 酒店搜索
2. ✅ Airbnb MCP - Airbnb/民宿搜索
3. ✅ Accommodation - 住宿搜索（酒店+Airbnb）
4. ✅ Restaurant Direct API - 餐厅搜索
5. ✅ Weather Direct API - 天气查询
6. ✅ Exa MCP - Web搜索
7. ✅ Amadeus MCP - 航班搜索
8. ✅ Rail MCP - 铁路查询
9. ✅ Translation Direct API - 翻译服务
10. ✅ Currency Direct API - 货币转换
11. ✅ Image Direct API - 图片搜索

---

## 🚀 使用方法

### 前置条件

1. **启动服务器**
   ```bash
   npm run dev
   # 或
   npm run backend:dev
   ```

2. **确保服务器运行在** `http://localhost:3000`

3. **安装依赖**（如果还没有）
   ```bash
   npm install
   ```

### 运行测试

#### 方法 1: 使用 npm 脚本（推荐）

```bash
npm run test:planning-assistant-mcp
```

#### 方法 2: 直接运行 TypeScript 脚本

```bash
npx tsx scripts/test-planning-assistant-mcp-natural-language.ts
```

#### 方法 3: 使用 Bash 脚本

```bash
bash scripts/test-planning-assistant-mcp-natural-language.sh
```

### 自定义配置

可以通过环境变量自定义配置：

```bash
# 自定义 API 基础 URL
BASE_URL=http://localhost:3000 npm run test:planning-assistant-mcp

# 或
export BASE_URL=http://localhost:3000
npm run test:planning-assistant-mcp
```

---

## 📊 测试用例

### 1. 酒店搜索 (Hotel Direct API)

**输入**: "推荐冰岛的酒店"  
**期望路由**: `hotel`  
**期望字段**: `hotels`  
**验证点**:
- ✅ 路由目标正确
- ✅ 返回酒店列表
- ✅ 默认排除 Airbnb

### 2. Airbnb 搜索 (Airbnb MCP)

**输入**: "推荐 Airbnb 房源"  
**期望路由**: `airbnb`  
**期望字段**: `airbnbListings`  
**验证点**:
- ✅ 路由目标正确
- ✅ 返回 Airbnb 房源列表

### 3. 住宿搜索 (Hotel + Airbnb)

**输入**: "推荐住宿"  
**期望路由**: `accommodation`  
**期望字段**: `hotels` 和 `airbnbListings`  
**验证点**:
- ✅ 路由目标正确
- ✅ 同时返回酒店和 Airbnb 列表

### 4. 餐厅搜索 (Restaurant Direct API)

**输入**: "推荐餐厅"  
**期望路由**: `restaurant`  
**期望字段**: `restaurants`  
**验证点**:
- ✅ 路由目标正确
- ✅ 返回餐厅列表

### 5. 天气查询 (Weather Direct API)

**输入**: "冰岛天气怎么样"  
**期望路由**: `weather`  
**期望字段**: `weather`  
**验证点**:
- ✅ 路由目标正确
- ✅ 返回天气信息

### 6. Web 搜索 (Exa MCP)

**输入**: "搜索冰岛旅游攻略"  
**期望路由**: `search`  
**期望字段**: `searchResults`  
**验证点**:
- ✅ 路由目标正确
- ✅ 返回搜索结果

### 7. 航班搜索 (Amadeus MCP)

**输入**: "搜索从北京到上海的航班"  
**期望路由**: `flight`  
**期望字段**: `flights`  
**验证点**:
- ✅ 路由目标正确
- ✅ 返回航班列表

### 8. 铁路查询 (Rail MCP)

**输入**: "查询从巴黎到伦敦的火车"  
**期望路由**: `rail`  
**期望字段**: `railRoutes`  
**验证点**:
- ✅ 路由目标正确
- ✅ 返回铁路路线列表
- ⚠️ 如果 Rail MCP 需要 OAuth 认证但未配置，会返回认证提示

### 9. 翻译服务 (Translation Direct API)

**输入**: "翻译一下 Hello World"  
**期望路由**: `translate`  
**期望字段**: `translation`  
**验证点**:
- ✅ 路由目标正确
- ✅ 返回翻译结果

### 10. 货币转换 (Currency Direct API)

**输入**: "100美元换人民币"  
**期望路由**: `currency`  
**期望字段**: `currencyConversion`  
**验证点**:
- ✅ 路由目标正确
- ✅ 返回货币转换结果

### 11. 图片搜索 (Image Direct API)

**输入**: "找一些冰岛的图片"  
**期望路由**: `image`  
**期望字段**: `images`  
**验证点**:
- ✅ 路由目标正确
- ✅ 返回图片列表

---

## 📈 测试输出示例

```
╔══════════════════════════════════════════════════════════════════════════════╗
║  Planning Assistant V2 - MCP 服务自然语言调用测试                            ║
╚══════════════════════════════════════════════════════════════════════════════╝

ℹ️  API 基础 URL: http://localhost:3000/api/agent/planning-assistant/v2
ℹ️  用户 ID: test_user_1707408000000

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  创建会话
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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

---

## ⚠️ 注意事项

### 1. 服务依赖

某些 MCP 服务可能需要额外的配置：

- **Rail MCP**: 需要 OAuth 认证（如果未配置，会返回认证提示，测试不会失败）
- **Airbnb MCP**: 可能需要 OAuth 认证
- **Amadeus MCP**: 需要 API 密钥配置
- **Exa MCP**: 需要 API 密钥配置

### 2. 测试环境

- 确保服务器正在运行
- 确保数据库连接正常
- 确保必要的环境变量已配置

### 3. 测试顺序

测试脚本会在每个测试之间等待 500ms，避免请求过快。

### 4. 错误处理

如果某个服务不可用：
- 测试会检查路由目标是否正确
- 如果路由正确但服务不可用，会返回友好的错误提示
- 测试不会因为服务不可用而失败（只要路由正确）

---

## 🔧 故障排查

### 问题 1: 服务器未运行

**错误**: `ECONNREFUSED` 或 `服务器未运行`

**解决方案**:
```bash
# 启动服务器
npm run dev
```

### 问题 2: 会话创建失败

**错误**: `创建会话失败`

**解决方案**:
- 检查服务器日志
- 检查数据库连接
- 检查 API 端点是否正确

### 问题 3: 路由目标不匹配

**错误**: `路由目标不匹配`

**可能原因**:
- 智能路由服务未正确初始化
- LLM 服务不可用
- 关键词匹配失败

**解决方案**:
- 检查 SmartRouterService 是否正确注入
- 检查 LLM 服务配置
- 查看服务器日志

### 问题 4: 响应字段缺失

**错误**: `响应中缺少字段`

**可能原因**:
- MCP 服务未正确注入
- 服务调用失败
- 响应格式不正确

**解决方案**:
- 检查 MCP 服务模块是否正确导入
- 检查服务是否可用
- 查看服务器日志

---

## 📝 测试报告

测试完成后，脚本会输出：

1. **测试汇总**: 总测试数、通过数、失败数
2. **失败详情**: 列出所有失败的测试及其错误信息
3. **通过列表**: 列出所有通过的测试

---

## 🎯 预期结果

### 成功场景

- ✅ 所有 11 个测试都通过
- ✅ 路由目标正确识别
- ✅ 响应字段完整
- ✅ 返回数据格式正确

### 部分成功场景

- ⚠️ 某些服务可能需要认证（如 Rail MCP）
- ⚠️ 某些服务可能暂时不可用
- ✅ 只要路由目标正确，测试仍然通过

---

## 📚 相关文档

- [API 文档](../src/agent/assistants/planning-assistant/API_DOCUMENTATION_COMPLETE.md)
- [MCP 服务自然语言调用指南](../src/agent/assistants/planning-assistant/MCP_NATURAL_LANGUAGE_INTEGRATION_FINAL.md)
- [实施完成报告](../src/agent/assistants/planning-assistant/MCP_NATURAL_LANGUAGE_INTEGRATION_COMPLETE.md)

---

**最后更新**: 2026-02-08
