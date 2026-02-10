# 性能问题分析报告

**分析时间**: 2026-02-10  
**日志来源**: 应用运行时日志

## 发现的问题

### 1. ⚠️ 空间查询性能较差 (SPATIAL_QUERY_LATENCY_HIGH)

**问题描述**:
- P95 延迟非常高：1172ms, 18894ms, 1604ms, 48118ms, 2112ms, 1271ms
- 告警阈值：500ms
- 最严重情况：48 秒延迟

**影响**:
- 用户体验差（API 响应慢）
- 系统资源占用高
- 可能导致超时错误

**可能原因**:
1. **缺少空间索引**：PostGIS 空间查询未使用索引
2. **复杂查询**：`ST_DWithin`, `ST_Intersects` 等操作未优化
3. **大数据量**：地理数据表数据量大，查询慢
4. **坐标系转换**：频繁的坐标系转换操作（如 ISN2016 ↔ WGS84）
5. **DEM 查询**：栅格数据查询性能问题

**优化建议**:

#### 1.1 添加空间索引

```sql
-- 检查现有索引
SELECT 
  tablename, 
  indexname, 
  indexdef 
FROM pg_indexes 
WHERE tablename LIKE 'geo_%' 
  AND indexdef LIKE '%gist%';

-- 为常用查询添加 GIST 索引
CREATE INDEX IF NOT EXISTS idx_place_location_gist ON "Place" USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_hazard_zones_geom_gist ON hazard_zones USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_geo_rivers_line_geom_gist ON geo_rivers_line USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_geo_coastlines_geom_gist ON geo_coastlines USING GIST (geom);
```

#### 1.2 优化 DEM 查询

```sql
-- 为 DEM 栅格表添加空间索引（如果使用 raster2pgsql -I 应该已创建）
-- 检查索引是否存在
SELECT 
  schemaname, 
  tablename, 
  indexname 
FROM pg_indexes 
WHERE tablename = 'geo_dem_iceland_20m';

-- 如果不存在，手动创建
CREATE INDEX IF NOT EXISTS idx_geo_dem_iceland_20m_rast_gist 
ON geo_dem_iceland_20m USING GIST (ST_ConvexHull(rast));
```

#### 1.3 优化查询语句

**问题查询示例**:
```sql
-- 慢查询：频繁的坐标系转换
SELECT ST_Value(
  rast, 
  ST_Transform(ST_SetSRID(ST_MakePoint(lng, lat), 4326), 5327)
) as elevation
FROM geo_dem_iceland_20m
WHERE ST_Intersects(
  rast, 
  ST_Transform(ST_SetSRID(ST_MakePoint(lng, lat), 4326), 5327)
);
```

**优化方案**:
```sql
-- 方案 1: 预先转换坐标（如果 DEM 使用 ISN2016）
-- 在应用层转换坐标，避免数据库内转换

-- 方案 2: 使用 WGS84 DEM（如果可能）
-- 将 DEM 转换为 WGS84 后导入，避免查询时转换

-- 方案 3: 使用函数索引
CREATE INDEX IF NOT EXISTS idx_place_location_4326 
ON "Place" USING GIST (ST_SetSRID(location::geometry, 4326));
```

#### 1.4 添加查询缓存

```typescript
// 在 DEMElevationService 中添加缓存
@Injectable()
export class DEMElevationService {
  private readonly cache = new Map<string, { elevation: number; timestamp: number }>();
  private readonly CACHE_TTL = 3600000; // 1 小时

  async getElevation(lat: number, lng: number): Promise<number | null> {
    const cacheKey = `${lat.toFixed(4)}_${lng.toFixed(4)}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.elevation;
    }
    
    const elevation = await this.queryElevation(lat, lng);
    if (elevation !== null) {
      this.cache.set(cacheKey, { elevation, timestamp: Date.now() });
    }
    
    return elevation;
  }
}
```

#### 1.5 批量查询优化

```typescript
// 使用批量查询替代多次单独查询
async getElevations(points: Array<{lat: number, lng: number}>): Promise<Array<number | null>> {
  // 一次性查询所有点，而不是循环查询
  const query = `
    SELECT 
      lat, 
      lng,
      ST_Value(rast, ST_SetSRID(ST_MakePoint(lng, lat), 4326)) as elevation
    FROM geo_dem_iceland_20m,
    (VALUES ${points.map((_, i) => `($${i*2+1}, $${i*2+2})`).join(', ')}) AS points(lat, lng)
    WHERE ST_Intersects(rast, ST_SetSRID(ST_MakePoint(lng, lat), 4326))
  `;
  
  // 执行批量查询
}
```

### 2. ⚠️ 地理特征数据覆盖率不足 (GEOGRAPHIC_FEATURES_COVERAGE_LOW)

**问题描述**:
- COASTLINES（海岸线）覆盖率显示：0.0%
- **实际情况**：数据库中已有海岸线数据（总计 390,655 条，冰岛范围内 898 条）
- **问题原因**：监控服务的告警规则中，冰岛(IS)未包含在监控国家列表中

**影响**:
- 误报告警（数据实际存在但显示为 0%）
- 可能误导后续优化决策

**解决方案**:

#### 2.1 修复监控服务告警规则

**问题**：告警规则中只监控 `['CH', 'NO', 'PE']`，未包含冰岛(IS)

**修复**：更新 `GeographicDataQualityMonitoringService.checkGeographicAlertRules` 方法

```typescript
// 修改前
if (
  config.dataType !== 'DEM' &&
  config.coverageRate < 0.9 &&
  ['CH', 'NO', 'PE'].includes(config.countryCode)
) { ... }

