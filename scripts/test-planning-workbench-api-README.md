# 规划工作台 API 测试指南

## 前置条件

1. **启动服务器**
   ```bash
   npm run start:dev
   # 或
   npm run start
   ```

2. **确认服务器运行在** `http://localhost:3000`

## 运行测试

### TypeScript 测试脚本

```bash
# 设置API地址（可选，默认 http://localhost:3000）
export API_BASE_URL=http://localhost:3000

# 运行测试
npx ts-node scripts/test-planning-workbench-api.ts
```

### Shell 测试脚本

```bash
# 设置API地址（可选）
export API_BASE_URL=http://localhost:3000

# 运行测试
bash scripts/test-planning-workbench-api.sh
```

## 测试覆盖

### ✅ 测试1: 生成方案（generate）
- 测试生成行程骨架方案
- 验证 DEM 数据填充（distanceKm, ascentM, slopePct）
- 验证地理特征填充（geoFeatures, hazards）
- 验证决策追溯链（exclusionLog, decisionTrace）

### ✅ 测试2: 对比方案（compare）
- 测试对比多个骨架方案
- 验证对比结果（comparison）
- 验证推荐方案（recommendation）

### ✅ 测试3: 提交方案（commit）
- 测试提交选定的骨架方案
- 验证 DEM 数据填充
- 验证方案状态更新

### ✅ 测试4: 获取方案详情
- 测试获取方案详情
- 验证排除日志（exclusionLog）
- 验证决策追溯（decisionTrace）

## 手动测试示例

### 1. 生成方案

```bash
curl -X POST "http://localhost:3000/api/planning-workbench/execute" \
  -H "Content-Type: application/json" \
  -d '{
    "context": {
      "destination": {
        "country": "冰岛"
      },
      "days": 5,
      "travelMode": "self_drive",
      "constraints": {
        "budget": {
          "total": 50000,
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

### 2. 对比方案

```bash
curl -X POST "http://localhost:3000/api/planning-workbench/execute" \
  -H "Content-Type: application/json" \
  -d '{
    "context": {
      "destination": { "country": "冰岛" },
      "days": 5
    },
    "userAction": "compare",
    "skeletonOptions": {
      "options": [
        {
          "id": "compact_1",
          "name": "紧凑型",
          "dayThemes": [...]
        },
        {
          "id": "balanced_1",
          "name": "均衡型",
          "dayThemes": [...]
        }
      ]
    }
  }'
```

### 3. 提交方案

```bash
curl -X POST "http://localhost:3000/api/planning-workbench/execute" \
  -H "Content-Type: application/json" \
  -d '{
    "context": {
      "destination": { "country": "冰岛" },
      "days": 5
    },
    "userAction": "commit",
    "selectedOptionId": "balanced_1",
    "tripId": "test_trip_123"
  }'
```

## 验证要点

### DEM数据验证
检查响应中的 `segments` 数组，每个 segment 应该包含：
- `distanceKm > 0`
- `ascentM >= 0`
- `slopePct >= 0`
- `metadata.elevation`（可选）
- `metadata.terrainComplexity`（可选）

### 地理特征验证
检查 `segments[].metadata` 应该包含：
- `geoFeatures.rivers`
- `geoFeatures.mountains`
- `geoFeatures.roads`
- `geoFeatures.coastlines`
- `hazards`（如果有危险区域）

### 决策追溯验证
检查 `planState.metadata` 应该包含：
- `exclusionLog`（数组，记录排除的方案）
- `decisionTrace.skeletonSelection`（记录选择过程）

## 故障排查

### 连接失败
- 确认服务器已启动：`curl http://localhost:3000/health` 或检查端口监听
- 检查 `API_BASE_URL` 环境变量是否正确

### DEM数据未填充
- 检查 POI 是否有坐标信息
- 检查 `DEMEffortMetadataService` 是否正常注入
- 查看服务器日志中的错误信息

### 地理特征未填充
- 检查 `GeoFactsService` 是否正常注入
- 检查数据库中的地理数据是否完整
- 查看服务器日志中的警告信息

### 对比功能失败
- 确认 `skeletonOptions` 中包含至少2个方案
- 检查 `PlanArchitectCompareOptionsSkill` 是否正常注入

## 相关文档

- API文档: `/src/agent/PLANNING_WORKBENCH_API.md`
- 流程文档: `/src/agent/PLANNING_WORKBENCH_FLOW.md`
- 评估报告: `/src/agent/PLANNING_WORKBENCH_FLOW_EVALUATION.md`
