# 冰岛实时数据 API 集成调研方案

> **更新时间**: 2026-02-13
> **优先级**: P0（阻塞行程生成质量）
> **评估人**: TripNARA 技术团队

---

## 🎯 集成目标

解决世界模型的 **实时性问题**，确保以下数据的时效性：
1. F-road 实时开放状态（road.is API）
2. 高地天气预报和告警（Veðurstofa Íslands API）
3. 雪崩风险评级（Avalanche.is API）
4. 搜救告警和禁入区域（ICE-SAR）
5. 火山活动监测（IMO 冰岛气象局）

---

## 1️⃣ road.is API - F-road 实时状态

### API 概述

**官方网站**: https://www.road.is
**API 文档**: https://api.road.is/
**用途**: 获取冰岛道路实时状态（开放/关闭/限制）

### API 端点

```bash
# 获取所有道路状态
GET https://api.road.is/api/condition

# 获取特定道路状态
GET https://api.road.is/api/condition?road={roadNumber}

# 示例：查询 F208 状态
GET https://api.road.is/api/condition?road=F208
```

### 响应示例

```json
{
  "results": [
    {
      "road_number": "F208",
      "road_name": "Fjallabak",
      "status": "closed",
      "status_text": "Lokað vegna vetrar",
      "status_text_en": "Closed for winter",
      "last_updated": "2026-02-13T10:30:00Z",
      "warnings": [
        {
          "type": "winter_closure",
          "severity": "high",
          "message": "Road closed until June 2026"
        }
      ],
      "conditions": {
        "surface": "snow_ice",
        "visibility": "poor",
        "wind_speed_ms": 15
      }
    }
  ]
}
```

### 数据映射

| road.is 字段 | TripNARA 字段 | 说明 |
|-------------|--------------|------|
| `road_number` | `roadId` | 路线编号 (F208) |
| `status` | `currentStatus` | open/closed/limited |
| `status_text_en` | `statusMessage` | 状态描述 |
| `last_updated` | `lastVerifiedAt` | 最后更新时间 |
| `warnings` | `hazards` | 危险告警列表 |

### 集成方案

#### 方案 A: 实时 API 调用（推荐）

```typescript
// src/skills/world/services/road-status-realtime.service.ts

interface RoadIsAPIResponse {
  results: Array<{
    road_number: string;
    status: 'open' | 'closed' | 'limited';
    status_text_en: string;
    last_updated: string;
    warnings: Array<{
      type: string;
      severity: string;
      message: string;
    }>;
  }>;
}

@Injectable()
export class RoadStatusRealtimeService {
  private readonly ROAD_IS_API = 'https://api.road.is/api/condition';
  private readonly CACHE_TTL = 15 * 60 * 1000; // 15 分钟缓存

  async getRoadStatus(roadId: string): Promise<RoadStatus> {
    // 1. 检查缓存
    const cached = await this.getCached(roadId);
    if (cached) return cached;

    // 2. 调用 API
    const response = await fetch(`${this.ROAD_IS_API}?road=${roadId}`);
    const data: RoadIsAPIResponse = await response.json();

    // 3. 数据转换
    const status = this.mapToTripNARAFormat(data.results[0]);

    // 4. 写入缓存
    await this.setCached(roadId, status);

    return status;
  }

  private mapToTripNARAFormat(apiData: any): RoadStatus {
    return {
      roadId: apiData.road_number,
      currentStatus: apiData.status,
      statusMessage: apiData.status_text_en,
      lastVerifiedAt: new Date(apiData.last_updated),
      hazards: apiData.warnings.map(w => ({
        type: w.type,
        severity: w.severity,
        description: w.message,
      })),
    };
  }
}
```

**优点**:
- 数据最新（15 分钟缓存）
- 无需存储历史数据
- 实现简单

**缺点**:
- 依赖外部 API 可用性
- 需要处理 API 限流

