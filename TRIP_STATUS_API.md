# 行程状态 API 接口文档

## 📋 概述

本文档描述行程状态相关的 API 接口，包括状态读取和状态更新功能。

---

## 🔍 状态枚举

### TripStatus

行程状态枚举值：

```typescript
enum TripStatus {
  PLANNING = 'PLANNING',        // 规划中（行程尚未开始）
  IN_PROGRESS = 'IN_PROGRESS',  // 进行中（行程正在进行）
  COMPLETED = 'COMPLETED',      // 已完成（行程已结束）
  CANCELLED = 'CANCELLED'       // 已取消（行程被取消）
}
```

---

## 📖 接口列表

### 1. 获取行程详情（包含状态）

**接口**: `GET /trips/:id`

**描述**: 获取单个行程的完整详情，包括状态信息。

**路径参数**:
- `id` (string, required): 行程 ID (UUID)

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": "f3626ff1-7a9b-46d9-8b8b-7f53a14583b1",
    "destination": "JP",
    "startDate": "2024-05-01T00:00:00.000Z",
    "endDate": "2024-05-05T00:00:00.000Z",
    "status": "PLANNING",
    "budgetConfig": {
      "totalBudget": 20000
    },
    "stats": {
      "totalDays": 5,
      "totalItems": 15,
      "totalActivities": 10,
      "progress": "PLANNING"
    },
    // ... 其他字段
  }
}
```

**状态字段说明**:
- `status`: 行程状态（顶层字段，优先使用数据库中的值）
- `stats.progress`: 向后兼容字段，值与 `status` 相同

**状态计算逻辑**:
1. 如果数据库中存在 `status` 字段，直接使用该值
2. 如果 `status` 为空，根据日期自动计算：
   - 当前时间 < 开始日期 → `PLANNING`
   - 开始日期 ≤ 当前时间 ≤ 结束日期 → `IN_PROGRESS`
   - 当前时间 > 结束日期 → `COMPLETED`

---

### 2. 更新行程信息（支持状态更新）

**接口**: `PUT /trips/:id`

**描述**: 更新行程的基本信息，包括目的地、日期、预算、旅行者、状态等。支持部分更新（只更新提供的字段）。

**路径参数**:
- `id` (string, required): 行程 ID (UUID)

**请求体** (`UpdateTripDto`):
```typescript
{
  destination?: string;        // 目的地国家代码（ISO 3166-1 alpha-2）
  startDate?: string;         // 开始日期（ISO 8601 格式）
  endDate?: string;           // 结束日期（ISO 8601 格式）
  totalBudget?: number;       // 总预算（单位：人民币 CNY）
  travelers?: TravelerDto[];  // 旅行者列表
  status?: TripStatus;        // 行程状态（可选）
}
```

**请求示例**:
```json
{
  "status": "IN_PROGRESS"
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": "f3626ff1-7a9b-46d9-8b8b-7f53a14583b1",
    "status": "IN_PROGRESS",
    // ... 其他字段
  }
}
```

**状态更新规则**:

1. ✅ **允许的状态转换**:
   - `PLANNING` → `IN_PROGRESS`
   - `PLANNING` → `COMPLETED`
   - `PLANNING` → `CANCELLED`
   - `IN_PROGRESS` → `COMPLETED`
   - `IN_PROGRESS` → `CANCELLED`
   - `IN_PROGRESS` → `PLANNING`（允许重新规划）
   - `COMPLETED` → `CANCELLED`（允许标记为取消）

2. ❌ **不允许的状态转换**:
   - `CANCELLED` → 任何其他状态（已取消的行程不能修改状态）
   - `COMPLETED` → `PLANNING`（已完成的行程不能改回规划中）
   - `COMPLETED` → `IN_PROGRESS`（已完成的行程不能改回进行中）

**错误响应**:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "已取消的行程不能修改状态"
  }
}
```

