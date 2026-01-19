// src/agent/assistants/planning-assistant/planning-assistant.module.ts
/**
 * 规划助手模块
 * 
 * V2.1 架构更新：
 * - 引入 AgentInfraModule (LLMExecutor, CoreGateway)
 * - PlanningAssistant 只负责对话体验，通过 CoreGateway 触发核心动作
 */

import { Module } from '@nestjs/common';
import { PlanningAssistantService } from './services/planning-assistant.service';
import { PlanningAssistantController } from './planning-assistant.controller';
import { LlmModule } from '../../../llm/llm.module';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PlanningWorkbenchAgentService } from '../../services/planning-workbench-agent.service';
import { PersonaShellService } from '../../services/persona-shell.service';
import { SharedAssistantsModule } from '../shared/shared-assistants.module';
import { AgentInfraModule } from '../../infra/infra.module';

@Module({
  imports: [
    LlmModule,
    PrismaModule,
    SharedAssistantsModule,
    AgentInfraModule, // V2.1: Infra层 (LLMExecutor, CoreGateway)
  ],
  controllers: [PlanningAssistantController],
  providers: [
    PlanningAssistantService,
    PlanningWorkbenchAgentService, // 保留用于 CoreGateway 内部路由
    PersonaShellService,
  ],
  exports: [PlanningAssistantService],
})
export class PlanningAssistantModule {}
