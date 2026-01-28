# 规划工作台证据获取接口测试指南

## 前置条件

1. **确保服务已启动**
   ```bash
   npm run start:dev
   ```

2. **确保有测试行程数据**
   - 可以通过 API 获取：`GET /api/trips?limit=1`
   - 或使用已知的 tripId

## 测试方法

### 方法 1: 使用 TypeScript 测试脚本（推荐）

```bash
# 自动查找 tripId
npx ts-node scripts/test-planning-workbench-evidence.ts

# 指定 tripId
npx ts-node scripts/test-planning-workbench-evidence.ts <tripId>
```

### 方法 2: 使用 Bash 测试脚本（需要安装 jq）

```bash
# 安装 jq（如果未安装）
# Ubuntu/Debian: sudo apt-get install jq
# macOS: brew install jq

# 运行测试
./scripts/test-planning-workbench-evidence.sh

# 指定 tripId
./scripts/test-planning-workbench-evidence.sh <tripId>
```

### 方法 3: 使用 curl 手动测试

#### 1. 获取准备度检查结果（查看缺少的证据）

```bash
curl -X GET "http://localhost:3000/api/planning-workbench/trips/{tripId}/readiness?lang=zh"
```

#### 2. 综合证据获取接口 - 获取所有类型的证据

```bash
curl -X POST "http://localhost:3000/api/planning-workbench/trips/{tripId}/fetch-evidence"
```

#### 3. 只获取天气数据

```bash
curl -X POST "http://localhost:3000/api/planning-workbench/trips/{tripId}/fetch-evidence?evidenceTypes=weather"
```

#### 4. 只获取道路封闭信息

```bash
curl -X POST "http://localhost:3000/api/planning-workbench/trips/{tripId}/fetch-evidence?evidenceTypes=road_closure"
```

#### 5. 只获取开放时间

```bash
curl -X POST "http://localhost:3000/api/planning-workbench/trips/{tripId}/fetch-evidence?evidenceTypes=opening_hours"
```

#### 6. 获取天气和道路封闭信息（组合）

```bash
curl -X POST "http://localhost:3000/api/planning-workbench/trips/{tripId}/fetch-evidence?evidenceTypes=weather,road_closure"
```

#### 7. 为指定地点获取证据

```bash
curl -X POST "http://localhost:3000/api/planning-workbench/trips/{tripId}/fetch-evidence?placeIds=1,2,3"
```

#### 8. 强制刷新已有证据

```bash
curl -X POST "http://localhost:3000/api/planning-workbench/trips/{tripId}/fetch-evidence?forceRefresh=true"
```

### 方法 4: 使用 Swagger UI

1. 启动服务后访问：`http://localhost:3000/api-docs`
2. 找到 `planning-workbench` 标签
3. 展开相关接口并点击 "Try it out"
4. 输入参数并执行

## 测试检查点

### 1. 接口响应检查

- ✅ 响应状态码应为 200
- ✅ `success` 字段应为 `true`
- ✅ `data` 字段应包含结果数据

### 2. 数据完整性检查

- ✅ `totalPlaces`: 总地点数应大于 0
- ✅ `processedPlaces`: 已处理地点数应大于 0
- ✅ `results`: 结果数组应包含处理详情

### 3. 证据类型检查

检查 `results` 中的每个结果：
- ✅ `status`: 应为 `success`、`partial` 或 `failed`
- ✅ `evidenceTypes`: 应包含成功获取的证据类型数组
- ✅ `fetched`: 应包含获取的证据数据摘要
- ✅ `errors`: 如果失败，应包含错误信息

### 4. 数据库更新检查

获取证据后，可以：
1. 重新调用准备度检查接口，查看必须项数量是否减少
2. 直接查询数据库，检查 `Place.metadata` 是否包含新的证据数据

```sql
-- 检查天气数据
SELECT id, "nameCN", metadata->'weatherInfo' as weather_info
FROM "Place"
WHERE metadata->'weatherInfo' IS NOT NULL
LIMIT 5;

-- 检查道路封闭信息
SELECT id, "nameCN", metadata->'roadStatus' as road_status
FROM "Place"
WHERE metadata->'roadStatus' IS NOT NULL
LIMIT 5;

-- 检查开放时间
SELECT id, "nameCN", metadata->'openingHours' as opening_hours
FROM "Place"
WHERE metadata->'openingHours' IS NOT NULL
LIMIT 5;
```

## 常见问题

### 1. 服务未运行

**错误**: `服务未运行或不可访问`

**解决**: 
```bash
npm run start:dev
```

### 2. 找不到行程

**错误**: `未找到任何行程`

**解决**: 
- 确保数据库中有行程数据
- 或手动提供 tripId: `npx ts-node scripts/test-planning-workbench-evidence.ts <tripId>`

### 3. 天气数据获取失败

**可能原因**:
- 地点没有坐标信息
- 天气 API 不可用或配额用尽
- 网络连接问题

**检查**:
```sql
-- 检查地点是否有坐标
SELECT id, "nameCN", location, metadata->'lat' as lat, metadata->'lng' as lng
FROM "Place"
WHERE id IN (SELECT DISTINCT "placeId" FROM "ItineraryItem" WHERE "tripDayId" IN (SELECT id FROM "TripDay" WHERE "tripId" = '{tripId}'))
LIMIT 10;
```

### 4. 道路封闭信息获取失败

**可能原因**:
- 地点没有坐标信息
- 该地区不支持路况查询（非冰岛地区可能不支持）
- 路况 API 不可用

### 5. 开放时间获取失败

**可能原因**:
- 地点类别不是 `ATTRACTION`（仅支持 ATTRACTION 类别）
- 高德地图 API 不可用
- 地点名称无法匹配

**检查**:
```sql
-- 检查地点类别
SELECT id, "nameCN", category
FROM "Place"
WHERE id IN (SELECT DISTINCT "placeId" FROM "ItineraryItem" WHERE "tripDayId" IN (SELECT id FROM "TripDay" WHERE "tripId" = '{tripId}'))
LIMIT 10;
```

## 预期结果

### 成功场景

1. **所有证据类型都成功获取**:
   - `successCount` > 0
   - `failedCount` = 0
   - 所有结果的 `status` = `success`

2. **部分成功**:
   - `successCount` > 0 或 `partialCount` > 0
   - 某些结果的 `status` = `partial` 或 `failed`
   - `errors` 字段包含失败原因

3. **验证更新**:
   - 重新调用准备度检查接口
   - `totalMust` 数量应该减少（如果之前缺少证据）

### 失败场景

1. **所有地点都失败**:
   - `successCount` = 0
   - `failedCount` > 0
   - 所有结果的 `status` = `failed`
   - 需要检查错误信息

2. **服务错误**:
   - 响应 `success` = `false`
   - `error.message` 包含错误描述

## 性能注意事项

- 批量获取证据可能需要较长时间（特别是大量地点）
- 建议设置较长的超时时间（60秒或更长）
- 对于大量地点，考虑分批处理

## 环境变量

可以通过环境变量配置：

```bash
# 设置 API 基础 URL
export API_BASE_URL=http://localhost:3000/api

# 运行测试
npx ts-node scripts/test-planning-workbench-evidence.ts
```
