// src/data-contracts/data-contracts.module.ts

import { Module, Global, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DataSourceRouterService } from './services/data-source-router.service';
import { DefaultWeatherAdapter } from './adapters/default-weather.adapter';
import { WeatherApiAdapter } from './adapters/weatherapi.adapter';
import { OpenMeteoWeatherAdapter } from './adapters/open-meteo-weather.adapter';
import { DefaultRoadStatusAdapter } from './adapters/default-road-status.adapter';
import { ChinaRoadStatusAdapter } from './adapters/china-road-status.adapter';
import { IcelandRoadStatusAdapter } from './adapters/iceland-road-status.adapter';
import { IcelandWeatherAdapter } from './adapters/iceland-weather.adapter';
import { IcelandSafetyAdapter } from './adapters/iceland-safety.adapter';
import { IcelandAuroraAdapter } from './adapters/iceland-aurora.adapter';
import { IcelandFRoadService } from './services/iceland-froad.service';
import { IcelandComprehensiveService } from './services/iceland-comprehensive.service';
import { DataContractsController } from './data-contracts.controller';

/**
 * 数据契约模块
 * 
 * 提供标准数据契约和适配器模式实现
 * 支持全球通用层和国家特定插件层
 */
@Global()
@Module({
  imports: [ConfigModule],
  controllers: [DataContractsController],
  providers: [
    // 路由器服务
    DataSourceRouterService,
    
    // 天气适配器
    DefaultWeatherAdapter,
    WeatherApiAdapter,
    OpenMeteoWeatherAdapter,
    IcelandWeatherAdapter,
    
    // 路况适配器
    DefaultRoadStatusAdapter,
    ChinaRoadStatusAdapter,
    IcelandRoadStatusAdapter,
    
    // 冰岛特定服务
    IcelandSafetyAdapter,
    IcelandAuroraAdapter,
    IcelandFRoadService,
    IcelandComprehensiveService,
  ],
  exports: [
    DataSourceRouterService,
    IcelandComprehensiveService, // 导出冰岛综合服务
    IcelandSafetyAdapter, // 导出冰岛安全适配器（供 IcelandInfoController 使用）
  ],
})
export class DataContractsModule implements OnModuleInit {
  constructor(
    private readonly router: DataSourceRouterService,
    private readonly defaultWeather: DefaultWeatherAdapter,
    private readonly weatherApi: WeatherApiAdapter,
    private readonly openMeteoWeather: OpenMeteoWeatherAdapter,
    private readonly icelandWeather: IcelandWeatherAdapter,
    private readonly defaultRoad: DefaultRoadStatusAdapter,
    private readonly chinaRoad: ChinaRoadStatusAdapter,
    private readonly icelandRoad: IcelandRoadStatusAdapter,
  ) {}

  onModuleInit() {
    console.log('🔌 [DataContractsModule] onModuleInit called - START');
    // 注册天气适配器（优先级：特定国家适配器 > WeatherAPI > 默认适配器）
    console.log('🔌 [DataContractsModule] Registering weather adapters...');
    this.router.registerWeatherAdapter(this.icelandWeather);
    this.router.registerWeatherAdapter(this.weatherApi);
    this.router.registerWeatherAdapter(this.openMeteoWeather);
    this.router.registerWeatherAdapter(this.defaultWeather);
    console.log('🔌 [DataContractsModule] Weather adapters registered');
    
    // 注册路况适配器（先注册特定适配器，再注册默认适配器）
    console.log('🔌 [DataContractsModule] Registering road status adapters...');
    this.router.registerRoadStatusAdapter(this.icelandRoad);
    this.router.registerRoadStatusAdapter(this.chinaRoad);
    this.router.registerRoadStatusAdapter(this.defaultRoad);
    console.log('🔌 [DataContractsModule] Road status adapters registered');
    console.log('🔌 [DataContractsModule] onModuleInit called - END');
  }
}
