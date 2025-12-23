# 数据契约模块

## 📋 概述

数据契约模块实现了**分层数据治理模式**和**适配器模式**，支持：

1. **全球通用层**：通过 OpenWeather、Google Traffic 等通用 API 覆盖 80% 需求
2. **国家/场景插件层**：针对高客单价/高难度场景的定制数据源（如冰岛 Road.is）
3. **按需触发**：根据经纬度自动选择合适的数据适配器

## 🏗️ 架构设计

### 标准数据契约

所有数据源都必须转换为标准格式：

- `RoadStatus` - 路况状态
- `WeatherData` - 天气数据
- `TransportSchedule` - 公共交通时刻表
- `FerrySchedule` - 轮渡时刻表

### 适配器模式

每个数据源实现对应的适配器接口：

- `RoadStatusAdapter` - 路况适配器
- `WeatherAdapter` - 天气适配器
- `TransportAdapter` - 公共交通适配器
- `FerryAdapter` - 轮渡适配器

### 数据源路由器

`DataSourceRouterService` 负责：
- 根据经纬度自动选择适配器
- 管理适配器优先级
- 缓存适配器选择结果

## 📁 目录结构

```
src/data-contracts/
├── interfaces/              # 标准数据契约接口
│   ├── road-status.interface.ts
│   ├── weather.interface.ts
│   ├── transport-schedule.interface.ts
│   └── ferry-schedule.interface.ts
├── adapters/                # 适配器实现
│   ├── *.adapter.interface.ts  # 适配器接口
│   ├── default-weather.adapter.ts
│   ├── default-road-status.adapter.ts
│   └── iceland-road-status.adapter.ts
├── services/                # 服务
│   └── data-source-router.service.ts
├── data-contracts.module.ts
└── README.md
```

## 🚀 使用方法

### 1. 获取路况状态

```typescript
import { DataSourceRouterService } from './data-contracts/services/data-source-router.service';

@Injectable()
export class MyService {
  constructor(private router: DataSourceRouterService) {}

  async checkRoadStatus(lat: number, lng: number) {
    const status = await this.router.getRoadStatus({
      lat,
      lng,
      radius: 50000, // 50km
    });
    
    console.log(`路况: ${status.isOpen ? '开放' : '封闭'}`);
    console.log(`风险等级: ${status.riskLevel}`);
    console.log(`数据源: ${status.source}`);
  }
}
```

### 2. 获取天气数据

```typescript
const weather = await this.router.getWeather({
  lat: 64.1466,
  lng: -21.9426,
  timezone: 'Atlantic/Reykjavik',
});

console.log(`温度: ${weather.temperature}°C`);
console.log(`天气: ${weather.condition}`);
console.log(`数据源: ${weather.source}`);
```

### 3. 获取交通时刻表

```typescript
const schedules = await this.router.getTransportSchedule({
  from: {
    name: 'Zurich HB',
    coordinates: { lat: 47.3779, lng: 8.5405 },
  },
  to: {
    name: 'Geneva',
    coordinates: { lat: 46.2044, lng: 6.1432 },
  },
  departureDateTime: '2024-01-15T10:00:00+01:00',
});
```

## 🔧 添加新的适配器

### 步骤 1: 实现适配器接口

```typescript
// src/data-contracts/adapters/swiss-transport.adapter.ts
import { Injectable } from '@nestjs/common';
import { TransportAdapter } from './transport.adapter.interface';
import { TransportSchedule, TransportQuery } from '../interfaces/transport-schedule.interface';

@Injectable()
export class SwissTransportAdapter implements TransportAdapter {
  async getSchedule(query: TransportQuery): Promise<TransportSchedule[]> {
    // 调用 SBB API
    // 转换为标准格式
  }

  getSupportedCountries(): string[] {
    return ['CH']; // 仅支持瑞士
  }

  getPriority(): number {
    return 10; // 高优先级
  }

  getName(): string {
    return 'Swiss SBB';
  }
}
```

### 步骤 2: 注册适配器

在 `data-contracts.module.ts` 中注册：

```typescript
providers: [
  // ... 其他适配器
  SwissTransportAdapter,
  {
    provide: 'ADAPTER_REGISTRATION',
    useFactory: (
      router: DataSourceRouterService,
      swissTransport: SwissTransportAdapter,
      // ... 其他适配器
    ) => {
      router.registerTransportAdapter(swissTransport);
      return true;
    },
    inject: [DataSourceRouterService, SwissTransportAdapter, /* ... */],
  },
],
```

## 📊 已实现的适配器

### 天气适配器

- ✅ `DefaultWeatherAdapter` - OpenWeather API（支持所有国家）

### 路况适配器

- ✅ `DefaultRoadStatusAdapter` - 默认适配器（支持所有国家）
- ✅ `IcelandRoadStatusAdapter` - 冰岛 Road.is API

### 公共交通适配器

- ⏳ 待实现

### 轮渡适配器

- ⏳ 待实现

## 🔄 适配器选择逻辑

1. **按国家代码匹配**：优先选择支持该国家的特定适配器
2. **按优先级排序**：数字越小优先级越高
3. **回退到默认适配器**：如果没有特定适配器，使用默认适配器（支持 `*`）
4. **缓存结果**：适配器选择结果会被缓存，避免重复计算

## 🔗 相关文档

- [架构数据治理分析](../ARCHITECTURE_DATA_GOVERNANCE_ANALYSIS.md)
- [POI 数据集成总结](../POI_DATA_INTEGRATION_SUMMARY.md)

