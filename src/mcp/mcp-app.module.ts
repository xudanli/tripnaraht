// src/mcp/mcp-app.module.ts
/**
 * MCP App Module
 * 
 * 专门为 MCP Server 创建的轻量级应用模块
 * 只包含 Skills 需要的模块，避免加载不必要的模块（如 AuthModule）
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { DecisionModule } from '../trips/decision/decision.module';
import { RouteDirectionsModule } from '../route-directions/route-directions.module';
import { ReadinessModule } from '../trips/readiness/readiness.module';
import { SkillsModule } from '../skills/skills.module';
import { PostgreSQLMcpModule } from './postgresql-mcp.module';
import { BrowserbaseMcpModule } from './browserbase-mcp.module';
import { GoogleMapsDirectModule } from './google-maps-direct.module';
import { WeatherDirectModule } from './weather-direct.module';
import { VisionModule } from '../vision/vision.module';
import { McpCapabilityModule } from './mcp-capability.module';

// DecisionModule 在 MCP 模式下已修复（使用 PlacesLiteModule），默认禁用（避免启动阻塞）
// 如需启用，设置 ENABLE_DECISION_SKILLS=true
const enableDecisionSkills = process.env.ENABLE_DECISION_SKILLS === 'true';
// ReadinessModule 在 MCP 模式下默认禁用（避免启动阻塞）
const enableReadinessModule = process.env.ENABLE_READINESS_MODULE === 'true';
// PlacesModule 在 MCP 模式下默认禁用（导致启动阻塞）
// 如需 EmbeddingService，可以在 SkillsModule 中单独导入 PlacesLiteModule
const enablePlacesModule = process.env.ENABLE_PLACES_MODULE === 'true';
// ContextEngineModule 在 MCP 模式下默认启用（核心功能）
const enableContextEngineModule = process.env.ENABLE_CONTEXT_ENGINE_MODULE !== 'false';
// TripsModule 在 MCP 模式下默认禁用（避免启动阻塞）
const enableTripsModule = process.env.ENABLE_TRIPS_MODULE === 'true';
// Google Maps Direct Module 默认启用，可通过 DISABLE_GOOGLE_SERVICES=true 禁用（用于测试环境）
const enableGoogleMapsModule = process.env.DISABLE_GOOGLE_SERVICES !== 'true';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    // 只导入 Skills 需要的模块（在 MCP 模式下，大部分模块默认禁用以加快启动）
    ...(enableDecisionSkills ? [DecisionModule] : []),
    ...(enableReadinessModule ? [ReadinessModule] : []),
    RouteDirectionsModule,
    SkillsModule,
    PostgreSQLMcpModule, // PostgreSQL MCP 模块（用于智能体工具）
    BrowserbaseMcpModule, // Browserbase MCP 模块（用于智能体工具）
    ...(enableGoogleMapsModule ? [GoogleMapsDirectModule] : []), // Google Maps 直接 API 模块（路线规划、地理编码等），可通过 DISABLE_GOOGLE_SERVICES=true 禁用
    WeatherDirectModule, // Weather 直接 API 模块（使用 Open-Meteo API，无需 Python）
    VisionModule, // Vision Service + OCR 模块（图片识别、OCR提取文字）
    McpCapabilityModule, // MCP 能力管理模块（统一控制各能力的开启/关闭）
  ],
})
export class McpAppModule {}