#### 方案 B: 每日批量爬取

```typescript
// scripts/cron/sync-road-status-daily.ts

async function syncRoadStatusDaily() {
  const fRoads = [
    'F208', 'F26', 'F225', 'F35', 'F910', // ... 所有 F-road
  ];

  for (const roadId of fRoads) {
    const status = await fetchFromRoadIsAPI(roadId);
    await prisma.roadStatus.upsert({
      where: { roadId },
      update: {
        currentStatus: status.status,
        lastVerifiedAt: new Date(),
        apiData: status,
      },
      create: { ... },
    });
  }
}

// 设置 cron job：每天早上 6:00 UTC 运行
```

**优点**:
- 不依赖实时 API 可用性
- 可存储历史数据用于分析
- 减少 API 调用次数

**缺点**:
- 数据时效性差（最多延迟 24 小时）
- 需要数据库存储

### 推荐方案

**混合方案**: 实时 API + 每日批量备份
- 平时使用实时 API（15 分钟缓存）
- 每日批量爬取作为备份（API 不可用时降级）
- 存储历史数据用于预测模型

### 成本估算

- **API 免费**：road.is API 公开免费
- **流量估算**：假设每天 1000 次行程生成请求
  - 缓存命中率 80% → 200 次 API 调用/天
  - 完全在免费额度内

### 实施计划

- **Week 1**: 实现 RoadStatusRealtimeService + 缓存
- **Week 2**: 实现每日批量爬取脚本
- **Week 3**: 集成到 Should-Exist Gate 决策逻辑
- **Week 4**: 测试和监控

---

## 2️⃣ Veðurstofa Íslands API - 冰岛气象局

### API 概述

**官方网站**: https://www.vedur.is
**API 文档**: https://www.vedur.is/vedur/vedur/english/api/
**用途**: 高地天气预报、告警、风速、能见度

### API 端点

```bash
# 获取天气预报
GET https://xmlweather.vedur.is/?op_w=xml&type=forec&lang=en&view=xml&ids={stationId}

# 获取天气告警
GET https://xmlweather.vedur.is/?op_w=xml&type=obs&lang=en&view=xml&ids={stationId}

# 获取风速和能见度
GET https://xmlweather.vedur.is/?op_w=xml&type=obs&lang=en&view=xml&params=F;D;W
```

### 冰岛高地关键气象站

| 气象站名称 | Station ID | 区域 | 坐标 |
|-----------|-----------|------|------|
| **Landmannalaugar** | 5701 | F208 | 63.9833, -19.0667 |
| **Hveravellir** | 5506 | F35 | 64.8667, -19.5500 |
| **Mývatn** | 2584 | F88/F910 | 65.6378, -16.9086 |
| **Grímsfjall** | 5201 | 高地中心 | 64.4167, -17.3333 |

### 响应示例（简化）

```xml
<forecasts>
  <station id="5701" name="Landmannalaugar">
    <forecast>
      <ftime>2026-02-13T12:00:00Z</ftime>
      <T>-5.0</T> <!-- 温度 °C -->
      <W>15.0</W> <!-- 风速 m/s -->
      <D>SW</D>   <!-- 风向 -->
      <Visibility>5000</Visibility> <!-- 能见度 m -->
      <Precipitation>0.5</Precipitation> <!-- 降水 mm -->
      <Weather>Snow</Weather>
    </forecast>
    <alerts>
      <alert>
        <type>high_wind</type>
        <severity>warning</severity>
        <message>Wind speeds up to 20 m/s expected</message>
      </alert>
    </alerts>
  </station>
</forecasts>
```

### 集成方案

