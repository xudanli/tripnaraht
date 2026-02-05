# Auto综合 API 接口文档

**版本**: 1.0  
**日期**: 2026-02-05  
**状态**: ✅ 已实现

---

## 📋 概述

Auto综合功能用于批量应用高优先级建议，帮助用户快速优化行程。**只应用高优先级建议（severity === BLOCKER）**，确保安全性和可靠性。

**决策依据**: 参考 `.claude/product-decisions/trip-detail-page-key-decisions.md`

---

## 🎯 接口信息

### 端点

```
POST /api/planning-workbench/auto-optimize
```

### 基础路径

```
/api/planning-workbench
```

---

## 📝 请求

### 请求方法

`POST`

### 请求头

```
Content-Type: application/json
```

### 请求体

```typescript
{
  tripId: string;        // 必需：行程 ID (UUID)
  preview?: boolean;     // 可选：是否预览模式（不实际应用），默认 false
  limit?: number;        // 可选：最多应用的建议数量，默认 10
}
```

### 请求示例

**预览模式**（推荐用于测试）:
```json
{
  "tripId": "f3626ff1-7a9b-46d9-8b8b-7f53a14583b1",
  "preview": true,
  "limit": 10
}
```

**实际应用模式**:
```json
{
  "tripId": "f3626ff1-7a9b-46d9-8b8b-7f53a14583b1",
  "preview": false,
  "limit": 10
}
```

---

## 📤 响应

### 成功响应（200 OK）

```typescript
{
  success: true,
  data: {
    success: boolean;              // 是否至少成功应用一个建议
    appliedCount: number;          // 成功应用的建议数量
    suggestions: Array<{
      id: string;                   // 建议 ID
      title: string;                // 建议标题
      severity: 'blocker' | 'warn' | 'info';  // 严重级别（只包含 BLOCKER）
      applied: boolean;             // 是否成功应用
      error?: string;               // 如果应用失败，错误信息
    }>;
    impact?: {
      metrics?: {
        fatigue?: number;          // 疲劳指数变化
        buffer?: number;            // 缓冲时间变化（分钟）
        cost?: number;              // 费用变化
      };
      risks?: Array<{
        id: string;
        severity: string;
        title: string;
      }>;
    };
  }
}
```

### 响应示例

```json
{
  "success": true,
  "data": {
    "success": true,
    "appliedCount": 3,
    "suggestions": [
      {
        "id": "suggestion-1",
        "title": "Day 2 时间安排较紧凑",
        "severity": "blocker",
        "applied": true
      },
      {
        "id": "suggestion-2",
        "title": "预算超支 15%",
        "severity": "blocker",
        "applied": true
      },
      {
        "id": "suggestion-3",
        "title": "Day 3 缺少缓冲时间",
        "severity": "blocker",
        "applied": false,
        "error": "没有可执行的操作"
      }
    ],
    "impact": {
      "metrics": {
        "fatigue": -15,
        "buffer": 90,
        "cost": 150
      },
      "risks": []
    }
  }
}
```

### 错误响应

**400 Bad Request**:
```json
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "请求参数错误"
  }
}
```

**404 Not Found**:
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "行程 ID xxx 不存在"
  }
}
```

**500 Internal Server Error**:
```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "服务器内部错误"
  }
}
```

---

## 🔍 优先级说明

Auto综合功能**只应用高优先级建议**：

| 严重级别 | 优先级 | 是否应用 | 说明 |
|---------|--------|---------|------|
| `BLOCKER` | 高 | ✅ 是 | 阻塞性问题，必须解决 |
| `WARN` | 中 | ❌ 否 | 警告性问题，可选解决 |
| `INFO` | 低 | ❌ 否 | 信息性建议，仅供参考 |

**决策依据**: 参考 `.claude/product-decisions/trip-detail-page-key-decisions.md` 第3项决策

---

## 💡 使用场景

### 1. 预览模式（推荐）

查看将要应用的建议，不实际修改行程：

```bash
curl -X POST "http://localhost:3000/api/planning-workbench/auto-optimize" \
  -H "Content-Type: application/json" \
  -d '{
    "tripId": "f3626ff1-7a9b-46d9-8b8b-7f53a14583b1",
    "preview": true,
    "limit": 10
  }'
```

### 2. 实际应用

批量应用高优先级建议：

```bash
curl -X POST "http://localhost:3000/api/planning-workbench/auto-optimize" \
  -H "Content-Type: application/json" \
  -d '{
    "tripId": "f3626ff1-7a9b-46d9-8b8b-7f53a14583b1",
    "preview": false,
    "limit": 10
  }'
```

### 3. 限制应用数量

只应用前5个高优先级建议：

```bash
curl -X POST "http://localhost:3000/api/planning-workbench/auto-optimize" \
  -H "Content-Type: application/json" \
  -d '{
    "tripId": "f3626ff1-7a9b-46d9-8b8b-7f53a14583b1",
    "preview": false,
    "limit": 5
  }'
```

---

## 🧪 测试

### 使用测试脚本

**TypeScript 版本**:
```bash
# 设置环境变量（可选）
export API_BASE_URL=http://localhost:3000
export TRIP_ID=f3626ff1-7a9b-46d9-8b8b-7f53a14583b1

# 运行测试
npx ts-node scripts/test-auto-optimize-api.ts
```

**Shell 版本**:
```bash
# 设置环境变量（可选）
export API_BASE_URL=http://localhost:3000
export TRIP_ID=f3626ff1-7a9b-46d9-8b8b-7f53a14583b1

# 运行测试
bash scripts/test-auto-optimize-api.sh
```

### 测试覆盖

- ✅ 预览模式测试
- ✅ 实际应用模式测试（可选）
- ✅ 限制数量测试
- ✅ 优先级验证（只应用 BLOCKER）

---

## 🔗 相关接口

- `GET /api/trips/:id/suggestions` - 获取建议列表
- `POST /api/trips/:id/suggestions/:suggestionId/apply` - 应用单个建议
- `GET /api/trip-detail/:tripId/health` - 获取行程健康度

---

## 📚 相关文档

- [行程详情页 API 文档](./TRIP_DETAIL_API_DOCUMENTATION.md)
- [关键决策文档](../../.claude/product-decisions/trip-detail-page-key-decisions.md)
- [实现总结文档](../../.claude/implementation/trip-detail-decisions-implementation.md)

---

**文档状态**: ✅ 已完成  
**最后更新**: 2026-02-05
