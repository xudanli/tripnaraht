// src/agent/plan-execute/plan-execute.module.ts
/**
 * Plan-and-Execute Module
 * 
 * 提供并行编排器和重规划器功能
 */

import { Module } from '@nestjs/common';
import { DAGOrchestratorService } from './orchestrator.service';
import { PlannerService } from './planner.service';
import { ReplannerService } from './replanner.service';
import { ExecutorService } from './executor.service';
import { ContextAssemblerService } from './context-assembler.service';
import { AgentModule } from '../agent.module';
import { LlmModule } from '../../llm/llm.module';

@Module({
  imports: [AgentModule, LlmModule],
  providers: [
    DAGOrchestratorService,
    PlannerService,
    ReplannerService,
    ExecutorService,
    ContextAssemblerService,
  ],
  exports: [
    DAGOrchestratorService,
    PlannerService,
    ReplannerService,
    ExecutorService,
    ContextAssemblerService,
  ],
})
export class PlanExecuteModule {}
