# 规划工作台异步 API 测试指南（不依赖 embedding）

## 概述

此测试脚本专门用于测试规划工作台的异步功能（P0），**不依赖 embedding 服务**。

系统已经内置了降级机制：
- 当 `embedding` 服务不可用时，`semanticSearch` 会自动降级到关键词搜索（`search`）
- 关键词搜索使用 SQL `ILIKE` 进行文本匹配，不依赖向量数据库
- 即使没有 embedding，规划工作台仍然可以正常工作，只是搜索结果可能不如语义搜索精确

## 前置条件

1. **启动服务器**
   ```bash
   npm run start:dev
   # 或
   npm run start
   ```

2. **确认服务器运行在** `http://localhost:3000`

3. **确认数据库中有 POI 数据**（即使没有 embedding，关键词搜索也需要数据库中有数据）

## 运行测试

### TypeScript 测试脚本（推荐）

```bash
# 设置API地址（可选，默认 http://localhost:3000）
export API_BASE_URL=http://localhost:3000

# 运行测试
npx ts-node scripts/test-planning-workbench-async.ts
```

### Shell 测试脚本

```bash
# 设置API地址（可选）
export API_BASE_URL=http://localhost:3000

# 运行测试
bash scripts/test-planning-workbench-async.sh
```

## 测试覆盖

### ✅ 测试1: 异步执行（execute-async）
- 测试创建异步任务
- 验证立即返回 `202 Accepted` 和 `taskId`
- 验证响应时间（应该 < 1秒）

### ✅ 测试2: 轮询任务状态
- 测试轮询 `/tasks/:taskId/status` 端点
- 验证任务状态变化（PENDING → RUNNING → COMPLETED）
- 验证进度更新
- 验证最终结果返回

### ✅ 测试3: 直接查询任务状态
- 测试直接查询任务状态（不轮询）
- 验证状态信息完整性

### ✅ 测试4: 取消任务（可选）
- 测试取消 PENDING 或 RUNNING 状态的任务
- 验证取消功能

## 手动测试示例

### 1. 创建异步任务

```bash
curl -X POST "http://localhost:3000/api/planning-workbench/execute-async" \
  -H "Content-Type: application/json" \
  -d '{
    "context": {
      "destination": {
        "country": "冰岛"
      },
      "days": 3,
      "travelMode": "self_drive",
      "constraints": {
        "budget": {
          "total": 30000,
          "currency": "CNY"
        },
        "fitness": {
          "level": "medium"
        }
      }
    },
    "userAction": "generate"
  }'
```

**预期响应**（HTTP 202）：
```json
{
  "success": true,
  "data": {
    "taskId": "550e8400-e29b-41d4-a716-446655440000",
    "message": "任务已接受，正在处理中",
    "statusUrl": "/api/planning-workbench/tasks/550e8400-e29b-41d4-a716-446655440000/status"
  }
}
```

### 2. 查询任务状态

```bash
curl "http://localhost:3000/api/planning-workbench/tasks/{taskId}/status"
```

**预期响应**（HTTP 200）：
```json
{
  "success": true,
  "data": {
    "taskId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "RUNNING",
    "progress": 45,
    "currentStage": "正在生成骨架方案...",
    "createdAt": "2026-02-04T10:00:00Z",
    "updatedAt": "2026-02-04T10:00:30Z"
  }
}
```

**完成后的响应**：
```json
{
  "success": true,
  "data": {
    "taskId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "COMPLETED",
    "progress": 100,
    "currentStage": "已完成",
    "result": {
      "planState": { ... },
      "segments": [ ... ]
    },
    "completedAt": "2026-02-04T10:02:00Z"
  }
}
```

### 3. 取消任务（可选）

```bash
curl -X POST "http://localhost:3000/api/planning-workbench/tasks/{taskId}/cancel-planning"
```

## 验证要点

### 异步任务创建
- ✅ HTTP 状态码为 `202 Accepted`
- ✅ 响应中包含 `taskId`
- ✅ 响应时间 < 1秒（立即返回）

### 任务状态轮询
- ✅ 状态从 `PENDING` → `RUNNING` → `COMPLETED`
- ✅ 进度从 0% 逐渐增加到 100%
- ✅ `currentStage` 字段显示当前处理阶段
- ✅ 完成时 `result` 字段包含完整的规划结果

### 降级机制验证
- ✅ 即使 embedding 服务不可用，任务仍能完成
- ✅ 日志中应看到 "降级到关键词搜索" 或类似信息
- ✅ POI 搜索结果可能较少，但不影响整体流程

## 故障排查

### 连接失败
- 确认服务器已启动：`curl http://localhost:3000/health`
- 检查 `API_BASE_URL` 环境变量是否正确

### 任务创建失败
- 检查 `PlanningWorkbenchTaskService` 是否正常注入
- 查看服务器日志中的错误信息

### 任务一直处于 PENDING 状态
- 检查后台任务是否正常启动
- 查看服务器日志中的任务执行日志

### 任务失败（FAILED）
- 检查 `error` 字段中的错误信息
- 查看服务器日志中的详细错误堆栈
- 确认数据库连接正常
- 确认 POI 数据存在（即使没有 embedding，也需要有数据供关键词搜索）

### 关键词搜索找不到 POI
- 确认数据库中有 POI 数据
- 检查 POI 的 `nameCN`、`nameEN`、`address` 字段是否包含相关关键词
- 可以尝试使用更通用的关键词（如 "酒店"、"餐厅"）

## 降级机制说明

### 自动降级流程

1. **语义搜索尝试**：
   - `PlacesService.semanticSearch()` 首先尝试使用 `VectorSearchService`
   - 如果 `VectorSearchService` 不可用，自动降级到 `search()`（关键词搜索）

2. **关键词搜索**：
   - 使用 SQL `ILIKE` 进行文本匹配
   - 搜索字段：`nameCN`、`nameEN`、`address`、`metadata`
   - 不依赖向量数据库或 embedding 服务

3. **超时保护**：
   - 每个 `semanticSearch` 调用有 15 秒超时
   - 超时后自动降级到关键词搜索

### 降级后的影响

- ✅ **功能完整性**：规划工作台仍能正常工作
- ⚠️ **搜索精度**：关键词搜索可能不如语义搜索精确
- ⚠️ **搜索结果**：可能返回较少的 POI（取决于关键词匹配）

## 相关文档

- API文档: `/src/agent/PLANNING_WORKBENCH_API.md`
- 流程文档: `/src/agent/PLANNING_WORKBENCH_FLOW.md`
- 评估报告: `/src/agent/PLANNING_WORKBENCH_FLOW_EVALUATION.md`
- 同步测试: `/scripts/test-planning-workbench-api-README.md`