```typescript
// src/skills/world/services/iceland-weather-realtime.service.ts

@Injectable()
export class IcelandWeatherRealtimeService {
  private readonly VEDUR_API = 'https://xmlweather.vedur.is/';

  async getHighlandWeather(location: { lat: number; lng: number }): Promise<WeatherData> {
    // 1. 找到最近的气象站
    const stationId = this.findNearestStation(location);

    // 2. 调用 API
    const response = await fetch(
      `${this.VEDUR_API}?op_w=xml&type=forec&lang=en&view=xml&ids=${stationId}`
    );
    const xml = await response.text();

    // 3. 解析 XML
    const data = await this.parseWeatherXML(xml);

    // 4. 返回结构化数据
    return {
      temperature: data.T,
      windSpeed: data.W,
      visibility: data.Visibility,
      alerts: data.alerts,
      lastUpdated: new Date(data.ftime),
    };
  }

  private findNearestStation(location: { lat: number; lng: number }): string {
    // 使用 PostGIS 查找最近气象站
    const stations = [
      { id: '5701', lat: 63.9833, lng: -19.0667 }, // Landmannalaugar
      { id: '5506', lat: 64.8667, lng: -19.5500 }, // Hveravellir
      // ...
    ];

    // 计算距离，返回最近的
    const nearest = stations.reduce((prev, curr) => {
      const prevDist = this.distance(location, prev);
      const currDist = this.distance(location, curr);
      return currDist < prevDist ? curr : prev;
    });

    return nearest.id;
  }
}
```

### 推荐方案

- 实时 API 调用（30 分钟缓存）
- 存储历史天气数据用于失败风险预测
- 天气告警实时推送到用户

### 成本估算

- **API 免费**：Veðurstofa Íslands API 公开免费
- **流量估算**：每天 500 次请求
  - 完全在免费额度内

---

## 3️⃣ Avalanche.is API - 雪崩风险评级

### API 概述

**官方网站**: https://en.vedur.is/avalanches/
**API 文档**: https://en.vedur.is/avalanches/articles/nr/2904
**用途**: 雪崩风险评级（冬季/春季重要）

### API 端点

```bash
# 获取雪崩预报
GET https://apis.is/avalanche

# 响应示例
{
  "results": [
    {
      "region": "Austurland",
      "valid_from": "2026-02-13T00:00:00Z",
      "valid_to": "2026-02-14T00:00:00Z",
      "danger_level": 3,
      "danger_level_name": "Considerable",
      "description": "Wind slabs in sheltered areas"
    }
  ]
}
```

### 雪崩危险等级

| 等级 | 名称 | 说明 | 建议 |
|------|------|------|------|
| 1 | Low | 低风险 | 可正常活动 |
| 2 | Moderate | 中等风险 | 需谨慎 |
| 3 | Considerable | 显著风险 | 避免陡坡 |
| 4 | High | 高风险 | ❌ 不建议出行 |
| 5 | Very High | 极高风险 | ❌ 禁止出行 |

### 集成方案

```typescript
@Injectable()
export class AvalancheRiskService {
  async getAvalancheRisk(region: string): Promise<AvalancheRisk> {
    const response = await fetch('https://apis.is/avalanche');
    const data = await response.json();

    const regionData = data.results.find(r => r.region === region);

    return {
      region,
      dangerLevel: regionData.danger_level,
      dangerLevelName: regionData.danger_level_name,
      validFrom: new Date(regionData.valid_from),
      validTo: new Date(regionData.valid_to),
      shouldBlock: regionData.danger_level >= 4, // 等级 4+ 阻塞行程
    };
  }
}
```

### 推荐方案

- 实时 API 调用（6 小时缓存）
- 危险等级 >= 4 时，Should-Exist Gate 返回 BLOCK
- 仅在冬季/春季（11月-5月）检查

---

## 4️⃣ ICE-SAR API - 搜救队告警

### API 概述

**官方网站**: https://www.safetravel.is
**可能的 API**: https://api.safetravel.is/
**用途**: 禁入区域、搜救告警

### 数据获取方式

⚠️ **注意**: ICE-SAR 可能没有公开 API，需要：
1. 联系 Safetravel.is 询问 API 接入
2. 每日爬取网站数据
3. 或使用 RSS feed（如果有）

