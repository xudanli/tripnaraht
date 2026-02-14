# 冰岛世界模型 - API 使用示例

> **版本**: v1.0 (Phase 1-5)
> **更新时间**: 2026-02-14
> **适用场景**: 集成开发和测试

---

## 📚 目录

1. [GatekeeperAgent - Should-Exist Gate 评估](#gatekeeperagent---should-exist-gate-评估)
2. [天气服务 - 实时天气查询](#天气服务---实时天气查询)
3. [天气告警 Skill - 风险评估](#天气告警-skill---风险评估)
4. [F-Road 检查 Skill - 道路可达性](#f-road-检查-skill---道路可达性)
5. [POI 查询 - 地点搜索](#poi-查询---地点搜索)
6. [DEM 查询 - 爬升计算](#dem-查询---爬升计算)

---

## 1. GatekeeperAgent - Should-Exist Gate 评估

### 基本用法

```typescript
import { ClaudeGatekeeperAgentService } from './agent/services/sub-agents/gatekeeper-agent.service';
import { TripPlanRequest, OrchestratorState, GateResult } from './agent/interfaces/trip-plan.interface';

// 初始化 GatekeeperAgent
const gatekeeperAgent = new ClaudeGatekeeperAgentService(
  gateRunThreeGuardians,  // 可选
  gatePrecheck,           // 可选
  fRoadCheck,             // F-Road 检查 Skill
  weatherAlert,           // 天气告警 Skill
);

// 构建行程请求
const request: TripPlanRequest = {
  request_id: 'trip-iceland-001',
  origin: { lat: 64.1466, lng: -21.9426 }, // Reykjavík
  destination: { lat: 64.75, lng: -18.0 },  // Highlands (F208)
  date_range: {
    start: new Date('2026-07-15'),
    end: new Date('2026-07-18'),
  },
  mode: 'drive',
  party: {
    adults: 2,
    children: 0,
    fitness_level: 'moderate',
  },
  constraints: {
    max_daily_hours: 8,
    budget: { total: 5000, currency: 'USD' },
  },
};

// 执行 Gate 评估
const researchData = {};
const context: OrchestratorState = {
  current_step: 'GATE_EVAL',
  request_id: request.request_id,
};

const gateResult: GateResult = await gatekeeperAgent.evaluateGate(
  request,
  researchData,
  context
);

// 处理 Gate 结果
console.log('Gate 结果:', gateResult.gate_result);
console.log('置信度:', gateResult.confidence);

if (gateResult.gate_result === 'BLOCK') {
  console.log('❌ 行程被阻塞:');
  gateResult.violations.forEach(v => {
    console.log(`  - [${v.severity}] ${v.type}: ${v.detail}`);
  });

  console.log('\n📋 调整建议:');
  gateResult.required_adjustments.forEach(adj => {
    console.log(`  - ${adj.action}: ${adj.why}`);
  });
} else if (gateResult.gate_result === 'ADJUST_REQUIRED') {
  console.log('⚠️  行程需要调整:');
  gateResult.required_adjustments.forEach(adj => {
    console.log(`  - ${adj.action}: ${adj.why}`);
  });
} else if (gateResult.gate_result === 'NEED_USER_CONFIRM') {
  console.log('❓ 需要用户确认风险');
} else {
  console.log('✅ 行程通过 Gate 检查');
}

// 查看证据链
console.log('\n📊 证据链:');
gateResult.evidence_refs?.forEach(ref => {
  console.log(`  - ${ref.evidence_id}: ${ref.source} (confidence: ${ref.confidence})`);
});
```

### 输出示例

```json
{
  "gate_result": "BLOCK",
  "violations": [
    {
      "type": "REACHABILITY",
      "severity": "HARD",
      "detail": "F208 is closed: Typically closed in winter (October-May). Status unverified."
    }
  ],
  "required_adjustments": [
    {
      "action": "REPLACE_SEGMENT",
      "why": "Alternative to F208: F225 (longer but safer)"
    },
    {
      "action": "REPLACE_SEGMENT",
      "why": "Alternative to F208: Ring Road via south coast"
    }
  ],
  "confidence": 0.9,
  "evidence_refs": [
    {
      "evidence_id": "F208",
      "source": "road-status-realtime-service",
      "last_verified_at": "2026-02-14T18:00:00.000Z",
      "confidence": 0.7
    }
  ]
}
```

---

## 2. 天气服务 - 实时天气查询

### 查询单个位置天气

```typescript
import { IcelandWeatherRealtimeService } from './skills/world/services/iceland-weather-realtime.service';

const weatherService = new IcelandWeatherRealtimeService(prisma, logger);

// 查询 Reykjavík 天气
const weather = await weatherService.getWeatherByLocation(64.1466, -21.9426);

console.log('区域:', weather.regionName);
console.log('温度:', weather.temperature, '°C');
console.log('风速:', weather.windSpeed, 'm/s');
console.log('风向:', weather.windDirection, '°');
console.log('能见度:', weather.visibility, 'm');
console.log('天气状况:', weather.conditions);
console.log('告警数:', weather.warnings.length);
console.log('风险数:', weather.risks.length);
```

### 输出示例

```json
{
  "regionKey": "reykjavik",
  "regionName": "Reykjavík",
  "location": { "lat": 64.1466, "lng": -21.9426 },
  "forecastTime": "2026-02-14T18:00:00.000Z",
  "validFrom": "2026-02-14T18:00:00.000Z",
  "validUntil": "2026-02-14T19:00:00.000Z",
  "temperature": -5.9,
  "windSpeed": 2.8,
  "windDirection": 104,
  "precipitation": 0,
  "visibility": 38280,
  "conditions": "Overcast",
  "weatherCode": "3",
  "warnings": [],
  "risks": [],
  "dataSource": "open-meteo",
  "confidence": 0.85
}
```

### 查询所有区域天气

```typescript
const allWeather = await weatherService.getAllRegionsWeather();

allWeather.forEach((weather, regionKey) => {
  console.log(`${regionKey}:`, weather.temperature, '°C, 风速:', weather.windSpeed, 'm/s');
});
```

### 检查恶劣天气

```typescript
const isHazardous = await weatherService.hasHazardousWeather(64.75, -18.0);
console.log('恶劣天气:', isHazardous ? '是' : '否');
```

---

## 3. 天气告警 Skill - 风险评估

### 基本用法

```typescript
import { WeatherAlertSkill } from './skills/world/weather-alert.skill';

const weatherAlertSkill = new WeatherAlertSkill(weatherService, logger);

// 构建输入
const input = {
  locations: [
    { lat: 64.1466, lng: -21.9426, name: 'Reykjavík', type: 'start' },
    { lat: 64.75, lng: -18.0, name: 'Highlands', type: 'end' },
  ],
  dateRange: {
    start: new Date('2026-07-15'),
    end: new Date('2026-07-18'),
  },
  riskTolerance: 'medium',  // low | medium | high
};

// 执行风险评估
const result = await weatherAlertSkill.execute(input);

console.log('总体风险:', result.overallRisk);
console.log('Gate 建议:', result.gateRecommendation);
console.log('摘要:', result.summary);

// 查看各位置天气
result.locationWeather.forEach(lw => {
  console.log(`\n📍 ${lw.location.name}:`);
  console.log('  温度:', lw.temperature, '°C');
  console.log('  风速:', lw.windSpeed, 'm/s');
  console.log('  风险等级:', lw.risk);

  if (lw.warnings.length > 0) {
    console.log('  告警:');
    lw.warnings.forEach(w => console.log(`    - ${w}`));
  }

  if (lw.blockers.length > 0) {
    console.log('  阻塞条件:');
    lw.blockers.forEach(b => console.log(`    - ${b}`));
  }
});

// 查看调整建议
if (result.adjustments.length > 0) {
  console.log('\n📋 调整建议:');
  result.adjustments.forEach(adj => console.log(`  - ${adj}`));
}
```

### 输出示例 (高风险场景)

```json
{
  "overallRisk": "high",
  "gateRecommendation": "ADJUST_REQUIRED",
  "summary": "High risk conditions detected at 1 locations. Extreme wind conditions (10.6 m/s) at Highlands. Consider postponing or altering route.",
  "locationWeather": [
    {
      "location": { "lat": 64.1466, "lng": -21.9426, "name": "Reykjavík", "type": "start" },
      "temperature": -5.9,
      "windSpeed": 2.8,
      "visibility": 38280,
      "conditions": "Overcast",
      "risk": "safe",
      "warnings": [],
      "blockers": []
    },
    {
      "location": { "lat": 64.75, "lng": -18.0, "name": "Highlands", "type": "end" },
      "temperature": -12.6,
      "windSpeed": 10.6,
      "visibility": 3500,
      "conditions": "Partly cloudy",
      "risk": "high",
      "warnings": [
        "Moderate wind conditions (10.6 m/s)",
        "Low visibility (<5km): 3.5km"
      ],
      "blockers": []
    }
  ],
  "adjustments": [
    "Consider postponing travel until weather improves",
    "Seek shelter if conditions worsen",
    "Monitor weather updates closely"
  ],
  "evidenceRefs": [
    {
      "location": "Reykjavík",
      "source": "iceland-weather-realtime-service",
      "timestamp": "2026-02-14T18:00:00.000Z",
      "confidence": 0.85
    },
    {
      "location": "Highlands Center",
      "source": "iceland-weather-realtime-service",
      "timestamp": "2026-02-14T18:00:00.000Z",
      "confidence": 0.85
    }
  ]
}
```

---

## 4. F-Road 检查 Skill - 道路可达性

### 基本用法

```typescript
import { FRoadCheckSkill } from './skills/world/f-road-check.skill';

const fRoadCheckSkill = new FRoadCheckSkill(roadStatusService, logger);

// 构建输入
const input = {
  request_id: 'trip-001',
  origin: 'Vík, Iceland',
  destination: 'Landmannalaugar, F208, Iceland',
  waypoints: ['F225 junction'],
  planned_route_description: 'Drive from Vík to Landmannalaugar via F208',
  date_range: {
    start_date: '2026-07-15',
    end_date: '2026-07-18',
  },
};

// 执行 F-Road 检查
const result = await fRoadCheckSkill.execute(input);

console.log('是否可通行:', result.can_proceed);
console.log('检测到的 F-roads:', result.roads_found.join(', '));

if (!result.can_proceed) {
  console.log('\n❌ 道路阻塞:');
  result.blocked_roads.forEach(r => {
    console.log(`  - ${r.road}: ${r.reason} (${r.status})`);
  });
}

if (result.restricted_roads.length > 0) {
  console.log('\n⚠️  道路限制:');
  result.restricted_roads.forEach(r => {
    console.log(`  - ${r.road}: ${r.reason}`);
  });
}

if (result.alternatives.length > 0) {
  console.log('\n📋 替代方案:');
  result.alternatives.forEach(alt => {
    console.log(`  - ${alt.road}: ${alt.alternative_description}`);
  });
}
```

### 输出示例 (F-Road 关闭)

```json
{
  "can_proceed": false,
  "roads_found": ["F208"],
  "open_roads": [],
  "blocked_roads": [
    {
      "road": "F208",
      "status": "closed",
      "reason": "Typically closed in winter (October-May). Status unverified.",
      "verified": false,
      "last_check": "2026-02-14T18:00:00.000Z"
    }
  ],
  "restricted_roads": [],
  "alternatives": [
    {
      "road": "F208",
      "alternative_road": "F225",
      "alternative_description": "F225 (longer but safer)"
    },
    {
      "road": "F208",
      "alternative_road": "Ring Road",
      "alternative_description": "Ring Road via south coast"
    }
  ],
  "evidence_refs": [
    {
      "evidence_id": "F208",
      "source": "road-status-realtime-service",
      "last_verified_at": "2026-02-14T18:00:00.000Z",
      "confidence": 0.7
    }
  ],
  "gate_recommendation": "BLOCK"
}
```

---

## 5. POI 查询 - 地点搜索

### 按坐标半径搜索

```typescript
import { PrismaService } from '@prisma/client';

const prisma = new PrismaService();

// 查询 Reykjavík 周边 10km 的景点
const places = await prisma.$queryRaw`
  SELECT
    id,
    name_cn,
    name_en,
    category,
    rating,
    ST_Distance(
      location,
      ST_SetSRID(ST_MakePoint(-21.9426, 64.1466), 4326)::geography
    ) / 1000 as distance_km
  FROM "Place"
  WHERE
    country = 'Iceland'
    AND ST_DWithin(
      location,
      ST_SetSRID(ST_MakePoint(-21.9426, 64.1466), 4326)::geography,
      10000  -- 10km
    )
  ORDER BY distance_km ASC
  LIMIT 20;
`;

places.forEach(p => {
  console.log(`${p.name_en} (${p.category}): ${p.distance_km.toFixed(2)} km`);
});
```

### 按分类搜索

```typescript
const attractions = await prisma.place.findMany({
  where: {
    country: 'Iceland',
    category: 'ATTRACTION',
    rating: { gte: 4.0 },
  },
  orderBy: { rating: 'desc' },
  take: 10,
});

attractions.forEach(a => {
  console.log(`${a.name_en}: ⭐ ${a.rating}`);
});
```

---

## 6. DEM 查询 - 爬升计算

### 查询单点海拔

```typescript
// 查询 Landmannalaugar 海拔
const result = await prisma.$queryRaw`
  SELECT ST_Value(rast, ST_SetSRID(ST_MakePoint(-18.0, 64.75), 4326)) as elevation
  FROM geo_dem_iceland_20m
  WHERE ST_Intersects(rast, ST_SetSRID(ST_MakePoint(-18.0, 64.75), 4326))
  LIMIT 1;
`;

console.log('海拔:', result[0]?.elevation, 'm');
```

### 计算路线爬升

```typescript
// 计算从 Vík 到 Landmannalaugar 的累计爬升
const waypoints = [
  { lat: 63.4181, lng: -19.0059 }, // Vík
  { lat: 63.7, lng: -18.5 },       // 中间点 1
  { lat: 64.0, lng: -18.3 },       // 中间点 2
  { lat: 64.75, lng: -18.0 },      // Landmannalaugar
];

let totalAscent = 0;
let prevElevation = null;

for (const wp of waypoints) {
  const result = await prisma.$queryRaw`
    SELECT ST_Value(rast, ST_SetSRID(ST_MakePoint(${wp.lng}, ${wp.lat}), 4326)) as elevation
    FROM geo_dem_iceland_20m
    WHERE ST_Intersects(rast, ST_SetSRID(ST_MakePoint(${wp.lng}, ${wp.lat}), 4326))
    LIMIT 1;
  `;

  const elevation = result[0]?.elevation;
  if (elevation && prevElevation !== null) {
    const ascent = Math.max(0, elevation - prevElevation);
    totalAscent += ascent;
  }
  prevElevation = elevation;
}

console.log('累计爬升:', totalAscent.toFixed(0), 'm');
```

---

## 🧪 完整集成示例

### 场景: 冰岛高地 3 日行程规划

```typescript
import { ClaudeGatekeeperAgentService } from './agent/services/sub-agents/gatekeeper-agent.service';
import { TripPlanRequest } from './agent/interfaces/trip-plan.interface';

async function planIcelandHighlandsTrip() {
  // 1. 构建行程请求
  const request: TripPlanRequest = {
    request_id: 'iceland-highlands-001',
    origin: { lat: 64.1466, lng: -21.9426 }, // Reykjavík
    destination: { lat: 64.75, lng: -18.0 },  // Landmannalaugar
    date_range: {
      start: new Date('2026-07-15'),
      end: new Date('2026-07-18'),
    },
    mode: 'drive',
    party: {
      adults: 2,
      children: 0,
      fitness_level: 'moderate',
      has_4wd: true,  // 必需，高地需要 4WD
    },
    constraints: {
      max_daily_hours: 8,
      max_ascent_m: 1000,  // 每日最大爬升
      budget: { total: 5000, currency: 'USD' },
    },
    preferences: {
      scenic_priority: 0.8,
      efficiency_priority: 0.2,
      avoid_tolls: true,
    },
  };

  // 2. 执行 Should-Exist Gate 评估
  const gateResult = await gatekeeperAgent.evaluateGate(
    request,
    {},
    { current_step: 'GATE_EVAL', request_id: request.request_id }
  );

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Should-Exist Gate 评估结果');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log(`✅ Gate 结果: ${gateResult.gate_result}`);
  console.log(`📊 置信度: ${gateResult.confidence}`);

  // 3. 处理 Gate 结果
  if (gateResult.gate_result === 'BLOCK') {
    console.log('\n❌ 行程被阻塞，无法继续:\n');
    gateResult.violations.forEach(v => {
      console.log(`  [${v.severity}] ${v.type}:`);
      console.log(`    ${v.detail}\n`);
    });

    console.log('📋 建议的调整方案:\n');
    gateResult.required_adjustments.forEach((adj, i) => {
      console.log(`  ${i + 1}. ${adj.action}:`);
      console.log(`     ${adj.why}\n`);
    });

    return { status: 'blocked', gate_result: gateResult };
  }

  if (gateResult.gate_result === 'ADJUST_REQUIRED') {
    console.log('\n⚠️  行程需要调整:\n');
    gateResult.required_adjustments.forEach((adj, i) => {
      console.log(`  ${i + 1}. ${adj.action}:`);
      console.log(`     ${adj.why}\n`);
    });

    // 在实际应用中，这里会触发行程修复流程
    return { status: 'needs_adjustment', gate_result: gateResult };
  }

  if (gateResult.gate_result === 'NEED_USER_CONFIRM') {
    console.log('\n❓ 存在风险，需要用户确认是否继续\n');
    return { status: 'needs_confirmation', gate_result: gateResult };
  }

  // 4. Gate 通过，继续生成行程
  console.log('\n✅ Gate 检查通过，可以继续生成行程\n');

  // 这里会调用 PlannerAgent 生成详细行程
  // const itinerary = await plannerAgent.generateItinerary(request, researchData);

  return { status: 'approved', gate_result: gateResult };
}

// 执行
planIcelandHighlandsTrip()
  .then(result => {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`最终状态: ${result.status}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  })
  .catch(error => {
    console.error('❌ 行程规划失败:', error.message);
  });
```

---

## 📝 最佳实践

### 1. 错误处理

```typescript
try {
  const gateResult = await gatekeeperAgent.evaluateGate(request, researchData, context);
  // 处理结果
} catch (error) {
  if (error.message.includes('ENOTFOUND')) {
    console.warn('API 不可达，使用降级策略');
    // 降级处理
  } else {
    console.error('Gate 评估失败:', error);
    throw error;
  }
}
```

### 2. 证据链追踪

```typescript
// 记录所有证据到决策日志
await prisma.decisionLog.create({
  data: {
    requestId: request.request_id,
    step: 'GATE_EVAL',
    actor: 'GatekeeperAgent',
    inputsSummary: JSON.stringify({ origin, destination, date_range }),
    outputsSummary: JSON.stringify({ gate_result, violations, adjustments }),
    evidenceRefs: gateResult.evidence_refs,
    timestamp: new Date(),
  },
});
```

### 3. 缓存使用

```typescript
// 天气数据会自动缓存 6 小时
// 如需强制刷新，直接调用 API
const freshWeather = await weatherService.fetchWeatherFromAPI(lat, lng);
```

---

## 🔗 相关文档

- [生产就绪检查清单](./PRODUCTION_READINESS_CHECKLIST.md)
- [部署指南](./DEPLOYMENT_GUIDE.md)
- [监控配置](./MONITORING_SETUP.md)
- [Phase 5 完成报告](./PHASE_5_COMPLETION_REPORT.md)

---

**最后更新**: 2026-02-14
**版本**: v1.0
