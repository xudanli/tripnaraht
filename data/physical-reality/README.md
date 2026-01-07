# PhysicalReality 数据目录

## 📋 概述

本目录存储 PhysicalReality（物理现实）数据，用于三人格系统中的 Abu（安全官）决策。

PhysicalReality 数据包括：
- **DEM 决策证据**：地形、海拔、坡度等
- **道路状态**：F-road 开/关、季节性、4x4 要求等
- **危险区域**：雪崩、泥石流、火山等风险区域
- **渡轮状态**：渡轮运行状态和季节性
- **气候季节性**：不同月份的可达性和天气情况

## 📁 文件结构

```
data/physical-reality/
├── README.md                    # 本文件
├── iceland-template.json        # 冰岛数据模板（示例）
└── iceland.json                 # 冰岛实际数据（待填充）
```

## 🚀 使用方法

### 1. 生成模板

```bash
ts-node scripts/import-iceland-physical-reality.ts generate-template
```

这会生成一个模板文件 `data/physical-reality/iceland-template.json`，包含所有必需字段的示例数据。

### 2. 从路线坐标自动计算 DEM 证据（推荐）

如果你有路线坐标数据，可以使用 DEM 数据自动计算 DEM 证据：

**准备路线文件**（`data/routes/iceland-route.json`）：

```json
{
  "segmentId": "segment-001",
  "coordinates": [
    [-21.9426, 64.1466],
    [-21.9500, 64.1500],
    [-21.9600, 64.1550]
  ]
}
```

或者使用自定义格式：

```json
{
  "segmentId": "segment-001",
  "points": [
    { "lat": 64.1466, "lng": -21.9426 },
    { "lat": 64.1500, "lng": -21.9500 },
    { "lat": 64.1550, "lng": -21.9600 }
  ]
}
```

**计算 DEM 证据**：

```bash
ts-node scripts/import-iceland-physical-reality.ts calculate-dem data/routes/iceland-route.json
```

这会：
- **直接从数据库 DEM 数据批量查询**：使用 PostGIS 的批量查询功能，一次性查询多个点的海拔（比逐个查询快得多）
- 自动计算海拔剖面、累计爬升、坡度、疲劳指数
- 自动判断违规类型（HARD/SOFT/NONE）
- 生成完整的 `DemDecisionEvidence` 并保存到 `iceland-route-dem-evidence.json`

**批量查询优化**：
- 脚本会自动尝试从 `geo_dem_cities_merged` 和 `geo_dem_global` 表批量查询
- 每批查询100个点，提高效率
- 如果批量查询失败，会自动回退到逐个查询

**将计算结果合并到 PhysicalReality 数据**：

将生成的 DEM 证据添加到 `iceland.json` 的 `demEvidence` 数组中。

### 3. 编辑数据文件

根据实际数据修改模板文件：

- **DEM 证据**：使用 `calculate-dem` 命令自动计算，或手动从 DEM 数据提取
- **道路状态**：从冰岛道路管理局获取 F-road 状态
- **危险区域**：从气象局或地质调查数据获取
- **渡轮状态**：从渡轮公司获取运行时间表
- **气候季节性**：从气象数据或历史记录获取

### 4. 验证数据

```bash
ts-node scripts/import-iceland-physical-reality.ts validate data/physical-reality/iceland.json
```

验证数据格式和完整性，检查是否有错误或警告。

### 5. 导入数据

```bash
ts-node scripts/import-iceland-physical-reality.ts import data/physical-reality/iceland.json
```

将数据导入到数据库，存储到 `ReadinessPack` 的 `packData.physicalReality` 字段中。

## 📊 数据格式说明

### PhysicalRealityModel

```typescript
{
  countryCode: string;        // 国家代码（如 "IS"）
  month: number;              // 月份（1-12）
  demEvidence: DemDecisionEvidence[];  // DEM 证据数组
  roadStates: RoadState[];    // 道路状态数组
  hazardZones: HazardZoneState[];  // 危险区域数组
  ferryStates: FerryState[];  // 渡轮状态数组
  climateSeasonality?: ClimateSeasonality;  // 气候季节性（可选）
}
```

### DemDecisionEvidence（DEM 决策证据）

```typescript
{
  segmentId: string;          // 路段 ID
  elevationProfile: number[]; // 海拔剖面（米）
  cumulativeAscent: number;   // 累计爬升（米）
  maxSlopePct: number;       // 最大坡度（百分比）
  rollingAscent3Days: number; // 3天滚动窗口累计爬升（米）
  fatigueIndex: number;      // 疲劳指数（0-100）
  violation: 'HARD' | 'SOFT' | 'NONE';  // 违规类型
  explanation: string;        // 解释
  metadata?: {               // 元数据（可选）
    distanceM?: number;
    avgSlopePct?: number;
    elevationRange?: { min: number; max: number };
    // ...
  };
}
```

### RoadState（道路状态）

