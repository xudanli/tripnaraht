// src/agent/assistants/assistants.module.ts

/**
 * 智能体助手模块
 * 
 * 包含三个独立的智能体助手：
 * - PlanningAssistant: 规划助手，帮用户"想清楚"去哪里、怎么玩（从零开始）
 * - TripPlanner: 行程规划师，已创建行程的智能优化/细化/咨询/执行助手
 * - JourneyAssistant: 行程助手，陪用户"走完"整个旅程（执行阶段）
 * 
 * 共享模块：
 * - SharedAssistantsModule: 提供人格语言、推荐引擎、偏好学习等服务
 */

import { Module } from '@nestjs/common';
import { SharedAssistantsModule } from './shared/shared-assistants.module';
import { PlanningAssistantModule } from './planning-assistant/planning-assistant.module';
import { TripPlannerModule } from './trip-planner/trip-planner.module';
import { JourneyAssistantModule } from './journey-assistant/journey-assistant.module';

@Module({
  imports: [
    SharedAssistantsModule,
    PlanningAssistantModule,
    TripPlannerModule,
    JourneyAssistantModule,
  ],
  exports: [
    SharedAssistantsModule,
    PlanningAssistantModule,
    TripPlannerModule,
    JourneyAssistantModule,
  ],
})
export class AssistantsModule {}
