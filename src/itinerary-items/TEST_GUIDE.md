# 行程项更新接口测试指南

## 快速测试

### 方法 1: 使用测试脚本（推荐）

```bash
# 1. 设置认证 token（如果需要）
export ACCESS_TOKEN=your_token_here

# 2. 运行测试脚本
npx ts-node scripts/test-itinerary-items-update.ts http://localhost:3000

# 或者指定具体的行程项 ID
npx ts-node scripts/test-itinerary-items-update.ts http://localhost:3000 <itemId>
```

### 方法 2: 使用 curl 命令

#### 1. 获取行程项详情

```bash
curl -X GET "http://localhost:3000/api/itinerary-items/<itemId>" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

#### 2. 获取当天的所有行程项（更新前）

```bash
curl -X GET "http://localhost:3000/api/itinerary-items?tripDayId=<tripDayId>" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

#### 3. 更新行程项开始时间（触发智能调整）

```bash
curl -X PATCH "http://localhost:3000/api/itinerary-items/<itemId>" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "startTime": "2024-05-01T10:30:00.000Z"
  }'
```

#### 4. 再次获取当天的所有行程项（验证后续项是否被调整）

```bash
curl -X GET "http://localhost:3000/api/itinerary-items?tripDayId=<tripDayId>" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

### 方法 3: 使用 Postman 或类似工具

1. **创建请求**
   - Method: `PATCH`
   - URL: `http://localhost:3000/api/itinerary-items/{itemId}`
   - Headers:
     - `Content-Type: application/json`
     - `Authorization: Bearer YOUR_TOKEN` (如果需要)

2. **请求体** (Body -> raw -> JSON)
   ```json
   {
     "startTime": "2024-05-01T10:30:00.000Z"
   }
   ```

3. **发送请求并查看响应**

## 测试场景

### 场景 1: 正常更新（触发智能调整）

**前提条件**:
- 有一个包含至少 2 个行程项的 TripDay
- 这些行程项都关联了有位置信息的 Place

**测试步骤**:
1. 获取当天的所有行程项，记录时间
2. 更新第二个行程项的开始时间（例如推迟 30 分钟）
3. 再次获取当天的所有行程项
4. 验证：
   - 第二个行程项的时间已更新
   - 后续行程项的时间是否被自动调整
   - 时间安排是否合理（后续项的开始时间应该晚于前一项的结束时间）

**预期结果**:
- 更新成功
- 后续行程项的时间被自动调整
- 时间安排合理

### 场景 2: 时间不合理警告

**测试步骤**:
1. 获取一个行程项的开始时间
2. 将开始时间设置为一个明显不合理的时间（例如早于前一个行程项结束时间 1 小时）
3. 发送更新请求

**预期结果**:
- 返回错误响应
- 错误信息包含："时间可能不合理：根据实际距离（X.Xkm）和交通方式（XXX），预计需要 X 分钟，建议开始时间不早于 XX:XX"

### 场景 3: 只更新备注（不触发时间调整）

**测试步骤**:
1. 更新行程项的备注字段
2. 不更新 startTime 或 endTime

**预期结果**:
- 更新成功
- 不会触发时间调整
- 其他行程项的时间不变

### 场景 4: 更新结束时间（不触发智能调整）

**测试步骤**:
1. 只更新 endTime，不更新 startTime

**预期结果**:
- 更新成功
- 不会触发后续行程项的自动调整
- 但会重新校验营业时间

## 验证要点

### 1. 智能时间调整是否生效

检查点：
- ✅ 后续行程项的开始时间是否被调整
- ✅ 调整后的时间是否考虑了旅行时间
- ✅ 行程项之间是否有合理的缓冲时间（15分钟）

### 2. 交通方式选择是否正确

根据距离：
- < 2km → 步行（WALKING）
- 2-50km → 驾车（DRIVING）
- > 50km → 公共交通（TRANSIT）

### 3. 时间安排是否合理

检查点：
- ✅ 每个行程项的开始时间晚于前一个的结束时间
- ✅ 时间安排符合实际旅行时间
- ✅ 没有时间冲突

## 常见问题

### Q: 401 Unauthorized 错误

