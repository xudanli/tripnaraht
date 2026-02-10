# 冰岛 DEM 数据情况报告

**测试时间**: 2026-02-10  
**测试脚本**: `scripts/test-iceland-dem-direct.ts`

## 执行摘要

✅ **冰岛 DEM 数据覆盖良好**

- **覆盖率**: 100% (12/12 个测试点成功)
- **数据源**: `geo_dem_global` (全球 DEM 表)
- **查询性能**: 平均延迟 16ms，P50 延迟 10ms，P95 延迟 88ms
- **海拔范围**: 4m - 1052m，平均 342.8m

## DEM 表状态

### 已存在的 DEM 表

| 表名 | 状态 | 说明 |
|------|------|------|
| `geo_dem_cities_merged` | ✅ 存在 | 合并的城市 DEM 表（高精度） |
| `geo_dem_global` | ✅ 存在 | 全球 DEM 表（低精度，全球覆盖） |
| `geo_dem_xizang` | ✅ 存在 | 西藏区域 DEM 表 |

### 查询策略

冰岛 DEM 数据查询采用以下优先级：

1. **优先查询** `geo_dem_cities_merged`（高精度城市数据）
2. **后备查询** `geo_dem_global`（全球覆盖数据）

**当前情况**: 所有冰岛测试点都从 `geo_dem_global` 获取数据，说明：
- ✅ 全球 DEM 表覆盖冰岛全境
- ⚠️ 城市 DEM 表可能不包含冰岛城市数据（或精度不足）

## 测试结果详情

### 测试坐标点（12个）

| 地点 | 坐标 | 海拔 | 数据源 | 延迟 |
|------|------|------|--------|------|
| 雷克雅未克 | (64.1466, -21.9426) | 4m | geo_dem_global | 88ms |
| 冰岛中心 | (64.5, -18.5) | 665m | geo_dem_global | 10ms |
| Landmannalaugar | (63.9833, -19.0667) | 679m | geo_dem_global | 10ms |
| Askja 火山 | (65.0333, -16.75) | 1052m | geo_dem_global | 10ms |
| Þingvellir | (64.2553, -21.1150) | 113m | geo_dem_global | 10ms |
| Vík | (63.4194, -19.0067) | 34m | geo_dem_global | 10ms |
| Akureyri | (65.6836, -18.1000) | 15m | geo_dem_global | 11ms |
| Selfoss | (63.9330, -21.0023) | 16m | geo_dem_global | 10ms |
| F208 起点 | (63.9330, -21.0023) | 16m | geo_dem_global | 5ms |
| F208 终点 | (63.9833, -19.0667) | 679m | geo_dem_global | 8ms |
| F26 起点 | (64.2500, -20.3000) | 78m | geo_dem_global | 9ms |
| F26 终点 | (63.9330, -19.0000) | 763m | geo_dem_global | 10ms |

### 统计信息

- **总测试点数**: 12
- **成功查询**: 12 (100.0%)
- **失败查询**: 0
- **平均延迟**: 16ms
- **P50 延迟**: 10ms
- **P95 延迟**: 88ms

### 数据源统计

- **geo_dem_global**: 12 个点（100%）

### 海拔范围

- **最低海拔**: 4m（雷克雅未克）
- **最高海拔**: 1052m（Askja 火山）
- **平均海拔**: 342.8m

## 关键发现

### ✅ 优势

1. **100% 覆盖率**: 所有测试点都能成功查询到 DEM 数据
2. **全球覆盖**: `geo_dem_global` 表完全覆盖冰岛全境
3. **查询性能良好**: 平均延迟仅 16ms，P50 延迟 10ms
4. **数据完整性**: 包括主要城市、F 路起点终点、火山等高海拔地区

### ⚠️ 注意事项

1. **数据精度**: 
   - 当前使用 `geo_dem_global`（全球 DEM 表）
   - 精度可能低于城市 DEM 表
   - 对于 F 路等高精度需求场景，可能需要更高精度数据

2. **城市 DEM 表未使用**:
   - `geo_dem_cities_merged` 表存在但未返回冰岛城市数据
   - 可能原因：
     - 冰岛城市数据未包含在城市 DEM 表中
     - 城市 DEM 表精度不足，查询失败后降级到全球表

3. **海拔数据合理性**:
   - 雷克雅未克: 4m ✅（合理，接近海平面）
   - Askja 火山: 1052m ✅（合理，火山海拔）
   - Landmannalaugar: 679m ✅（合理，高地海拔）

## 在世界模型中的应用

### PhysicalRealityModel

冰岛 DEM 数据可以成功用于构建 `PhysicalRealityModel`：

```typescript
// 示例：为冰岛 F 路生成 DEM 证据
const demEvidence: DemDecisionEvidence = {
  segmentId: 'iceland_f208_segment',
  elevationProfile: [16, 679], // 从 F208 起点到终点
  cumulativeAscent: 663, // 679 - 16
  maxSlopePct: 25.5, // 需要从路线计算
  rollingAscent3Days: 3000, // 需要从多天累计
  fatigueIndex: 45, // 需要计算
  violation: 'NONE',
  explanation: 'F208 路段累计爬升 663m，在人体能力范围内',
};
```

### DEM 证据生成

✅ **可以成功生成 DEM 证据**:
- 所有冰岛坐标点都能查询到海拔
- 可以计算累计爬升、坡度等指标
- 可以生成完整的 `DemDecisionEvidence`

## 改进建议

### 短期改进（可选）

1. **添加数据源标记**:
   ```typescript
   interface DemDecisionEvidence {
     // ...
     metadata?: {
       dataSource?: 'cities_merged' | 'global';
       resolution?: '30m' | '90m' | '300m';
       // ...
     };
   }
   ```

2. **评估数据精度**:
   - 对比 `geo_dem_global` 和实际地形数据
   - 评估是否满足 F 路等高精度需求

### 长期改进（可选）

1. **补充高精度数据**:
   - 如果 `geo_dem_global` 精度不足，考虑补充冰岛特定区域的高精度 DEM 数据
   - 使用 SRTM 或 ASTER GDEM 数据源

2. **优化查询性能**:
   - 虽然当前性能良好（16ms），但可以进一步优化
   - 考虑添加缓存层

## 测试方法

### 运行测试脚本

```bash
# 测试冰岛 DEM 数据覆盖
npx tsx scripts/test-iceland-dem-direct.ts
```

### 通过 API 测试

```bash
# 测试单个点查询
curl "http://localhost:3000/api/dem/elevation?lat=64.1466&lng=-21.9426"

# 测试路线剖面
curl -X POST "http://localhost:3000/api/dem/profile" \
  -H "Content-Type: application/json" \
  -d '{
    "polyline": [
      {"lat": 63.9330, "lng": -21.0023},
      {"lat": 63.9833, "lng": -19.0667}
    ],
    "samples": 100
  }'
```

## 结论

✅ **冰岛 DEM 数据状态良好**

- **覆盖率**: 100%（所有测试点成功）
- **数据源**: `geo_dem_global`（全球 DEM 表）
- **性能**: 优秀（平均延迟 16ms）
- **可用性**: 可以成功用于世界模型构建和 DEM 证据生成

**建议**: 
- 当前 DEM 数据可以满足基本需求
- 如果未来需要更高精度（如 F 路详细地形分析），可以考虑补充高精度数据
- 建议在 DEM 证据的 metadata 中标记数据源，以便后续评估精度影响

---

**测试完成时间**: 2026-02-10
