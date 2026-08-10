// src/agent/assistants/planning-assistant/planning-assistant.module.ts
/**
 * 规划助手模块
 * 
 * V2.1 架构更新：
 * - 引入 AgentInfraModule (LLMExecutor, CoreGateway)
 * - PlanningAssistant 只负责对话体验，通过 CoreGateway 触发核心动作
 */

import { Module, forwardRef } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PlanningAssistantService } from './services/planning-assistant.service';
import { PlanningAssistantController } from './planning-assistant.controller';
import { PlanningAssistantV2Controller } from './controllers/planning-assistant-v2.controller';
import { MobileActivityApplyController } from './controllers/mobile-activity-apply.controller';
import { MobileAccommodationApplyController } from './controllers/mobile-accommodation-apply.controller';
import { McpAgentLoopController } from './controllers/mcp-agent-loop.controller';
import { PlanningAssistantV2Service } from './services/planning-assistant-v2.service';
import { SmartRouterService } from './services/smart-router.service';
import { McpToolRegistryService } from './services/mcp-tool-registry.service';
import { McpToolDispatcherService } from './services/mcp-tool-dispatcher.service';
import { McpAgentExecutorService } from './services/mcp-agent-executor.service';
import { LlmToolSelectorService } from './services/llm-tool-selector.service';
import { AdvancedGeocodingService } from './services/advanced-geocoding.service';
import { LlmModule } from '../../../llm/llm.module';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PlanningWorkbenchAgentService } from '../../services/planning-workbench-agent.service';
import { PersonaShellService } from '../../services/persona-shell.service';
import { SharedAssistantsModule } from '../shared/shared-assistants.module';
import { AgentInfraModule } from '../../infra/infra.module';
import { CacheModule } from '../../../common/cache/cache.module';
import { RedisModule } from '../../../redis/redis.module';
import { PaConversationContextService } from './services/pa-conversation-context.service';
import { HotelDirectModule } from '../../../mcp/hotel-direct.module';
import { GoogleMapsDirectModule } from '../../../mcp/google-maps-direct.module';
import { AirbnbModule } from '../../../mcp/airbnb.module';
import { RestaurantDirectModule } from '../../../mcp/restaurant-direct.module';
import { WeatherDirectModule } from '../../../mcp/weather-direct.module';
import { ExaModule } from '../../../mcp/exa.module';
import { AmadeusModule } from '../../../mcp/amadeus.module';
import { AmadeusDirectModule } from '../../../mcp/amadeus-direct.module';
import { TranslationDirectModule } from '../../../mcp/translation-direct.module';
import { CurrencyDirectModule } from '../../../mcp/currency-direct.module';
import { ImageDirectModule } from '../../../mcp/image-direct.module';
import { VisionModule } from '../../../vision/vision.module';
import { RailModule } from '../../../mcp/rail.module';
import { RailDirectModule } from '../../../mcp/rail-direct.module';
import { TransitousDirectModule } from '../../../mcp/transitous-direct.module';
import { BookingComModule } from '../../../mcp/booking-com.module';
import { FliggyDirectModule } from '../../../mcp/fliggy-direct.module';
import { XiaohongshuDirectModule } from '../../../mcp/xiaohongshu-direct.module';
import { ActivityDirectModule } from '../../../mcp/activity-direct.module';
import { CarRentalDirectModule } from '../../../mcp/car-rental-direct.module';
import { GoogleCalendarModule } from '../../../mcp/google-calendar.module';
import { ItineraryItemsModule } from '../../../itinerary-items/itinerary-items.module';
import { EffectivePlanExecutionModule } from '../../../decision-runtime/execution/effective-plan-execution.module';
import { AgentModule } from '../../agent.module';
import { TripsModule } from '../../../trips/trips.module';
import { QueryRewritingModule } from '../../query-rewriting.module';
// 根据环境变量调整限流配置
const isDevelopment = process.env.NODE_ENV !== 'production';
const disableThrottler = process.env.DISABLE_THROTTLER === 'true';

