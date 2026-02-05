# 健康度指标解释 API 测试指南

## 问题描述

访问 `/api/trip-detail/:tripId/metrics/:dimension/explanation` 接口时返回 404 错误。

## 原因分析

路由定义已正确，但服务器可能需要重启才能加载新的路由。

## 解决方案

### 1. 确认路由定义

路由已定义在 `src/agent/trip-detail.controller.ts`:

```typescript
@Public()
@Get(':tripId/metrics/:dimension/explanation')
async getMetricExplanation(
  @Param('tripId') tripId: string,
  @Param('dimension') dimension: 'schedule' | 'budget' | 'pace' | 'feasibility'
)
```

### 2. 重启服务器

**重要**: 如果路由仍然返回 404，请重启 NestJS 服务器：

```bash
# 如果使用 npm start
npm run start:dev

# 或者如果使用其他启动方式，请重启服务器
```

### 3. 测试接口

```bash
# 测试可行性维度解释
curl -X GET "http://localhost:3000/api/trip-detail/288cdbf7-8ff6-417d-88be-766435335eea/metrics/feasibility/explanation"

# 测试节奏维度解释
curl -X GET "http://localhost:3000/api/trip-detail/288cdbf7-8ff6-417d-88be-766435335eea/metrics/pace/explanation"

# 测试预算维度解释
curl -X GET "http://localhost:3000/api/trip-detail/288cdbf7-8ff6-417d-88be-766435335eea/metrics/budget/explanation"

# 测试时间安排维度解释
curl -X GET "http://localhost:3000/api/trip-detail/288cdbf7-8ff6-417d-88be-766435335eea/metrics/schedule/explanation"
```

### 4. 预期响应

```json
{
  "success": true,
  "data": {
    "dimension": "feasibility",
    "dimensionName": "行程可行性",
    "description": "评估行程的可行性，包括可达性、开放时间等",
    "currentScore": 100,
    "currentStatus": "healthy",
    "overallStatus": "healthy",
    "calculationMethod": "...",
    "idealRange": "...",
    "issues": [],
    "suggestions": [],
    "impact": "low",
    "lastUpdated": "2026-02-05T13:10:00.000Z"
  }
}
```

## 路由顺序说明

路由已调整为正确的顺序：
1. `:tripId/metrics/:dimension/explanation` (更具体，放在前面)
2. `:tripId/health` (更通用，放在后面)

这样可以确保 NestJS 正确匹配路由。

## 验证步骤

1. ✅ 确认路由定义存在
2. ✅ 确认路由顺序正确
3. ⚠️ **需要重启服务器**以加载新路由
4. ⏳ 测试接口是否正常工作

## 相关文件

- `src/agent/trip-detail.controller.ts` - 路由定义
- `src/agent/agent.module.ts` - 控制器注册
