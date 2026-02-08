# 规划助手统一变更总结

**变更日期**: 2026-02-08  
**变更类型**: 架构简化  
**影响范围**: 规划助手、行程助手相关文档和接口

---

## 📋 变更概述

### 变更内容

**统一前**:
- **规划助手** (`/api/agent/planning-assistant`): 从零开始规划旅行
- **行程助手** (`/api/agent/trip-planner`): 优化已创建行程

**统一后**:
- **规划助手** (`/api/agent/planning-assistant`): 统一提供全流程服务
  - ✅ 从零开始规划旅行
  - ✅ 优化已创建行程
  - ✅ 细化行程安排
  - ✅ 实时支持和咨询

---

## 🎯 统一后的规划助手能力

### 全流程服务能力

1. **规划阶段**（从零开始）
   - 引导式多轮对话
   - 目的地推荐
   - 方案生成和对比
   - 确认并保存行程

2. **优化阶段**（已创建行程）
   - 优化路线顺序和节奏
   - 替换和调整景点
   - 重新平衡各天安排
   - 优化预算分配

3. **细化阶段**（行程细化）
   - 安排每日具体活动
   - 搜索和推荐餐厅
   - 规划交通方式
   - 添加住宿和活动

4. **咨询阶段**（实时支持）
   - 回答用户问题
   - 提供建议和风险提示
   - 检查行程可行性
   - 对比不同选项

---

## 📡 接口变更

### 统一后的接口

**规划助手接口** (`/api/agent/planning-assistant`):
- `POST /api/agent/planning-assistant/sessions` - 创建会话
- `POST /api/agent/planning-assistant/chat` - 发送消息（支持规划、优化、细化）
- `GET /api/agent/planning-assistant/sessions/:sessionId` - 查询会话状态
- `GET /api/agent/planning-assistant/quick-recommend` - 快速推荐
- `GET /api/agent/planning-assistant/users/:userId/preferences` - 获取偏好
- `POST /api/agent/planning-assistant/users/:userId/preferences/clear` - 清除偏好

### 接口使用方式

**规划阶段**（从零开始）:
```typescript
// 创建会话
const { sessionId } = await createSession();

// 发送规划消息
await chat({
  sessionId,
  message: '我想去冰岛旅行',
});
```

**优化阶段**（已创建行程）:
```typescript
// 使用 tripId 优化行程
await chat({
  sessionId, // 可选
  tripId: 'trip_123', // 指定行程ID
  message: '这个路线太赶了，帮我优化一下',
});
```

---

## 🔌 MCP 能力统一

### 统一后的完整 MCP 能力

规划助手现在拥有原规划助手和行程助手的所有 MCP 能力：

**P0 核心能力** (9个):
- Exa MCP
- Google Maps Direct（包含路线规划）
- Hotel Direct API
- Restaurant Direct API
- Weather Direct API
- Vision Service + OCR
- Translation Direct API
- Google Calendar MCP
- Stripe Direct API

**P1 增强能力** (6个):
- Airbnb MCP
- Amadeus MCP
- Rail MCP
- Image Direct API
- PostgreSQL MCP
- Currency Direct API

---

## 📚 文档更新

### 已更新的文档

1. ✅ **规划助手 API 文档 V2** (`planning-assistant/API_DOCUMENTATION_V2.md`)
   - 更新概述，说明统一后的能力
   - 补充优化和细化场景
   - 更新 MCP 能力列表

2. ✅ **规划助手统一说明** (`AGENT_UNIFIED_PLANNING_ASSISTANT.md`)
   - 创建统一说明文档
   - 提供迁移指南

3. ✅ **产品经理接口梳理** (`API_PRODUCT_MANAGER_REVIEW.md`)
   - 更新智能体接口说明
   - 更新调用流程图
   - 更新 MCP 能力集成说明

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

**迁移步骤**:

1. **更新接口路径**:
   ```typescript
   // 旧代码
   '/api/agent/trip-planner/chat'
   
   // 新代码
   '/api/agent/planning-assistant/chat'
   ```

2. **保持参数兼容**:
   - `tripId` 参数仍然支持，用于优化已创建行程
   - `sessionId` 参数可选，如果没有可以创建新会话

3. **功能保持不变**:
   - 所有原有功能都已整合到规划助手中
   - 响应格式保持一致

---

## ✅ 优势

### 统一后的优势

1. **简化用户体验**
   - 用户不需要区分规划阶段和优化阶段
   - 统一的对话入口，更自然的交互

2. **降低系统复杂度**
   - 减少接口数量
   - 统一的能力配置和管理

3. **提升开发效率**
   - 统一的代码库和维护
   - 减少重复代码

4. **增强功能完整性**
   - 规划助手拥有完整的能力
   - 覆盖用户旅行的全生命周期

---

## 📝 注意事项

1. **向后兼容**: 规划助手接口支持 `tripId` 参数，可以无缝处理已创建行程的优化请求

2. **会话管理**: 
   - 规划阶段：需要创建会话
   - 优化阶段：可以使用 `tripId`，会话可选

3. **MCP 能力**: 所有 MCP 能力已统一整合，规划助手可以使用所有能力

---

## 🔗 相关文档

- [规划助手 API 文档 V2](./planning-assistant/API_DOCUMENTATION_V2.md)
- [规划助手统一说明](./AGENT_UNIFIED_PLANNING_ASSISTANT.md)
- [MCP 能力配置指南](./AGENT_MCP_CAPABILITIES.md)
- [产品经理接口梳理](../../API_PRODUCT_MANAGER_REVIEW.md)

---

**文档维护**: 产品经理团队  
**最后更新**: 2026-02-08