// 修改后
if (
  config.dataType !== 'DEM' &&
  config.coverageRate < 0.9 &&
  (['CH', 'NO', 'PE'].includes(config.countryCode) || 
   (config.dataType === 'COASTLINES' && ['IS', 'GL', 'FO', 'NZ'].includes(config.countryCode)))
) { ... }
```

#### 2.2 验证海岸线数据

```bash
# 验证冰岛海岸线数据
psql "$DATABASE_URL" -c "
SELECT 
  COUNT(*) as count,
  ST_Length(ST_Collect(geom)::geography) / 1000 as total_length_km
FROM geo_coastlines 
WHERE ST_Intersects(
  geom,
  ST_MakeEnvelope(-24.5, 63.3, -13.5, 66.6, 4326)
);
"

# 预期结果：count > 0, total_length_km > 0
```

### 3. ⚠️ LLM API 503 错误

**问题描述**:
- Anthropic API 返回 503 错误
- 服务暂时不可用
- 系统自动重试

**影响**:
- 自然语言处理功能受影响
- API 响应时间延长（120 秒）

**解决方案**:

#### 3.1 增加重试机制

```typescript
// 在 LlmService 中增加指数退避重试
async callAnthropicAPI(prompt: string, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await this.anthropicClient.messages.create({...});
    } catch (error) {
      if (error.status === 503 && i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 1000; // 指数退避
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}
```

#### 3.2 添加备用 LLM 服务

```typescript
// 使用多个 LLM 提供商作为备用
async callLLM(prompt: string) {
  const providers = [
    { name: 'anthropic', client: this.anthropicClient },
    { name: 'openai', client: this.openaiClient },
    { name: 'deepseek', client: this.deepseekClient },
  ];
  
  for (const provider of providers) {
    try {
      return await provider.client.call(prompt);
    } catch (error) {
      this.logger.warn(`${provider.name} failed, trying next...`);
      continue;
    }
  }
  
  throw new Error('All LLM providers failed');
}
```

## 立即行动项

### 优先级 P0（立即处理）

1. **添加空间索引**
   ```bash
   # 运行索引创建脚本
   psql "$DATABASE_URL" -f scripts/create-spatial-indexes.sql
   ```

2. **检查 DEM 表索引**
   ```bash
   psql "$DATABASE_URL" -c "
   SELECT tablename, indexname 
   FROM pg_indexes 
   WHERE tablename LIKE 'geo_dem%';
   "
   ```

### 优先级 P1（本周内）

1. **导入海岸线数据**
   - 下载冰岛海岸线数据
   - 导入到 `geo_coastlines` 表
   - 验证覆盖率

2. **优化 DEM 查询**
   - 添加查询缓存
   - 优化坐标系转换
   - 使用批量查询

### 优先级 P2（本月内）

1. **监控和告警优化**
   - 设置更细粒度的性能监控
   - 添加慢查询日志
   - 优化告警规则

2. **数据库优化**
   - 分析查询计划
   - 优化表结构
   - 考虑分区表（如果数据量大）

## 监控指标

### 当前指标

| 指标 | 当前值 | 目标值 | 状态 |
|------|--------|--------|------|
| 空间查询 P95 延迟 | 48118ms | < 500ms | ❌ |
| 海岸线覆盖率 | 0.0% | > 90% | ❌ |
| DEM 查询成功率 | 100% | > 95% | ✅ |

### 优化后目标

| 指标 | 目标值 | 预期改善 |
|------|--------|----------|
| 空间查询 P95 延迟 | < 500ms | 减少 95%+ |
| 海岸线覆盖率 | > 90% | 从 0% 提升到 90%+ |
| DEM 查询 P50 延迟 | < 50ms | 减少 50%+ |

## 相关文件

- `src/data-quality/services/geographic-data-quality-monitoring.service.ts` - 监控服务
- `src/trips/dem/services/dem-elevation.service.ts` - DEM 查询服务
- `scripts/create-spatial-indexes.sql` - 索引创建脚本（需要创建）
- `scripts/import-coastlines.sh` - 海岸线导入脚本（需要创建）