### 替代方案：网页爬取

```typescript
@Injectable()
export class SafetravelScraperService {
  async getClosedAreas(): Promise<ClosedArea[]> {
    // 爬取 https://www.safetravel.is/areas
    const html = await fetch('https://www.safetravel.is/areas').then(r => r.text());

    // 解析 HTML，提取禁入区域
    const closedAreas = this.parseHTML(html);

    return closedAreas.map(area => ({
      name: area.name,
      reason: area.reason,
      validUntil: area.validUntil,
      coordinates: area.coordinates,
    }));
  }
}
```

### 推荐方案

- 每日爬取 Safetravel.is（早上 6:00 UTC）
- 存储禁入区域到 `geo_hazard_zones` 表
- Should-Exist Gate 检查行程是否经过禁入区域

---

## 5️⃣ IMO API - 火山活动监测

### API 概述

**官方网站**: https://en.vedur.is/earthquakes-and-volcanism/
**API 文档**: https://en.vedur.is/earthquakes-and-volcanism/articles/nr/2904
**用途**: 火山活动、地震监测

### API 端点

```bash
# 获取最近地震
GET https://apis.is/earthquake/is

# 响应示例
{
  "results": [
    {
      "timestamp": "2026-02-13T10:15:00Z",
      "latitude": 63.9833,
      "longitude": -19.0667,
      "magnitude": 2.5,
      "depth": 5.0,
      "quality": 90
    }
  ]
}
```

### 集成方案

```typescript
@Injectable()
export class VolcanicActivityService {
  async checkVolcanicActivity(location: { lat: number; lng: number }): Promise<VolcanicRisk> {
    const earthquakes = await this.getRecentEarthquakes();

    // 检查 50km 范围内是否有地震活动
    const nearbyQuakes = earthquakes.filter(eq => {
      const distance = this.distance(location, eq);
      return distance < 50 && eq.magnitude > 2.0;
    });

    return {
      hasActivity: nearbyQuakes.length > 0,
      severity: this.calculateSeverity(nearbyQuakes),
      shouldWarn: nearbyQuakes.some(eq => eq.magnitude > 3.0),
    };
  }
}
```

---

## 📋 集成优先级和时间表

### P0 - 必须尽快集成（2 周内）

1. **road.is API** - F-road 实时状态
   - 时间: Week 1-2
   - 负责人: 后端工程师
   - 依赖: 无

2. **Veðurstofa Íslands API** - 高地天气
   - 时间: Week 2-3
   - 负责人: 后端工程师
   - 依赖: 无

### P1 - 重要集成（4 周内）

3. **Avalanche.is API** - 雪崩风险
   - 时间: Week 3-4
   - 负责人: 后端工程师
   - 依赖: 无

4. **Safetravel.is 爬虫** - 禁入区域
   - 时间: Week 4
   - 负责人: 后端工程师
   - 依赖: 无

### P2 - 优化集成（持续）

5. **IMO 地震/火山 API**
   - 时间: Week 5+
   - 负责人: 后端工程师

---

## 🔒 数据隐私和合规

- ✅ 所有 API 均为公开数据，无隐私问题
- ✅ 无需用户授权
- ✅ 符合 GDPR 要求（无个人数据）
- ⚠️ 需在文档中标注数据来源

---

## 📊 监控和告警

### 需要监控的指标

1. **API 可用性**: 99% uptime
2. **API 响应时间**: < 2 秒
3. **缓存命中率**: > 80%
4. **数据新鲜度**: < 30 分钟

### 告警规则

- API 连续失败 3 次 → 发送告警
- 数据超过 1 小时未更新 → 发送告警
- 降级到静态数据 → 记录日志

---

**生成时间**: 2026-02-13
**更新周期**: 每月
**负责人**: TripNARA 后端团队
