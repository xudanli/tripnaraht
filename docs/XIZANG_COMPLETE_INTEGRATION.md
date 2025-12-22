# 西藏 POI 和 Readiness 完整集成方案

## 概述

本文档总结西藏（Xizang/Tibet）POI 数据和 Readiness 规则的完整集成方案，从数据抓取到决策层使用的全流程。

## 快速开始

### 1. 数据库迁移（首次使用）

```bash
# 使用 npm script（推荐）
npm run migrate:altitude-hint

# 或直接使用 ts-node
ts-node --project tsconfig.backend.json scripts/migrate-add-altitude-hint.ts
```

### 2. 抓取 POI 数据

```bash
# 使用 npm script（推荐）
npm run fetch:poi:xizang -- --phase1
npm run fetch:poi:xizang -- --region=CN_XZ_LHASA

# 或直接使用 ts-node
ts-node --project tsconfig.backend.json scripts/fetch-osm-poi-xizang.ts --phase1
ts-node --project tsconfig.backend.json scripts/fetch-osm-poi-xizang.ts --region=CN_XZ_LHASA
```

### 3. 导入和规范化

```bash
# 导入原始数据
ts-node --project tsconfig.backend.json scripts/import-osm-poi-to-postgis.ts \
  --input data/geographic/poi/osm/xizang/raw/all_regions.json

# 规范化
ts-node --project tsconfig.backend.json scripts/normalize-osm-poi.ts
```

## 核心设计理念

### 与欧洲目的地的差异

| 维度 | 欧洲目的地 | 西藏 |
|------|-----------|------|
| **关键关注点** | 景点数量、开放时间、预订 | **高海拔安全 + 补给点 + 检查站/边防限制 + 路况封闭** |
| **OSM 覆盖** | 相对均匀 | 城市还行，偏远地区稀疏 |
| **POI 优先级** | 景点、餐厅、酒店 | **保障点、补给点、检查站、山口** |
| **决策依据** | 时间窗口、预算、偏好 | **海拔、补给密度、检查站、路况** |

## 完整功能链

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. POI 数据抓取                                                  │
│    scripts/fetch-osm-poi-xizang.ts                              │
│    - 8 个 region（Phase 1 MVP）                                  │
│    - 3 类查询：保障+补给、入口+旅游、氧气点                      │
│    - 串行抓取，避免 Overpass 限流                                │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. 数据存储                                                      │
│    scripts/import-osm-poi-to-postgis.ts                         │
│    - 存储到 poi_osm_raw 表                                       │
│    - 包含 region_key, altitude_hint（从 OSM ele 提取）          │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. 数据规范化                                                    │
│    scripts/normalize-osm-poi.ts                                 │
│    - 提取 altitude_hint（从 OSM ele 字段）                      │
│    - 分类：OXYGEN_STATION, CHECKPOINT, MOUNTAIN_PASS, CAR_REPAIR│
│    - 存储到 poi_canonical 表                                     │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. 地理特征提取                                                  │
│    GeoFactsPOIService.checkXizangFeatures()                     │
│    - 氧气点数量统计                                              │
│    - 检查站数量统计                                              │
│    - 山口/垭口数量统计                                           │
│    - 平均海拔计算                                                │
│    - 燃料密度计算（每 100km）                                    │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. Readiness 规则检查                                            │
│    xizang-pack.example.ts                                        │
│    - 高海拔适应（must）- 基于 geo.altitude_m >= 3000            │
│    - 补给稀疏（must）- 基于 geo.fuelDensity < 0.5               │
│    - 检查站提醒（should）- 基于 geo.checkpointCount > 0         │
│    - 山口风险（冬季 must）- 基于 geo.mountainPassCount > 0      │
│    - 氧气点识别（should）- 基于 geo.oxygenStationCount > 0      │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6. 约束转换                                                      │
│    ReadinessToConstraintsCompiler                               │
│    - Blockers/Must → Hard Constraints (error)                   │
│    - Should → Soft Constraints (warning)                         │
│    - Optional → Soft Constraints (info)                         │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 7. 决策层集成                                                    │
│    TripDecisionEngineService                                    │
│    - 在 generatePlan() 中调用 Readiness 检查                     │
│    - 将约束添加到 state.signals.alerts                          │
│    - ConstraintChecker 包含 readiness violations                │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 8. Agent 层集成                                                 │
│    AgentModule + OrchestratorService                            │
│    - readiness.check Action                                     │
│    - 在 plan() 阶段自动检查 readiness                            │
│    - 存储到 state.memory.readiness                              │
└─────────────────────────────────────────────────────────────────┘
```

## 数据流程

### 1. POI 抓取

```bash
# 使用 npm script（推荐）
npm run fetch:poi:xizang -- --phase1

