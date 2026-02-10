# 路线规划 + 世界模型构建测试指南

## 概述

本指南介绍如何使用路线规划脚本创建冰岛 F 路行程，并测试世界模型构建（包括 DEM 证据生成）。

---

## 脚本说明

### 1. `plan-route-and-test-world-model.ts`

**功能**:
- 创建冰岛 F 路行程（包含 10 个路线点）
- 生成行程天和行程项
- 查询所有路线点的 DEM 数据（使用冰岛 20m DEM）
- 计算完整的 DEM 证据（累计爬升、坡度、疲劳指数等）
- 生成详细的测试报告

**使用方法**:
```bash
npx tsx scripts/plan-route-and-test-world-model.ts
```

**输出**:
- 创建 Trip、TripDay、ItineraryItem 记录
- 显示所有路线点的 DEM 查询结果
- 生成完整的 DEM 证据报告（JSON 格式）
- 提供世界模型 API 测试命令

---

## 测试流程

### 步骤 1: 运行路线规划脚本

```bash
cd /home/devbox/project
npx tsx scripts/plan-route-and-test-world-model.ts
```

**预期输出**:
```
========================================
路线规划 + 世界模型构建测试
========================================

步骤 1: 创建冰岛 F 路行程...
  ✅ 行程创建成功: trip-iceland-froad-{timestamp}
  开始日期: 2026-02-11
  结束日期: 2026-02-18

步骤 2: 创建行程天和行程项...
  ✅ 第 1 天: 2 个行程项
  ✅ 第 2 天: 1 个行程项
  ...

步骤 3: 查询路线点 DEM 数据...
  ✅ Reykjavik: 5.4m (geo_dem_iceland_20m)
  ✅ Þingvellir: 104.3m (geo_dem_iceland_20m)
  ...

步骤 4: 计算路线 DEM 证据...
  ✅ 累计爬升: 1053.0m
  ✅ 最大坡度: 1.07%
  ✅ 3天滚动累计爬升: 1053.0m
  ✅ 疲劳指数: 5.18
  ✅ 海拔剖面点数: 10

步骤 5: 测试世界模型构建 API...
  提示: 使用以下命令测试世界模型 API:

  curl -X POST http://localhost:3000/api/world/buildContext \
    -H "Content-Type: application/json" \
    -d '{"tripId": "trip-iceland-froad-{timestamp}"}' | \
    python3 scripts/format-world-model-output.py

步骤 6: 生成完整报告...
{... JSON 报告 ...}

========================================
✅ 路线规划完成
✅ 行程 ID: trip-iceland-froad-{timestamp}
✅ 路线点数: 10
✅ DEM 证据已生成
========================================
```

### 步骤 2: 测试世界模型构建 API

**前提条件**: 确保服务器正在运行
```bash
npm run start:dev
```

**测试命令**:
```bash
# 替换 {trip-id} 为步骤 1 中生成的行程 ID
curl -X POST http://localhost:3000/api/world/buildContext \
  -H "Content-Type: application/json" \
  -d '{"tripId": "trip-iceland-froad-{timestamp}"}' | \
  python3 scripts/format-world-model-output.py
```

**预期输出**:
- PhysicalRealityModel（包含 DEM 证据）
- HumanCapabilityModel
- RouteDirection
- missingPieces（数据完整性检查）

---

## 路线点详情

脚本创建的冰岛 F 路行程包含以下 10 个路线点：

| 序号 | 名称 | 纬度 | 经度 | 天数 | 海拔 (m) |
|------|------|------|------|------|----------|
| 1 | Reykjavik | 64.1466 | -21.9426 | 1 | 5.4 |
| 2 | Þingvellir | 64.2553 | -21.1150 | 1 | 104.3 |
| 3 | Geysir | 64.3167 | -20.3000 | 2 | ~136 |
| 4 | Gullfoss | 64.3267 | -20.1200 | 2 | ~177 |
| 5 | Landmannalaugar | 63.9833 | -19.0667 | 3 | 631.6 |
| 6 | Vík | 63.4194 | -19.0067 | 4 | 7.6 |
| 7 | Jökulsárlón | 64.0489 | -16.1794 | 5 | ~4 |
| 8 | Askja 火山 | 65.0333 | -16.7500 | 6 | 1,058.4 |
| 9 | Mývatn | 65.6036 | -17.0000 | 7 | ~278 |
| 10 | Akureyri | 65.6836 | -18.1000 | 8 | 38.3 |