```typescript
{
  roadId: string;            // 道路 ID（如 "F208"）
  status: 'OPEN' | 'CLOSED' | 'SEASONAL' | 'RESTRICTED';
  seasonOpenFrom?: number;   // 开放起始月份（1-12）
  seasonOpenTo?: number;     // 开放结束月份（1-12）
  requires4x4?: boolean;   // 是否需要 4x4
  requiresPermit?: boolean;  // 是否需要许可
  segmentId?: string;        // 关联的路段 ID
  metadata?: Record<string, any>;
}
```

### HazardZoneState（危险区域状态）

```typescript
{
  zoneId: string;            // 区域 ID
  type: 'AVALANCHE' | 'MUDSLIDE' | 'FLOOD' | 'ICE' | 'VOLCANIC' | 'OTHER';
  level: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  seasonality?: {             // 季节性（可选）
    highRiskMonths: number[]; // 高风险月份
    lowRiskMonths: number[];
  };
  segmentId?: string;
  geom?: any;                 // PostGIS geometry（可选）
  metadata?: Record<string, any>;
}
```

### FerryState（渡轮状态）

```typescript
{
  ferryId: string;            // 渡轮 ID
  routeId: string;             // 路线 ID
  status: 'RUNNING' | 'CANCELLED' | 'SEASONAL';
  seasonOpenFrom?: number;    // 运行起始月份（1-12）
  seasonOpenTo?: number;      // 运行结束月份（1-12）
  lastStatusUpdate?: Date;    // 最后更新时间
  metadata?: Record<string, any>;
}
```

### ClimateSeasonality（气候季节性）

```typescript
{
  countryCode: string;        // 国家代码
  month: number;              // 月份（1-12）
  accessibilityScore: number; // 可达性评分（0-1）
  typicalWeather?: {          // 典型天气（可选）
    windSpeedMps: number;     // 风速（米/秒）
    precipitationMmPerHour: number;  // 降水量（毫米/小时）
    visibilityMeters: number; // 能见度（米）
    temperatureCelsius: number; // 温度（摄氏度）
  };
  riskFactors?: string[];    // 风险因素（如 ["wind", "snow"]）
  metadata?: Record<string, any>;
}
```

## 🔍 数据来源

### 冰岛数据来源

1. **DEM 数据**：
   - **自动计算（推荐）**：使用 `calculate-dem` 命令，从路线坐标自动计算
   - **手动提取**：从 DEM 服务或路线分析工具获取
   - 脚本会自动计算海拔剖面、坡度、累计爬升、疲劳指数等

2. **道路状态**：
   - [冰岛道路管理局](https://www.road.is/) - F-road 状态
   - 季节性开放时间、4x4 要求等

3. **危险区域**：
   - [冰岛气象局](https://en.vedur.is/) - 天气和雪崩预警
   - 地质调查数据 - 火山活动区域

4. **渡轮状态**：
   - 各渡轮公司官网 - 运行时间表
   - 如 Vestmannaeyjar 渡轮等

5. **气候季节性**：
   - 历史气象数据
   - 旅游季节信息

## 📝 数据维护

### 更新频率

- **道路状态**：每月更新（特别是季节性道路）
- **危险区域**：根据预警实时更新
- **渡轮状态**：根据时间表更新
- **气候季节性**：每年更新一次

### 版本控制

建议在数据文件中添加版本信息：

```json
{
  "version": "1.0.0",
  "lastUpdated": "2025-01-15T00:00:00Z",
  "dataSource": "Icelandic Road Administration, etc.",
  "countryCode": "IS",
  "month": 7,
  // ... 其他数据
}
```

## ⚠️ 注意事项

1. **数据准确性**：PhysicalReality 数据直接影响安全决策，必须确保准确性
2. **时效性**：道路状态、危险区域等数据需要定期更新
3. **完整性**：DEM 证据是必需的，缺少会导致计划无法生成
4. **多月份支持**：可以为不同月份创建不同的数据文件
5. **DEM 自动计算**：
   - **直接从数据库读取**：脚本使用 PostGIS 批量查询功能，直接从数据库的 DEM 表（`geo_dem_cities_merged`、`geo_dem_global` 等）读取海拔数据
   - 批量查询效率：使用 `UNNEST` 和 `ST_Value` 一次性查询多个点，比逐个查询快 10-100 倍
   - 确保数据库中有对应的 DEM 数据表（`geo_dem_global` 或区域表）
   - 路线坐标应足够密集（建议每100-500米一个点）以获得准确的海拔剖面
   - 如果某些点无法获取海拔，脚本会使用前一点的海拔或0作为后备
   - 计算时间：批量查询大幅减少数据库往返次数，对于1000个点的路线，从几分钟缩短到几秒

## 🔗 相关文档

- [PhysicalReality Model 定义](../../src/trips/decision/models/physical-reality.model.ts)
- [DEM Decision Evidence 接口](../../src/trips/decision/interfaces/dem-decision-evidence.interface.ts)
- [Abu Strategy 说明](../../src/trips/decision/strategies/abu-strategy.service.ts)

