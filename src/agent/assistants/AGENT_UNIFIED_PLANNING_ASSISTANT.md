# 规划助手智能体统一说明

**版本**: 1.0.0  
**更新日期**: 2026-02-08  
**重要变更**: 规划助手已统一整合原"规划助手"和"行程助手"的功能

---

## 📋 变更说明

### 统一背景

为了简化用户体验和降低系统复杂度，规划助手智能体已统一整合了原"规划助手"（Planning Assistant）和"行程助手"（Trip Planner）的功能。

### 变更内容

**之前**:
- **规划助手** (`/api/agent/planning-assistant`): 从零开始规划旅行
- **行程助手** (`/api/agent/trip-planner`): 优化已创建行程

**现在**:
- **规划助手** (`/api/agent/planning-assistant`): 统一提供全流程服务
  - ✅ 从零开始规划旅行
  - ✅ 优化已创建行程
  - ✅ 细化行程安排
  - ✅ 实时支持和咨询

---

## 🎯 统一后的规划助手职责

### 核心职责

规划助手现在提供全流程的旅行规划服务：

1. **规划阶段**（从零开始）
   - ✅ 引导式多轮对话，收集用户需求
   - ✅ 推荐目的地和方案
   - ✅ 生成行程方案并对比
   - ✅ 确认并保存行程

2. **优化阶段**（已创建行程）
   - ✅ 优化路线顺序和节奏
   - ✅ 替换和调整景点
   - ✅ 重新平衡各天安排
   - ✅ 优化预算分配

3. **细化阶段**（行程细化）
   - ✅ 安排每日具体活动
   - ✅ 搜索和推荐餐厅
   - ✅ 规划交通方式
   - ✅ 添加住宿和活动

4. **咨询阶段**（实时支持）
   - ✅ 回答用户问题
   - ✅ 提供建议和风险提示
   - ✅ 检查行程可行性
   - ✅ 对比不同选项

---

## 🔌 MCP 能力统一

### 统一后的完整 MCP 能力

规划助手现在拥有原规划助手和行程助手的所有 MCP 能力：

#### P0 核心能力

| MCP 服务 | 能力 | 使用场景 |
|---------|------|---------|
| **Exa MCP** | Web搜索、目的地研究 | 搜索目的地信息、景点介绍 |
| **Google Maps Direct** | 地点搜索、地理编码、路线规划 | 搜索地点、规划路线、优化顺序 |
| **Hotel Direct API** | 酒店搜索、推荐 | 根据预算和位置搜索酒店 |
| **Restaurant Direct API** | 餐厅搜索、推荐 | 搜索餐厅、推荐、预订 |
| **Weather Direct API** | 天气查询 | 查询目的地天气，影响活动推荐 |
| **Vision Service + OCR** | 图片识别地点、OCR提取文字 | 用户上传图片识别地点、提取文字 |
| **Translation Direct API** | 翻译服务、图片翻译 | 翻译目的地信息、菜单、路牌 |
| **Google Calendar MCP** | 日历同步、提醒 | 同步行程到日历、创建提醒 |
| **Stripe Direct API** | 支付处理 | 处理预订支付、退款 |

#### P1 增强能力

| MCP 服务 | 能力 | 使用场景 |
|---------|------|---------|
| **Airbnb MCP** | 民宿搜索 | 搜索民宿，补充酒店选择 |
| **Amadeus MCP** | 航班搜索 | 搜索往返航班、改签 |
| **Rail MCP** | 铁路查询 | 查询铁路路线和时刻表、改签 |
| **Image Direct API** | 目的地图片 | 获取目的地图片，视觉参考 |
| **PostgreSQL MCP** | 用户数据查询 | 查询用户历史、偏好数据 |
| **Currency Direct API** | 货币转换 | 显示不同货币的价格 |

---

## 📡 接口使用说明

### 规划阶段（从零开始）

```typescript
// 1. 创建会话
const sessionRes = await fetch('/api/agent/planning-assistant/sessions', {
  method: 'POST',
  body: JSON.stringify({ userId: 'user_123' }),
});
const { sessionId } = await sessionRes.json();

// 2. 发送规划消息
const chatRes = await fetch('/api/agent/planning-assistant/chat', {
  method: 'POST',
  body: JSON.stringify({
    sessionId,
    message: '我想去冰岛旅行',
    language: 'zh',
  }),
});
```

### 优化阶段（已创建行程）

```typescript
// 直接使用 tripId 发送优化请求
const chatRes = await fetch('/api/agent/planning-assistant/chat', {
  method: 'POST',
  body: JSON.stringify({
    sessionId, // 可选，如果没有会话可以创建新会话
    tripId: 'trip_123', // 指定行程ID
    message: '这个路线太赶了，帮我优化一下',
    language: 'zh',
  }),
});
```

### 细化阶段（行程细化）

```typescript
// 细化行程安排
const chatRes = await fetch('/api/agent/planning-assistant/chat', {
  method: 'POST',
  body: JSON.stringify({
    sessionId,
    tripId: 'trip_123',
    message: '帮我安排今天的餐厅',
    language: 'zh',
  }),
});
```

---

## 🔄 迁移指南

### 从行程助手迁移到规划助手

**旧接口** (已废弃):
```
POST /api/agent/trip-planner/chat
```

**新接口**:
```
POST /api/agent/planning-assistant/chat
```

**主要变更**:
1. **接口路径**: `/api/agent/trip-planner/chat` → `/api/agent/planning-assistant/chat`
2. **参数兼容**: 支持 `tripId` 参数，用于优化已创建行程
3. **功能统一**: 所有功能统一在规划助手中

**迁移示例**:

```typescript
// 旧代码
await fetch('/api/agent/trip-planner/chat', {
  method: 'POST',
  body: JSON.stringify({
    tripId: 'trip_123',
    message: '优化行程',
  }),
});

// 新代码
await fetch('/api/agent/planning-assistant/chat', {
  method: 'POST',
  body: JSON.stringify({
    sessionId: sessionId, // 可选，如果没有可以创建
    tripId: 'trip_123', // 保持不变
    message: '优化行程',
  }),
});
```

---

## 📚 相关文档

- [规划助手 API 文档](./planning-assistant/API_DOCUMENTATION_V2.md)
- [MCP 能力配置指南](./AGENT_MCP_CAPABILITIES.md)
- [MCP 能力实现状态](./AGENT_MCP_CAPABILITIES_IMPLEMENTATION_STATUS.md)

---

## 📝 更新日志

### v1.0.0 (2026-02-08)

- ✅ 统一规划助手和行程助手功能
- ✅ 更新 MCP 能力配置
- ✅ 更新接口文档
- ✅ 提供迁移指南

---

**文档维护**: 产品经理团队  
**最后更新**: 2026-02-08