**总距离**: ~601 km  
**累计爬升**: ~1,053 m  
**最高点**: Askja 火山 (1,058.4 m)

---

## DEM 证据说明

### 生成的数据

1. **累计爬升** (`cumulativeAscent`)
   - 所有上坡段的海拔差总和
   - 单位: 米

2. **最大坡度** (`maxSlopePct`)
   - 路线中最陡峭的坡度百分比
   - 单位: %

3. **3天滚动累计爬升** (`rollingAscent3Days`)
   - 任意连续 3 天的最大累计爬升
   - 用于检测连续疲劳

4. **疲劳指数** (`fatigueIndex`)
   - 综合指标：`(累计爬升/1000) + (最大坡度/10) + (总距离/100000)`
   - 用于评估路线难度

5. **海拔剖面** (`elevationProfile`)
   - 每个路线点的距离、海拔、坡度
   - 用于可视化路线地形

### DEM 数据源

- **主要数据源**: `geo_dem_iceland_20m` (20m x 20m 精度)
- **坐标系**: ISN2016 (SRID 5327)
- **坐标转换**: WGS84 (4326) → ISN2016 (5327)

---

## 世界模型构建流程

### 1. 计划生成阶段

在 `WorldBuildContextSkill` 构建阶段，由于还没有具体路线，使用占位符 DEM 证据：

```typescript
demEvidence: [{
  segmentId: 'placeholder_no_plan_yet',
  elevationProfile: [],
  cumulativeAscent: 0,
  maxSlopePct: 0,
  rollingAscent3Days: 0,
  fatigueIndex: 0,
  violation: 'NONE',
  explanation: '占位符：计划生成阶段尚未有具体路线，DEM 证据将在计划生成后填充'
}]
```

### 2. 路线规划完成后

当路线规划完成，`DEMDecisionEvidenceService` 会：

1. 从路线段提取坐标点
2. 调用 `DEMElevationService.getElevation()` 获取海拔（使用冰岛 20m DEM）
3. 调用 `DEMEffortMetadataService.calculateEffortMetadata()` 计算：
   - 累计爬升
   - 最大坡度
   - 3天滚动累计爬升
   - 疲劳指数
4. 生成完整的 `DemDecisionEvidence`

### 3. 验证阶段

`ReadinessAgentService` 会检查 DEM 证据：
- 高海拔检查（>3000m 需要高海拔适应准备）
- 坡度检查
- 疲劳指数检查

---

## 相关脚本

### 1. `test-iceland-dem-world-model.ts`
- DEM 数据基础测试
- 测试多个坐标点的 DEM 查询
- 统计查询成功率和数据源使用情况

### 2. `test-world-model-with-dem.ts`
- 世界模型 DEM 集成测试
- 模拟路线 DEM 查询
- 生成路线海拔剖面（DEM 证据）

### 3. `format-world-model-output.py`
- 格式化世界模型 API 输出
- 提供可读性更好的控制台输出

---

## 故障排除

### 问题 1: 服务器连接失败

**错误**: `curl: (7) Failed to connect to localhost port 3000`

**解决方案**:
```bash
# 确保服务器正在运行
npm run start:dev

# 检查服务器状态
curl http://localhost:3000/health
```

### 问题 2: DEM 查询返回 null

**可能原因**:
- 坐标不在冰岛范围内
- DEM 表不存在
- 坐标转换失败

**解决方案**:
```bash
# 检查 DEM 表是否存在
psql $DATABASE_URL -c "SELECT COUNT(*) FROM geo_dem_iceland_20m;"

# 检查坐标是否在冰岛范围内
# 冰岛范围：纬度 63.3°N - 66.5°N，经度 -24.5°W - -13.5°W
```

### 问题 3: 世界模型 API 返回占位符 DEM 证据

**原因**: 这是正常的。在计划生成阶段，系统使用占位符 DEM 证据。实际 DEM 证据会在路线规划完成后生成。

**验证**: 检查 `missingPieces.physicalRealityIncomplete` 是否为 `true`（表示需要后续填充）。

---

## 下一步

1. **完善路线规划**: 添加更多路线点，生成更详细的行程
2. **集成实际路线规划**: 使用 `TripDecisionEngineService` 生成实际路线计划
3. **验证 DEM 证据**: 确认路线规划完成后 DEM 证据正确生成
4. **性能优化**: 监控 DEM 查询性能，优化批量查询

---

**最后更新**: 2026-02-10