或

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "已完成的行程不能改回规划中或进行中状态"
  }
}
```

---

## 🔧 状态转换验证逻辑

### 验证规则

```typescript
function validateStatusTransition(currentStatus: string | null, newStatus: TripStatus): void {
  // 1. 如果当前状态为空，允许设置为任何状态
  if (!currentStatus) {
    return;
  }

  // 2. 已取消的行程不能改回其他状态
  if (currentStatus === TripStatus.CANCELLED) {
    throw new BadRequestException('已取消的行程不能修改状态');
  }

  // 3. 已完成的行程不能改回规划中或进行中
  if (currentStatus === TripStatus.COMPLETED && 
      (newStatus === TripStatus.PLANNING || newStatus === TripStatus.IN_PROGRESS)) {
    throw new BadRequestException('已完成的行程不能改回规划中或进行中状态');
  }

  // 4. 其他状态转换都是允许的
}
```

---

## 📝 使用示例

### 示例 1: 将行程状态改为"进行中"

```bash
curl -X PUT http://localhost:3000/api/trips/f3626ff1-7a9b-46d9-8b8b-7f53a14583b1 \
  -H "Content-Type: application/json" \
  -d '{
    "status": "IN_PROGRESS"
  }'
```

### 示例 2: 将行程状态改为"已完成"

```bash
curl -X PUT http://localhost:3000/api/trips/f3626ff1-7a9b-46d9-8b8b-7f53a14583b1 \
  -H "Content-Type: application/json" \
  -d '{
    "status": "COMPLETED"
  }'
```

### 示例 3: 将行程状态改为"已取消"

```bash
curl -X PUT http://localhost:3000/api/trips/f3626ff1-7a9b-46d9-8b8b-7f53a14583b1 \
  -H "Content-Type: application/json" \
  -d '{
    "status": "CANCELLED"
  }'
```

### 示例 4: 同时更新多个字段（包括状态）

```bash
curl -X PUT http://localhost:3000/api/trips/f3626ff1-7a9b-46d9-8b8b-7f53a14583b1 \
  -H "Content-Type: application/json" \
  -d '{
    "status": "IN_PROGRESS",
    "totalBudget": 25000
  }'
```

---

## 🧪 测试用例

### 测试用例 1: 状态读取
- ✅ 验证 `GET /trips/:id` 返回正确的 `status` 值
- ✅ 验证所有状态值（PLANNING, IN_PROGRESS, COMPLETED, CANCELLED）都能正确显示

### 测试用例 2: 状态更新 - 正常转换
- ✅ 测试从"规划中"改为"进行中"
- ✅ 测试从"进行中"改为"已完成"
- ✅ 测试从"进行中"改为"已取消"
- ✅ 测试从"规划中"改为"已取消"

### 测试用例 3: 状态更新 - 无效转换
- ✅ 测试从"已完成"改回"规划中"（应返回错误）
- ✅ 测试从"已完成"改回"进行中"（应返回错误）
- ✅ 测试从"已取消"改为任何其他状态（应返回错误）

### 测试用例 4: UI 显示
- ✅ 验证状态 Badge 颜色正确
- ✅ 验证 Tab 显示/隐藏逻辑正确
- ✅ 验证状态修改确认对话框正常显示

---

## 🔄 数据库迁移

### Prisma Schema 变更

```prisma
model Trip {
  id               String             @id
  destination      String
  startDate        DateTime
  endDate          DateTime
  status           String?            @default("PLANNING") // 新增字段
  budgetConfig     Json?
  pacingConfig     Json?
  createdAt        DateTime           @default(now())
  updatedAt        DateTime
  metadata         Json?
  // ... 其他字段
  
  @@index([status]) // 新增索引
}
```

### 迁移步骤

1. 运行 Prisma 迁移生成：
```bash
npx prisma migrate dev --name add_trip_status
```

2. 对于现有数据，`status` 字段默认为 `null`，系统会根据日期自动计算状态。

---

## 📌 注意事项

1. **状态优先级**: 数据库中的 `status` 字段优先于自动计算的状态
2. **向后兼容**: `stats.progress` 字段保持向后兼容，值与 `status` 相同
3. **状态验证**: 所有状态更新都会经过合法性验证
4. **默认状态**: 新建行程时，如果没有指定 `status`，默认为 `PLANNING`
5. **索引优化**: `status` 字段已添加索引，支持按状态查询

---

## 🔗 相关接口

- `GET /trips` - 获取行程列表（支持按状态筛选，待实现）
- `POST /trips` - 创建行程（支持指定初始状态）
- `PUT /trips/:id` - 更新行程信息（包括状态）

---

## 📅 更新日志

- **2024-XX-XX**: 初始版本，支持行程状态读取和更新
  - 添加 `status` 字段到 Trip 模型
  - 实现状态更新接口
  - 添加状态转换验证逻辑
  - 更新 API 文档
