# 规划工作台提交方案接口测试说明

## 接口信息

**接口路径**: `POST /planning-workbench/plans/:planId/commit`

**功能**: 将规划方案提交并保存到行程

## 前置条件

1. **确保服务器正在运行**
   ```bash
   npm run dev
   # 或
   npm run backend:dev
   ```

2. **准备测试数据**
   - 需要一个有效的 `planId`（PlanState ID）
   - 需要一个有效的 `tripId`（Trip ID）

## 测试方法

### 方法 1: 使用测试脚本（推荐）

```bash
# 运行完整测试套件
npm run test:planning-workbench-commit

# 或直接运行
npx ts-node scripts/test-planning-workbench-commit.ts
```

### 方法 2: 使用 curl 命令

#### 1. 全量提交

```bash
curl -X POST http://localhost:3000/planning-workbench/plans/{planId}/commit \
  -H "Content-Type: application/json" \
  -d '{
    "tripId": "your-trip-id",
    "options": {}
  }'
```

#### 2. 部分提交（指定天数）

```bash
curl -X POST http://localhost:3000/planning-workbench/plans/{planId}/commit \
  -H "Content-Type: application/json" \
  -d '{
    "tripId": "your-trip-id",
    "options": {
      "partialCommit": true,
      "commitDays": [1, 2, 3]
    }
  }'
```

### 方法 3: 使用 Swagger UI

1. 访问 `http://localhost:3000/api`（Swagger 文档）
2. 找到 `planning-workbench` 标签
3. 展开 `POST /planning-workbench/plans/{planId}/commit`
4. 点击 "Try it out"
5. 填写参数并执行

## 测试用例

### 测试用例 1: 全量提交

**请求**:
```json
{
  "tripId": "trip-123",
  "options": {}
}
```

**期望响应**:
```json
{
  "success": true,
  "data": {
    "tripId": "trip-123",
    "planId": "plan-456",
    "committedAt": "2026-01-20T12:00:00.000Z",
    "changes": {
      "added": 5,
      "modified": 2,
      "removed": 0
    }
  }
}
```

### 测试用例 2: 部分提交

**请求**:
```json
{
  "tripId": "trip-123",
  "options": {
    "partialCommit": true,
    "commitDays": [1, 2]
  }
}
```

**期望响应**:
```json
{
  "success": true,
  "data": {
    "tripId": "trip-123",
    "planId": "plan-456",
    "committedAt": "2026-01-20T12:00:00.000Z",
    "changes": {
      "added": 2,
      "modified": 0,
      "removed": 0
    }
  }
}
```

### 测试用例 3: 无效的 Plan ID

**请求**:
```json
{
  "tripId": "trip-123",
  "options": {}
}
```

**期望响应** (404):
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "找不到规划方案: invalid-plan-id"
  }
}
```

### 测试用例 4: 无效的 Trip ID

**请求**:
```json
{
  "tripId": "invalid-trip-id",
  "options": {}
}
```

**期望响应** (404):
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "找不到行程: invalid-trip-id"
  }
}
```

## 准备测试数据

### 方法 1: 通过规划工作台创建 PlanState

```bash
# 1. 生成规划方案
curl -X POST http://localhost:3000/planning-workbench/execute \
  -H "Content-Type: application/json" \
  -d '{
    "context": {
      "destination": {
        "country": "IS",
        "city": "Reykjavik"
      },
      "days": 3,
      "travelMode": "self_drive"
    },
    "userAction": "generate"
  }'

# 2. 从响应中获取 planId 和 tripId
# planId: response.data.planState.plan_id
# tripId: response.data.planState.itinerary.tripId
```

### 方法 2: 使用环境变量

```bash
export TEST_PLAN_ID="plan_1234567890"
export TEST_TRIP_ID="trip_1234567890"
npm run test:planning-workbench-commit
```

## 验证要点

1. ✅ **接口可访问**: HTTP 200 状态码
2. ✅ **全量提交**: 成功提交整个 PlanState
3. ✅ **部分提交**: 成功提交指定天数的方案
4. ✅ **变更统计**: 正确计算 added/modified/removed
5. ✅ **错误处理**: 无效 ID 返回 404
6. ✅ **数据持久化**: PlanState 保存到 Trip metadata
7. ✅ **状态更新**: PlanState 状态正确更新（PROPOSED/LOCKED）

## 常见问题

### Q: 连接被拒绝 (ECONNREFUSED)

**A**: 确保服务器正在运行
```bash
npm run dev
```

### Q: 找不到规划方案 (404)

**A**: 确保 planId 存在，可以通过以下方式检查：
```bash
curl http://localhost:3000/planning-workbench/state/{planId}
```

### Q: 找不到行程 (404)

**A**: 确保 tripId 存在，可以通过以下方式检查：
```bash
curl http://localhost:3000/api/trips/{tripId}
```

## 调试技巧

1. **查看服务器日志**: 检查是否有错误信息
2. **使用 Swagger UI**: 可视化测试接口
3. **检查数据库**: 确认 PlanState 是否正确保存到 Trip metadata
4. **检查 StateStore**: 如果启用了 StateStore，检查状态是否正确更新
