# Context API 前端快速参考

## 📖 文档位置

**前端接口文档**: [FRONTEND_API_DOCUMENTATION.md](./FRONTEND_API_DOCUMENTATION.md)

## 🎯 前端可用接口（4个）

| 接口 | 方法 | 路径 | 用途 |
|------|------|------|------|
| 指标统计 | GET | `/api/context/admin/metrics` | 获取 Context 使用情况统计 |
| Package 列表 | GET | `/api/context/admin/packages` | 获取 Context Package 列表 |
| Package 详情 | GET | `/api/context/admin/packages/:id` | 获取 Context Package 详情 |
| 分析报告 | GET | `/api/context/admin/analytics` | 获取 Context 分析报告 |

## 📦 快速开始

### 1. 导入类型定义

```typescript
import type {
  GetContextMetricsResponse,
  GetContextPackagesResponse,
  GetContextPackageDetailResponse,
  GetContextAnalyticsResponse,
} from '@/api/context-engine/dto/frontend-context-api.types';
```

### 2. 使用客户端函数

```typescript
import {
  getContextMetrics,
  getContextPackages,
  getContextPackageDetail,
  getContextAnalytics,
} from '@/api/context-engine/dto/frontend-context-api-client';

// 获取指标统计
const metrics = await getContextMetrics({
  startTime: '2025-01-01T00:00:00Z',
  endTime: '2025-01-31T23:59:59Z',
});

// 获取 Package 列表
const packages = await getContextPackages({
  page: 1,
  limit: 20,
  phase: 'planning',
});
```

## ⚠️ 重要提示

- ✅ **只使用 `/context/admin/*` 接口**（后台管理接口）
- ❌ **不要使用 `/context/build`, `/context/compress` 等接口**（智能体系统内部接口）

## 📚 完整文档

- [前端接口文档](./FRONTEND_API_DOCUMENTATION.md) - 详细的接口说明和示例
- [TypeScript 类型定义](./dto/frontend-context-api.types.ts) - 完整的类型定义
- [客户端示例代码](./dto/frontend-context-api-client.ts) - 可直接使用的客户端函数
