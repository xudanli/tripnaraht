// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
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
import { RagModule } from './rag/rag.module';
import { UploadModule } from './upload/upload.module';
import { AuthModule } from './auth/auth.module';
import { ContactModule } from './contact/contact.module';
import { SkillsModule } from './skills/skills.module';
import { CitiesModule } from './cities/cities.module';
import { WeatherModule } from './weather/weather.module';
import { IcelandInfoModule } from './iceland-info/iceland-info.module';
import { DataQualityModule } from './data-quality/data-quality.module';
import { DataPrivacyModule } from './data-privacy/data-privacy.module';
import { DataPipelineModule } from './data-pipeline/data-pipeline.module';
import { DataModelingModule } from './data-modeling/data-modeling.module';
import { DataArchitectureModule } from './data-architecture/data-architecture.module';
import { ContentStrategyModule } from './content-strategy/content-strategy.module';
import { ContextEngineModule } from './agent/context-engine/context-engine.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // 明确指定 .env 文件路径，并确保 .env 文件的优先级高于 process.env
      envFilePath: '.env',
      // 如果 process.env 中已有值，仍然使用 .env 文件的值（override: true）
      // 注意：NestJS ConfigModule 默认行为是 process.env 优先级更高
      // 但通过明确指定 envFilePath，我们可以确保 .env 文件被正确加载
    }),
    ScheduleModule.forRoot(), // 提供定时任务支持（SchedulerRegistry）
    PrismaModule,
    AuthModule,
    RedisModule, // Redis 缓存模块
    DataContractsModule, // 数据契约模块（适配器模式）
    DataQualityModule, // 数据质量模块（五维度框架）
    DataPrivacyModule, // 数据隐私保护模块
    DataPipelineModule, // 数据管道模块（采集、处理、应用）
    DataModelingModule, // 数据建模模块（不确定性建模）
    DataArchitectureModule, // 数据架构模块（四层架构）
    ContentStrategyModule, // 内容策略模块（话术规范框架）
    // ✅ 第一批：基础服务模块（已确认正常）
    SystemModule, // 系统状态模块
    ContactModule, // 联系我们模块
    UsersModule, // 用户画像模块
    CountriesModule, // 国家档案模块
    CitiesModule, // 城市模块
    WeatherModule, // 天气模块
    IcelandInfoModule, // 冰岛信息源模块（vedur.is, safetravel.is, road.is）
    LlmModule, // LLM 通用服务模块
    PlacesModule, // 地点相关模块
    FlightPricesModule, // 机票价格参考模块
    HotelsModule, // 酒店价格模块
    // 第二批：行程相关模块
    ItineraryItemsModule,
    // TripTemplatesModule, // 临时禁用，避免启动阻塞（依赖 TripsModule，而 TripsModule 已禁用）
    // 第三批：优化和决策模块
    ItineraryOptimizationModule, // 路线优化模块（节奏感算法）
    PlanningPolicyModule, // 规划策略模块（画像驱动、稳健度评估、What-If）
    // 第四批：交通
    TransportModule, // 交通规划模块
    // 第五批：高级功能
    // TasksModule, // 定时任务模块
    // VoiceModule, // 语音解析模块
    // VisionModule, // 视觉识别模块（拍照识别 POI）
    ScheduleActionModule, // 行程动作执行模块
    // TrailsModule, // 徒步路线模块
    // 第六批：行程核心模块（可能有循环依赖）
    TripsModule, // 恢复：已确认问题在 TripsModule 或其依赖链
    // 第七批：智能体和技能（可能有问题）
    RailPassModule, // RailPass 合规与订座决策模块（测试中）
    // ReadinessModule, // 暂时禁用，测试是否导致阻塞（DecisionModule 使用懒加载获取 ReadinessService）
    RouteDirectionsModule, // 恢复：测试是否导致阻塞
    RagModule, // 恢复：RAG 模块（用于增强对话）
    AgentModule, // Agent 模块（Router + Orchestrator）（恢复：需要 route_and_run 路由）
    ContextEngineModule, // Context Engine 模块（上下文编译器）
    // SkillsModule, // Skills 模块（能力颗粒层）
    UploadModule, // 图片上传模块（阿里云 OSS）
  ],
})
export class AppModule {}

