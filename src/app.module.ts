// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { PlacesModule } from './places/places.module';
import { TripsModule } from './trips/trips.module';
import { ItineraryItemsModule } from './itinerary-items/itinerary-items.module';
import { TasksModule } from './tasks/tasks.module';
import { CountriesModule } from './countries/countries.module';
import { TransportModule } from './transport/transport.module';
import { FlightPricesModule } from './flight-prices/flight-prices.module';
import { ItineraryOptimizationModule } from './itinerary-optimization/itinerary-optimization.module';
import { HotelsModule } from './hotels/hotels.module';
import { RedisModule } from './redis/redis.module';
import { PlanningPolicyModule } from './planning-policy/planning-policy.module';
import { VoiceModule } from './voice/voice.module';
import { VisionModule } from './vision/vision.module';
import { ScheduleActionModule } from './schedule-action/schedule-action.module';
import { SystemModule } from './system/system.module';
import { UsersModule } from './users/users.module';
import { TripTemplatesModule } from './trip-templates/trip-templates.module';
import { LlmModule } from './llm/llm.module';
import { TrailsModule } from './trails/trails.module';
import { AgentModule } from './agent/agent.module';
import { RailPassModule } from './railpass/railpass.module';
import { ReadinessModule } from './trips/readiness/readiness.module';
import { DataContractsModule } from './data-contracts/data-contracts.module';
import { RouteDirectionsModule } from './route-directions/route-directions.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    RedisModule, // Redis 缓存模块
    PlacesModule,
    TripsModule,
    ItineraryItemsModule,
    TasksModule, // 定时任务模块
    CountriesModule, // 国家档案模块
    TransportModule, // 交通规划模块
    FlightPricesModule, // 机票价格参考模块
    ItineraryOptimizationModule, // 路线优化模块（节奏感算法）
    HotelsModule, // 酒店价格模块
    PlanningPolicyModule, // 规划策略模块（画像驱动、稳健度评估、What-If）
    VoiceModule, // 语音解析模块
    VisionModule, // 视觉识别模块（拍照识别 POI）
    ScheduleActionModule, // 行程动作执行模块
    SystemModule, // 系统状态模块
    UsersModule, // 用户画像模块
    TripTemplatesModule, // 行程模板模块
    LlmModule, // LLM 通用服务模块
    TrailsModule, // 徒步路线模块
    AgentModule, // Agent 模块（Router + Orchestrator）
    RailPassModule, // RailPass 合规与订座决策模块
    ReadinessModule, // 旅行准备度检查模块
    DataContractsModule, // 数据契约模块（适配器模式）
    RouteDirectionsModule, // 国家级路线方向资产模块
  ],
})
export class AppModule {}

