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

// MCP 模式下：DecisionModule 会导致 createApplicationContext 卡住
// 如需开启，设置 ENABLE_DECISION_SKILLS=true
const isMcpMode = process.env.MCP_MODE === 'true';
const enableDecisionSkills = !isMcpMode || process.env.ENABLE_DECISION_SKILLS === 'true';

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

