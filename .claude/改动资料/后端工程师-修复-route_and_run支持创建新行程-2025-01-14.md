# route_and_run 接口 - 支持创建新行程修复

**修复日期**: 2025-01-14  
**修复角色**: 后端工程师  
**问题**: `route_and_run` 接口不允许 `trip_id` 为 `null`，但创建新行程时需要 `trip_id` 为 `null`

---

## 🔴 问题描述

### 问题

在 `agent.service.ts` 的 `routeAndRun()` 方法中，第 133-137 行有一个检查：

```typescript
// 0.1 验证 trip_id（统一入口强制要求 trip_id）
if (!request.trip_id || request.trip_id === '') {
  this.logger.warn(`[AgentService] 缺少 trip_id: request_id=${request.request_id}, message=${request.message.substring(0, 50)}...`);
  return this.createMissingTripIdErrorResponse(request, startTime);
}
```

**问题**：这个检查会阻止创建新行程的请求（`trip_id` 为 `null` 是正常的）。

### 影响

- ❌ 无法通过 `route_and_run` 接口创建新行程
- ❌ 自然语言创建行程功能无法使用
- ❌ 不符合 PRD 文档中的设计（创建新行程时 `trip_id` 为 `null`）

---

## ✅ 修复方案

### 修复逻辑

1. **区分创建新行程和已有行程操作**
   - 如果 `entry_point` 为 `'dashboard'`，说明是从创建行程页面发起的，允许 `trip_id` 为 `null`
   - 如果是已有行程的操作（查询、修改等），需要 `trip_id`

2. **规划请求重定向逻辑**
   - 如果 `entry_point` 为 `'dashboard'`，不重定向到规划工作台（允许通过 `route_and_run` 创建）
   - 如果 `entry_point` 不是 `'dashboard'` 且是规划请求，重定向到规划工作台

### 修复代码

```typescript
// 0. 检查是否是规划请求（需要拦截，重定向到规划工作台）
// 注意：如果 entry_point 为 'dashboard'，说明是从创建行程页面发起的，应该允许通过（自然语言创建行程功能）
const isFromDashboard = request.options?.entry_point === 'dashboard';
if (this.isPlanningRequest(request) && !isFromDashboard) {
  this.logger.debug(`[AgentService] 检测到规划请求，重定向到规划工作台: request_id=${request.request_id}, message=${request.message.substring(0, 50)}...`);
  return this.createRedirectToPlanningWorkbenchResponse(request, startTime);
}

// 0.1 验证 trip_id
// 注意：创建新行程时 trip_id 为 null 是正常的（通过自然语言创建行程功能）
// 只有在已有行程的操作（查询、修改等）时才需要 trip_id
// 如果是从 dashboard 创建新行程，允许 trip_id 为 null
const isCreatingNewTrip = (!request.trip_id || request.trip_id === '') && isFromDashboard;

if (!isCreatingNewTrip && (!request.trip_id || request.trip_id === '')) {
  // 只有在非创建新行程场景下才要求 trip_id
  this.logger.warn(`[AgentService] 缺少 trip_id（非创建新行程场景）: request_id=${request.request_id}, message=${request.message.substring(0, 50)}...`);
  return this.createMissingTripIdErrorResponse(request, startTime);
}
```

---

## ✅ 修复后的行为

### 场景 1：从 Dashboard 创建新行程

**请求**：
```json
{
  "request_id": "test-001",
  "user_id": "user-123",
  "trip_id": null,
  "message": "帮我规划26年春节去冰岛的10天行程，预算100000元",
  "options": {
    "entry_point": "dashboard"
  }
}
```

**行为**：
- ✅ 不重定向到规划工作台
- ✅ 允许 `trip_id` 为 `null`
- ✅ 继续执行 `route_and_run` 流程
- ✅ 如果信息不足，返回澄清问题

### 场景 2：从其他入口创建新行程（无 entry_point）

**请求**：
```json
{
  "request_id": "test-002",
  "user_id": "user-123",
  "trip_id": null,
  "message": "帮我规划行程"
}
```

**行为**：
- ⚠️ 如果检测到规划请求，重定向到规划工作台
- ⚠️ 如果未检测到规划请求，返回缺少 `trip_id` 错误

**建议**：
- 前端在创建新行程时，应该设置 `entry_point: 'dashboard'`

### 场景 3：已有行程的操作

**请求**：
```json
{
  "request_id": "test-003",
  "user_id": "user-123",
  "trip_id": "trip-456",
  "message": "查询行程状态"
}
```

**行为**：
- ✅ 需要 `trip_id`（已有行程）
- ✅ 继续执行 `route_and_run` 流程

---

## 📝 测试用例

### 测试用例 1：从 Dashboard 创建新行程（信息不足）

**请求**：
```bash
curl -X POST http://localhost:3000/api/agent/route_and_run \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "test-001",
    "user_id": "user-123",
    "trip_id": null,
    "message": "帮我规划行程",
    "options": {
      "entry_point": "dashboard"
    }
  }'
```

**预期响应**：
- ✅ `result.status` 为 `NEED_MORE_INFO`
- ✅ `payload.clarificationQuestions` 存在
- ✅ 不重定向到规划工作台

### 测试用例 2：从 Dashboard 创建新行程（信息充足）

**请求**：
```bash
curl -X POST http://localhost:3000/api/agent/route_and_run \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "test-002",
    "user_id": "user-123",
    "trip_id": null,
    "message": "帮我规划26年春节去冰岛的10天行程，预算100000元",
    "options": {
      "entry_point": "dashboard"
    }
  }'
```

**预期响应**：
- ✅ `result.status` 为 `OK`（如果信息充足）或 `NEED_MORE_INFO`（如果仍需澄清）
- ✅ 不重定向到规划工作台
- ✅ 继续执行行程生成流程

### 测试用例 3：已有行程的操作（缺少 trip_id）

**请求**：
```bash
curl -X POST http://localhost:3000/api/agent/route_and_run \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "test-003",
    "user_id": "user-123",
    "trip_id": null,
    "message": "查询行程状态"
  }'
```

**预期响应**：
- ✅ `result.status` 为 `REDIRECT_REQUIRED` 或 `FAILED`
- ✅ 返回缺少 `trip_id` 错误

---

## ✅ 修复状态

- ✅ 修复了 `trip_id` 验证逻辑
- ✅ 支持从 Dashboard 创建新行程
- ✅ 保持向后兼容（已有行程操作仍需要 `trip_id`）
- ✅ 规划请求重定向逻辑优化

---

## 📋 相关文件

- `src/agent/services/agent.service.ts` - 修复了 `routeAndRun()` 方法

---

**修复完成日期**: 2025-01-14  
**修复状态**: ✅ 已完成  
**下一步**: 测试验证修复效果
