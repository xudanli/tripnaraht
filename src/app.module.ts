// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { PlacesModule } from './places/places.module';
import { TripsModule } from './trips/trips.module';
import { ItineraryItemsModule } from './itinerary-items/itinerary-items.module';
import { CountriesModule } from './countries/countries.module';
import { TransportModule } from './transport/transport.module';
import { FlightPricesModule } from './flight-prices/flight-prices.module';
import { ItineraryOptimizationModule } from './itinerary-optimization/itinerary-optimization.module';
import { HotelsModule } from './hotels/hotels.module';
import { RedisModule } from './redis/redis.module';
import { PlanningPolicyModule } from './planning-policy/planning-policy.module';
import { ScheduleActionModule } from './schedule-action/schedule-action.module';
import { SystemModule } from './system/system.module';
import { UsersModule } from './users/users.module';
import { LlmModule } from './llm/llm.module';
import { AgentModule } from './agent/agent.module';
import { RailPassModule } from './railpass/railpass.module';
import { DemModule } from './trips/dem/dem.module';
import { DataContractsModule } from './data-contracts/data-contracts.module';
import { RouteDirectionsModule } from './route-directions/route-directions.module';
import { RagModule } from './rag/rag.module';
import { UploadModule } from './upload/upload.module';
import { AuthModule } from './auth/auth.module';
import { ContactModule } from './contact/contact.module';
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
import { ChainOfWorkModule } from './chain-of-work/chain-of-work.module';
import { DecisionDraftModule } from './decision-draft/decision-draft.module';
import { AdminModule } from './admin/admin.module';
import { AirbnbModule } from './mcp/airbnb.module';
import { AmadeusModule } from './mcp/amadeus.module';
import { ExaModule } from './mcp/exa.module';
import { GoogleCalendarModule } from './mcp/google-calendar.module';
import { BookingComModule } from './mcp/booking-com.module';
import { PostgreSQLMcpModule } from './mcp/postgresql-mcp.module';
import { BrowserbaseMcpModule } from './mcp/browserbase-mcp.module';
import { GoogleMapsDirectModule } from './mcp/google-maps-direct.module';
import { StripeDirectModule } from './mcp/stripe-direct.module';
import { RestaurantDirectModule } from './mcp/restaurant-direct.module';
import { CurrencyDirectModule } from './mcp/currency-direct.module';
import { HotelDirectModule } from './mcp/hotel-direct.module';
import { TranslationDirectModule } from './mcp/translation-direct.module';
import { ImageDirectModule } from './mcp/image-direct.module';
import { FileExtractorMcpModule } from './mcp/file-extractor-mcp.module';
import { FileExtractorDirectModule } from './mcp/file-extractor-direct.module';
import { McpOAuthModule } from './mcp/mcp-oauth.module';
import { McpCapabilityModule } from './mcp/mcp-capability.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { DecisionKernelModule } from './decision/decision-kernel.module';
import { SafetyModule } from './safety/safety.module';
import { WorldModelSchedulerModule } from './trips/decision/world-model-scheduler.module';

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
    DemModule, // DEM 地形数据模块（独立导入，确保 DEM 服务可用）
    // ReadinessModule, // 暂时禁用，测试是否导致阻塞（DecisionModule 使用懒加载获取 ReadinessService）
    RouteDirectionsModule, // 恢复：测试是否导致阻塞
    RagModule, // 恢复：RAG 模块（用于增强对话）
    AgentModule, // Agent 模块（Router + Orchestrator）（恢复：需要 route_and_run 路由）
    ContextEngineModule, // Context Engine 模块（上下文编译器）
    DecisionKernelModule, // Decision Kernel 模块（Phase 2: DSO + Kernel 入口）
    // SkillsModule, // Skills 模块（能力颗粒层）
    UploadModule, // 图片上传模块（阿里云 OSS）
    ChainOfWorkModule, // Chain-of-Work 引擎模块（步骤草案显性化）
    DecisionDraftModule, // Decision-First Agent 引擎模块（决策草案生成）
    AdminModule, // Admin模块（数据质量管理等）
    AirbnbModule, // Airbnb MCP 模块（房源搜索和详情查询）
    AmadeusModule, // Amadeus MCP 模块（航班搜索）
    ExaModule, // Exa MCP 模块（Web 搜索、代码搜索、公司研究）
    GoogleCalendarModule, // Google Calendar MCP 模块（行程同步、事件管理）
    BookingComModule, // Booking.com MCP 模块（租车搜索，通过 RapidAPI）
    PostgreSQLMcpModule, // PostgreSQL MCP 模块（数据库查询和执行）
    BrowserbaseMcpModule, // Browserbase MCP 模块（浏览器自动化）
    GoogleMapsDirectModule, // Google Maps 直接 API 模块（路线规划、地理编码等）
    StripeDirectModule, // Stripe 直接 API 模块（支付处理）
    RestaurantDirectModule, // Restaurant 直接 API 模块（餐厅搜索和推荐）
    CurrencyDirectModule, // Currency Exchange 直接 API 模块（汇率转换）
    HotelDirectModule, // Hotel Booking 直接 API 模块（酒店搜索和推荐）
    TranslationDirectModule, // Translation 直接 API 模块（文本翻译）
    ImageDirectModule, // Image 直接 API 模块（图片搜索和推荐）
    FileExtractorMcpModule, // File Extractor MCP 模块（文件内容提取，需要 OAuth）
    FileExtractorDirectModule, // File Extractor Direct 模块（直接实现，无需认证）⭐
    McpOAuthModule, // MCP OAuth 回调模块（处理所有 MCP 服务的 OAuth 回调）
    McpCapabilityModule, // MCP 能力管理模块（统一控制各能力的开启/关闭）
    AnalyticsModule, // Analytics 模块（数据分析服务，使用 PostgreSQL MCP）
    SafetyModule, // 安全预警模块（地缘政治风险评估、旅行警告、安全通知）
    WorldModelSchedulerModule, // 专利实施例：世界模型异步推送调度（WeatherAgent → pushEnvironmentDelta）
  ],
})
export class AppModule {}

