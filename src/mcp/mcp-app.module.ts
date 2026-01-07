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

// DecisionModule 在 MCP 模式下已修复（使用 PlacesLiteModule），默认启用
// 如需禁用，设置 ENABLE_DECISION_SKILLS=false
const enableDecisionSkills = process.env.ENABLE_DECISION_SKILLS !== 'false';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    // 只导入 Skills 需要的模块
    ...(enableDecisionSkills ? [DecisionModule] : []),
    RouteDirectionsModule,
    ReadinessModule,
    SkillsModule,
  ],
})
export class McpAppModule {}