# 或直接使用 ts-node
ts-node --project tsconfig.backend.json scripts/fetch-osm-poi-xizang.ts --phase1
```

**输出**：
- `data/geographic/poi/osm/xizang/raw/all_regions.json`
- 每个区域的单独文件：`CN_XZ_LHASA.json`, `CN_XZ_NYINGCHI.json`, ...

### 2. 数据导入

```bash
ts-node scripts/import-osm-poi-to-postgis.ts \
  --input data/geographic/poi/osm/xizang/raw/all_regions.json
```

**存储到**：`poi_osm_raw` 表

### 3. 数据规范化

```bash
ts-node scripts/normalize-osm-poi.ts
```

**处理**：
- 提取 `altitude_hint`（从 OSM `ele` 字段）
- 分类 POI（包括西藏特有类型）
- 存储到 `poi_canonical` 表

### 4. 数据库迁移（如果表已存在）

```bash
# 方法 1：使用迁移脚本
ts-node scripts/migrate-add-altitude-hint.ts

# 方法 2：直接执行 SQL
psql $DATABASE_URL -f prisma/migrations/add_poi_canonical_altitude_hint.sql
```

## 使用示例

### 示例 1：检查拉萨行程准备度

```typescript
import { ReadinessService } from './readiness/services/readiness.service';
import { xizangPack } from './readiness/data/xizang-pack.example';

// 构建上下文
const context: TripContext = {
  traveler: {
    nationality: 'CN',
    budgetLevel: 'medium',
    riskTolerance: 'medium',
  },
  trip: {
    startDate: '2025-07-01',
    endDate: '2025-07-10',
  },
  itinerary: {
    countries: ['CN'],
    activities: ['sightseeing', 'hiking'],
    season: 'summer',
  },
};

// 执行检查（带地理特征增强）
const result = await readinessService.checkFromPacks(
  [xizangPack],
  context,
  {
    enhanceWithGeo: true,
    geoLat: 29.6544,  // 拉萨
    geoLng: 91.1322,
  }
);

// 获取约束和任务
const constraints = await readinessService.getConstraints(result);
const tasks = await readinessService.getTasks(result);

console.log(`发现 ${result.summary.totalBlockers} 个阻塞项`);
console.log(`发现 ${result.summary.totalMust} 个必须项`);
console.log(`生成 ${tasks.length} 个任务`);
```

### 示例 2：在决策层中使用

```typescript
// 在 TripDecisionEngineService.generatePlan() 中
const readinessResult = await this.readinessService.checkFromDestination(
  'CN-XIZANG',
  context,
  {
    enhanceWithGeo: true,
    geoLat: startLocation?.lat,
    geoLng: startLocation?.lng,
  }
);

// 转换为约束
const readinessConstraints = await this.readinessService.getConstraints(readinessResult);

// 添加到 alerts
state.signals.alerts.push(...readinessConstraints.map(c => ({
  code: c.id,
  severity: c.severity === 'error' ? 'critical' : 'warn',
  message: c.message,
  details: {
    type: c.type,
    severity: c.severity,
    tasks: c.tasks,
    askUser: c.askUser,
  },
})));
```

### 示例 3：在 Agent 中使用

```typescript
// Agent 会自动调用 readiness.check Action
// 当有 trip_id 时，Orchestrator 会：
// 1. 先执行 trip.load_draft 加载 trip 信息
// 2. 然后执行 readiness.check 检查准备度
// 3. 将结果存储到 state.memory.readiness