// 开发环境：更宽松的限流（1000 次/分钟）或禁用
// 生产环境：标准限流（100 次/分钟）
const throttlerConfig = disableThrottler
  ? [{ ttl: 60000, limit: 999999 }] // 禁用限流（设置一个非常大的值）
  : isDevelopment
    ? [{ ttl: 60000, limit: 1000 }] // 开发环境：1000 次/分钟
    : [{ ttl: 60000, limit: 100 }]; // 生产环境：100 次/分钟

@Module({
  imports: [
    ThrottlerModule.forRoot(throttlerConfig),
    LlmModule,
    QueryRewritingModule,
    PrismaModule, // 提供PrismaService
    SharedAssistantsModule,
    forwardRef(() => AgentModule), // 方案 A: 注入 AgentService 用于 route_and_run 编排
    AgentInfraModule, // V2.1: Infra层 (LLMExecutor, CoreGateway, TaskService)
    CacheModule, // 通用缓存模块
    RedisModule, // PA 对话上下文 Redis 双写
    HotelDirectModule, // 酒店搜索服务
    GoogleMapsDirectModule, // Google Maps 服务（用于地理编码）
    AirbnbModule, // Airbnb/民宿搜索服务
    RestaurantDirectModule, // 餐厅搜索服务
    WeatherDirectModule, // 天气查询服务
    ExaModule, // Web搜索服务（Exa MCP）
    AmadeusModule, // 航班搜索服务（MCP）
    AmadeusDirectModule, // 航班搜索 Direct API（无需 MCP）
    TranslationDirectModule, // 翻译服务
    CurrencyDirectModule, // 货币转换服务
    ImageDirectModule, // 图片搜索服务
    VisionModule, // Vision Service + OCR（图片识别）
    RailModule, // Rail MCP 服务（铁路查询，需 OAuth）
    RailDirectModule, // Rail Direct API（无需认证，v6.db.transport.rest）
    TransitousDirectModule, // Transitous MOTIS API（欧洲 fallback，55+ 国 GTFS）
    BookingComModule, // Booking.com 租车服务
    FliggyDirectModule, // 飞猪 FlyAI（国内酒店/门票/机票/租车/美食）
    XiaohongshuDirectModule, // 小红书社区体验
    ActivityDirectModule, // 活动/门票（海外/目录回落）
    CarRentalDirectModule, // 租车 Direct（Browserbase/目录回落）
    GoogleCalendarModule, // Google Calendar MCP 服务（日历管理）
    ItineraryItemsModule,
    EffectivePlanExecutionModule,
    forwardRef(() => TripsModule), // 方案2：ExecutionAgent 不可用时，TripSuggestionsService 作为优化降级
  ],
  controllers: [
    PlanningAssistantController, // V1 接口（保留，向后兼容）
    PlanningAssistantV2Controller, // V2 接口（新设计）
    MobileActivityApplyController, // mobile 别名：activities/apply
    MobileAccommodationApplyController, // mobile 别名：accommodations/apply
    McpAgentLoopController, // 原生 Tool Calling + MCP 闭环（实验）
  ],
  providers: [
    PaConversationContextService,
    PlanningAssistantService,
    PlanningAssistantV2Service, // V2 Service
    SmartRouterService, // 智能路由服务
    McpToolRegistryService, // MCP 工具注册表
    McpToolDispatcherService, // MCP 工具分发器
    McpAgentExecutorService, // Agent Loop + MCP（实验）
    LlmToolSelectorService, // LLM 工具选择器
    AdvancedGeocodingService, // 高级地理编码服务
    PlanningWorkbenchAgentService, // 保留用于 CoreGateway 内部路由
    PersonaShellService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard, // 全局应用速率限制守卫
    },
  ],
  exports: [
    PlanningAssistantService,
    PlanningAssistantV2Service, // 导出V2 Service
    McpToolRegistryService,
    /** route_and_run / ClaudeOrchestrator 轻量路径：只读 MCP 传感器 */
    McpToolDispatcherService,
    McpAgentExecutorService,
  ],
})
export class PlanningAssistantModule {}
