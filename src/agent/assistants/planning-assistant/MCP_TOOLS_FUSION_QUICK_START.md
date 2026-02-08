# MCP 工具融合架构 - 快速开始指南

## 🚀 启动服务器

### 方式 1: 开发模式（推荐）
```bash
npm run dev
# 或
npm run backend:dev
```

### 方式 2: 生产模式
```bash
npm run build
npm run start
```

## 🧪 运行测试

### 1. 自动化测试脚本
```bash
# 运行 MCP 工具融合测试
npx tsx scripts/test-mcp-tools-fusion.ts

# 运行自然语言调用测试
npx tsx scripts/test-planning-assistant-mcp-natural-language.ts
```

### 2. 手动 API 测试

#### 创建会话
```bash
curl -X POST http://localhost:3000/api/agent/planning-assistant/v2/sessions \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### 测试天气查询
```bash
curl -X POST http://localhost:3000/api/agent/planning-assistant/v2/chat \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "YOUR_SESSION_ID",
    "message": "冰岛下周的天气怎么样？",
    "language": "zh"
  }'
```

#### 测试 Web 搜索
```bash
curl -X POST http://localhost:3000/api/agent/planning-assistant/v2/chat \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "YOUR_SESSION_ID",
    "message": "搜索冰岛旅游攻略",
    "language": "zh"
  }'
```

#### 测试 Airbnb 房源详情
```bash
curl -X POST http://localhost:3000/api/agent/planning-assistant/v2/chat \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "YOUR_SESSION_ID",
    "message": "这个房源怎么样？房源 ID 是 1573970428683000922",
    "language": "zh"
  }'
```

## 📊 验证工具选择

### 检查响应中的路由信息

成功的响应应该包含 `routing` 字段：

```json
{
  "message": "...",
  "messageCN": "...",
  "routing": {
    "target": "weather",
    "reason": "用户想要查询天气",
    "params": {
      "toolName": "weather.getWeatherByDatetimeRange",
      "destination": "冰岛",
      "location": "冰岛"
    }
  }
}
```

### 检查日志

查看服务器日志，应该看到：
```
[DEBUG] 工具选择: weather.getWeatherByDatetimeRange, confidence=0.85
[DEBUG] 工具调用完成: weather.getWeatherByDatetimeRange, 耗时=1234ms
```

## 🎯 测试用例

### 高优先级测试用例

1. **天气查询**
   - "冰岛下周的天气怎么样？"
   - "查询冰岛下周的天气预报"
   - "冰岛的气温如何？"

2. **Web 搜索**
   - "搜索冰岛旅游攻略"
   - "深度搜索冰岛旅游信息"
   - "查一下冰岛的相关信息"

3. **Airbnb 房源详情**
   - "这个房源怎么样？房源 ID 是 12345"
   - "查看房源详情"
   - "房源 67890 的价格是多少？"

### 预期结果

- ✅ 路由到正确的服务（weather/search/airbnb）
- ✅ 选择正确的工具（如 weather.getWeatherByDatetimeRange）
- ✅ 返回工具执行结果
- ✅ 响应包含 routing 信息

## 🔍 故障排查

### 问题 1: 工具选择未触发

**症状**: 响应中没有 `toolName` 参数

**可能原因**:
- 路由未匹配到具体服务
- 工具选择置信度低于阈值（0.6）
- 服务未正确注入

**解决方法**:
1. 检查日志中的路由结果
2. 使用更明确的测试消息
3. 检查服务注入状态

### 问题 2: 工具调用失败

**症状**: 返回错误消息

**可能原因**:
- MCP 服务不可用
- 参数提取错误
- 认证问题

**解决方法**:
1. 检查 MCP 服务状态
2. 验证参数格式
3. 检查认证配置

### 问题 3: 响应中没有路由信息

**症状**: `routing` 字段为空或不存在

**解决方法**:
- 已修复：所有响应现在都包含路由信息
- 如果仍然缺失，检查代码版本

## 📝 下一步

1. ✅ 启动服务器
2. ✅ 运行测试脚本
3. ✅ 验证工具选择功能
4. 📊 收集性能数据
5. 🔧 根据结果优化

---

**最后更新**: 2026-02-08
**状态**: ✅ 准备就绪，可以开始测试
