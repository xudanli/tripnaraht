# Agent 运行数据库记录状态

## 📋 概述

Agent 运行数据**有数据库表结构**，**记录功能已完全实现** ✅

**实现状态**: ✅ **已完成** - 所有功能已实现并集成

**详细实现报告**: 参见 [AGENT_RUN_RECORDING_IMPLEMENTATION.md](./AGENT_RUN_RECORDING_IMPLEMENTATION.md)

## ✅ 数据库表结构

### 1. TripRun 表（`trip_runs`）

**用途**: 记录一次规划会话（用户点击"生成路线"）

**字段**:
- `id` (UUID) - 主键
- `tripId` (UUID, 可选) - 关联的行程 ID
- `userId` (UUID, 可选) - 用户 ID
- `userQuery` (Text) - 用户查询内容
- `planningPhase` (VARCHAR(50)) - 规划阶段
- `currentAgent` (VARCHAR(50), 可选) - 当前执行的 Agent
- `status` (VARCHAR(20)) - 状态: `IN_PROGRESS`, `COMPLETED`, `FAILED`
- `createdAt` (DateTime) - 创建时间
- `updatedAt` (DateTime) - 更新时间
- `completedAt` (DateTime, 可选) - 完成时间
- `metadata` (JSON, 可选) - 元数据

**索引**:
- `tripId`
- `userId`
- `planningPhase`
- `status`
- `createdAt`

### 2. TripAttempt 表（`trip_attempts`）

**用途**: 记录一次候选方案（plan candidate）的迭代

**字段**:
- `id` (UUID) - 主键
- `tripRunId` (UUID) - 关联的 TripRun ID
- `attemptNumber` (Int) - 尝试编号
- `planOutline` (Text, 可选) - 计划大纲
- `openQuestions` (String[]) - 开放问题列表
- `constraintsAssumed` (String[]) - 假设的约束
- `nextActions` (String[]) - 下一步行动
- `failureNotes` (Text, 可选) - 失败原因
- `status` (VARCHAR(20)) - 状态: `PENDING`, `IN_PROGRESS`, `COMPLETED`, `FAILED`
- `resultSummary` (Text, 可选) - 结果摘要
- `artifacts` (JSON, 可选) - 结构化结果引用
- `createdAt` (DateTime) - 创建时间
- `updatedAt` (DateTime) - 更新时间
- `completedAt` (DateTime, 可选) - 完成时间
- `metadata` (JSON, 可选) - 元数据

**关系**:
- 多对一关联到 `TripRun`（级联删除）

**索引**:
- `tripRunId`
- `status`
- `attemptNumber`
- `createdAt`

### 3. ApprovalRequest 表（`approval_requests`）

**字段**:
- `agentRunId` (VARCHAR(255), 可选) - 关联的 Agent 运行 ID

**用途**: 审批请求可以关联到 Agent 运行，用于追踪

## ✅ 已实现的功能

### 1. 查询和管理接口

**文件**: `src/agent/services/agent-run-admin.service.ts`

**功能**:
- ✅ `getRuns()` - 分页查询 TripRun 列表（支持筛选、排序）
- ✅ `getRunById()` - 获取 TripRun 详情（包含关联的 TripAttempt）
- ✅ `getRunStats()` - 获取运行统计（按状态、阶段分组）
- ✅ `getPerformanceAnalysis()` - 性能分析（P50/P95/P99 延迟等）
- ✅ `getAttemptById()` - 获取 TripAttempt 详情

### 2. Admin API 接口

**文件**: `src/agent/agent-admin.controller.ts`

**接口**:
- ✅ `GET /api/agent/admin/runs` - 获取运行列表
- ✅ `GET /api/agent/admin/runs/:id` - 获取运行详情
- ✅ `GET /api/agent/admin/runs/stats` - 获取统计信息
- ✅ `GET /api/agent/admin/performance` - 获取性能分析
- ✅ `GET /api/agent/admin/attempts/:id` - 获取尝试详情