**原因**: 接口需要认证，但没有提供有效的 token 或 token 已过期

**解决方案**:

#### 方案 1: 获取有效的 Token（推荐）

1. **通过前端登录获取 token**
   - 在浏览器中登录应用
   - 从开发者工具的 Network 标签中获取 `Authorization` header 中的 token

2. **通过 API 登录获取 token**
   ```bash
   # 使用邮箱登录
   curl -X POST "http://localhost:3000/api/auth/email/login" \
     -H "Content-Type: application/json" \
     -d '{
       "email": "your@email.com",
       "code": "verification_code"
     }'
   ```
   响应中会包含 `accessToken`

3. **设置环境变量并运行测试**
   ```bash
   export ACCESS_TOKEN=your_valid_token_here
   npx ts-node scripts/test-itinerary-items-update.ts http://localhost:3000
   ```

#### 方案 2: 为测试接口添加 @Public() 装饰器（仅开发环境）

如果这是开发/测试环境，可以考虑为测试接口添加 `@Public()` 装饰器：

```typescript
import { Public } from '../auth/decorators/public.decorator';

@Public()  // 添加这个装饰器
@Get(':id')
async findOne(@Param('id') id: string) {
  // ...
}
```

**注意**: 生产环境不建议这样做，应该使用有效的认证 token。

### Q: 找不到测试数据

**原因**: 数据库中没有符合条件的行程项

**解决方案**:
1. 手动创建一个测试行程，包含至少 2 个有地点的行程项
2. 或者使用测试脚本时提供具体的 itemId

### Q: 时间没有被调整

**可能原因**:
1. 没有更新 startTime（只更新了其他字段）
2. SmartRoutesService 未注入或不可用
3. 前一个行程项或当前行程项没有位置信息
4. 地图 API 调用失败（降级处理，不抛出错误）

**检查方法**:
1. 确认请求中包含了 startTime
2. 检查日志中是否有相关错误
3. 确认 Place 有 location 或 metadata 中的坐标信息

## 调试技巧

### 1. 查看日志

在服务端查看日志，关注：
- 旅行时间计算日志
- 地图 API 调用日志
- 时间调整日志

### 2. 检查数据库

直接查询数据库，验证：
- 行程项的时间是否被更新
- Place 是否有位置信息

```sql
-- 查看行程项及其位置信息
SELECT 
  ii.id,
  ii."startTime",
  ii."endTime",
  p."nameCN",
  p.location,
  p.metadata
FROM "ItineraryItem" ii
LEFT JOIN "Place" p ON ii."placeId" = p.id
WHERE ii."tripDayId" = '<tripDayId>'
ORDER BY ii."startTime" ASC;
```

### 3. 使用 Swagger UI

如果项目启用了 Swagger，可以访问：
```
http://localhost:3000/api-docs
```

在 Swagger UI 中可以直接测试接口，无需手动构造请求。

## 测试数据准备

如果需要准备测试数据，可以使用以下 SQL：

```sql
-- 1. 创建一个测试行程
INSERT INTO "Trip" (id, "userId", destination, "startDate", "endDate", ...)
VALUES ('test-trip-id', 'user-id', 'IS', '2024-05-01', '2024-05-07', ...);

-- 2. 创建行程日期
INSERT INTO "TripDay" (id, "tripId", date)
VALUES ('test-day-id', 'test-trip-id', '2024-05-01');

-- 3. 创建行程项（需要关联有位置信息的 Place）
INSERT INTO "ItineraryItem" (id, "tripDayId", "placeId", type, "startTime", "endTime")
VALUES 
  ('item-1', 'test-day-id', <placeId1>, 'ACTIVITY', '2024-05-01T10:00:00Z', '2024-05-01T12:00:00Z'),
  ('item-2', 'test-day-id', <placeId2>, 'ACTIVITY', '2024-05-01T13:00:00Z', '2024-05-01T15:00:00Z'),
  ('item-3', 'test-day-id', <placeId3>, 'ACTIVITY', '2024-05-01T16:00:00Z', '2024-05-01T18:00:00Z');
```

确保 Place 有位置信息（location 字段或 metadata 中的坐标）。