// 结果可以在后续步骤中使用
const readinessData = state.memory.readiness;
if (readinessData?.summary.totalBlockers > 0) {
  // 处理阻塞项
}
```

## 关键文件清单

### 数据抓取
- `scripts/fetch-osm-poi-xizang.ts` - 西藏 POI 抓取脚本

### 数据导入和处理
- `scripts/import-osm-poi-to-postgis.ts` - 导入原始数据
- `scripts/normalize-osm-poi.ts` - 规范化处理（已更新支持 altitude_hint）

### 数据库迁移
- `prisma/migrations/add_poi_canonical_altitude_hint.sql` - SQL 迁移脚本
- `scripts/migrate-add-altitude-hint.ts` - TypeScript 迁移工具

### 地理特征服务
- `src/trips/readiness/services/geo-facts-poi.service.ts` - POI 特征服务（已扩展）

### Readiness 规则
- `src/trips/readiness/data/xizang-pack.example.ts` - 西藏 Readiness Pack

### 类型定义
- `src/trips/readiness/types/trip-context.types.ts` - TripContext 类型（已扩展）

### 集成
- `src/trips/readiness/services/readiness.service.ts` - Readiness 服务（已集成西藏特征）
- `src/trips/decision/trip-decision-engine.service.ts` - 决策引擎（已集成）
- `src/trips/decision/constraints/constraint-checker.ts` - 约束检查器（已集成）
- `src/agent/services/orchestrator.service.ts` - Agent 编排器（已集成）

### 文档
- `docs/XIZANG_POI_INTEGRATION.md` - POI 集成文档
- `docs/XIZANG_READINESS_USAGE.md` - Readiness 使用指南
- `docs/XIZANG_COMPLETE_INTEGRATION.md` - 本文档
- `data/geographic/poi/osm/xizang/README.md` - 快速开始指南

## 验证清单

### 数据层
- [ ] POI 数据已抓取（8 个 region）
- [ ] 数据已导入到 `poi_osm_raw` 表
- [ ] 数据已规范化到 `poi_canonical` 表
- [ ] `altitude_hint` 字段已添加（运行 `npm run migrate:altitude-hint`）

### 服务层
- [ ] `GeoFactsPOIService.checkXizangFeatures()` 正常工作
- [ ] 可以查询到氧气点、检查站、山口数据
- [ ] 海拔和燃料密度计算正确

### Readiness 层
- [ ] `xizangPack` 可以正常加载
- [ ] 规则可以正确触发（基于地理特征）
- [ ] 约束转换正确（Blockers/Must → error, Should → warning）

### 决策层
- [ ] `TripDecisionEngineService` 可以调用 Readiness 检查
- [ ] 约束正确添加到 `state.signals.alerts`
- [ ] `ConstraintChecker` 包含 readiness violations

### Agent 层
- [ ] `readiness.check` Action 已注册
- [ ] Orchestrator 可以自动调用 readiness 检查
- [ ] 结果正确存储到 `state.memory.readiness`

## 测试建议

### 1. 单元测试

```typescript
// 测试 GeoFactsPOIService.checkXizangFeatures()
describe('GeoFactsPOIService', () => {
  it('should return xizang features for Lhasa', async () => {
    const features = await service.getPOIFeaturesForPoint(29.6544, 91.1322, 50);
    expect(features.xizang).toBeDefined();
    expect(features.xizang.avgAltitudeM).toBeGreaterThan(3000);
  });
});
```

### 2. 集成测试

```typescript
// 测试 Readiness Pack 规则触发
describe('Xizang Readiness Pack', () => {
  it('should trigger altitude rule for high altitude', async () => {
    const context = {
      itinerary: { countries: ['CN'] },
      geo: { altitude_m: 3650 },
    };
    const result = await checker.check([xizangPack], context);
    expect(result.must.length).toBeGreaterThan(0);
  });
});
```

### 3. 端到端测试

```typescript
// 测试完整流程
describe('Xizang Readiness E2E', () => {
  it('should check readiness and convert to constraints', async () => {
    const result = await readinessService.checkFromDestination(
      'CN-XIZANG',
      context,
      { enhanceWithGeo: true, geoLat: 29.6544, geoLng: 91.1322 }
    );
    const constraints = await readinessService.getConstraints(result);
    expect(constraints.length).toBeGreaterThan(0);
  });
});
```

## 性能考虑

1. **POI 查询优化**：使用 GIST 索引加速地理查询
2. **缓存**：GeoFactsService 支持缓存，避免重复查询
3. **批量处理**：规范化脚本支持批量处理，提高效率
4. **串行抓取**：避免 Overpass API 限流

## 后续改进

1. **DEM 数据接入**：✅ 已完成，系统自动从 DEM 数据查询并补齐缺失的海拔信息
2. **坐标转换**：支持 WGS84 → GCJ-02 转换
3. **更多数据源**：接入文旅开放数据，补齐动态字段
4. **规则优化**：根据实际使用情况优化规则阈值
5. **更多区域**：扩展到 Phase 2（更多西藏区域）

## 相关文档

- [POI 集成文档](./XIZANG_POI_INTEGRATION.md)
- [Readiness 使用指南](./XIZANG_READINESS_USAGE.md)
- [Readiness 决策层集成](./READINESS_DECISION_INTEGRATION.md)
- [Agent 层集成](./AGENT_READINESS_INTEGRATION.md)