## ⚠️ 可能缺失的功能

### 1. 创建 TripRun 记录

**状态**: ❓ **未找到创建代码**

**需要实现的位置**:
- Agent 服务启动时创建 TripRun
- 规划工作台开始规划时创建 TripRun
- Context Engineer 开始处理请求时创建 TripRun

**建议实现位置**:
```typescript
// 在以下服务中添加创建逻辑：
- src/agent/services/agent.service.ts (routeAndRun 方法)
- src/agent/services/planning-workbench-agent.service.ts
- src/agent/context-engine/services/context-engineer.service.ts
```

### 2. 创建 TripAttempt 记录

**状态**: ❓ **未找到创建代码**

**需要实现的位置**:
- 每次生成候选方案时创建 TripAttempt
- 每次迭代规划时创建新的 TripAttempt

### 3. 更新 TripRun 状态

**状态**: ❓ **未找到更新代码**

**需要实现**:
- 规划完成时更新 `status = 'COMPLETED'` 和 `completedAt`
- 规划失败时更新 `status = 'FAILED'`
- 更新 `currentAgent` 字段

## 📊 当前状态总结

| 功能 | 状态 | 说明 |
|------|------|------|
| 数据库表结构 | ✅ 已定义 | TripRun 和 TripAttempt 表已存在 |
| 查询接口 | ✅ 已实现 | Admin API 可以查询记录 |
| 创建记录 | ❓ 未找到 | 需要实现创建逻辑 |
| 更新记录 | ❓ 未找到 | 需要实现更新逻辑 |
| 统计功能 | ✅ 已实现 | 可以统计已有记录 |

## 🔍 验证方法

### 1. 检查数据库中是否有记录

```sql
-- 查看 TripRun 记录数量
SELECT COUNT(*) FROM trip_runs;

-- 查看最近的 TripRun 记录
SELECT * FROM trip_runs ORDER BY created_at DESC LIMIT 10;

-- 查看 TripAttempt 记录数量
SELECT COUNT(*) FROM trip_attempts;
```

### 2. 检查 API 是否返回数据

```bash
# 获取运行列表
curl http://localhost:3000/api/agent/admin/runs

# 获取统计信息
curl http://localhost:3000/api/agent/admin/runs/stats
```

## 💡 建议

### 如果需要启用记录功能：

1. **在 Agent 服务中添加创建逻辑**:
   ```typescript
   // 在 agent.service.ts 的 routeAndRun 方法开始时
   const tripRun = await this.prisma.tripRun.create({
     data: {
       tripId: request.trip_id,
       userId: request.user_id,
       userQuery: request.message,
       planningPhase: 'INITIAL',
       status: 'IN_PROGRESS',
     },
   });
   ```

2. **在规划迭代时创建 TripAttempt**:
   ```typescript
   const attempt = await this.prisma.tripAttempt.create({
     data: {
       tripRunId: tripRun.id,
       attemptNumber: attemptNumber,
       planOutline: planOutline,
       status: 'IN_PROGRESS',
     },
   });
   ```

3. **在完成时更新状态**:
   ```typescript
   await this.prisma.tripRun.update({
     where: { id: tripRun.id },
     data: {
       status: 'COMPLETED',
       completedAt: new Date(),
     },
   });
   ```

## 📚 相关文件

- **Schema**: `prisma/schema.prisma` (行 1042-1097)
- **Admin Service**: `src/agent/services/agent-run-admin.service.ts`
- **Admin Controller**: `src/agent/agent-admin.controller.ts`
- **API 文档**: `AGENT_ADMIN_API_TEST_RESULTS.md`

## ✅ 结论

**数据库表结构已存在**，**查询和管理接口已实现**，但**创建和更新记录的代码可能还没有集成到 Agent 运行流程中**。

如果需要完整的运行记录功能，需要在 Agent 服务的适当位置添加创建和更新 TripRun/TripAttempt 的逻辑。
