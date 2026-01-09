// src/agent/plan-execute/plan-execute.module.ts
/**
 * Plan-and-Execute Module
 * 
 * 提供并行编排器和重规划器功能
 */

import { Module, forwardRef } from '@nestjs/common';
import { DAGOrchestratorService } from './orchestrator.service';
import { PlannerService } from './planner.service';
import { ReplannerService } from './replanner.service';
import { ExecutorService } from './executor.service';
import { ContextAssemblerService } from './context-assembler.service';
import { LlmModule } from '../../llm/llm.module';

// 检查是否在 MCP 模式下
const isMcpMode = process.argv.some(arg => arg.includes('mcp-skills-server')) ||
                  process.env.MCP_MODE === 'true';

// 在非 MCP 模式下，导入 AgentModule（使用 forwardRef 避免循环依赖）
// 在 MCP 模式下，不导入 AgentModule，因为它不会被加载
let AgentModuleRef: any = null;
if (!isMcpMode) {
  try {
    // 使用动态导入来避免循环依赖
    // forwardRef 需要一个返回类的函数
    const agentModule = require('../agent.module');
    AgentModuleRef = forwardRef(() => agentModule.AgentModule);
  } catch (e) {
    // 如果导入失败（不应该发生），则跳过
    AgentModuleRef = null;
  }
}

/**
 * Plan-and-Execute Module
 * 
 * 注意：
 * - 在非 MCP 模式下，使用 forwardRef 导入 AgentModule（打破循环依赖）
 * - 在 MCP 模式下，不导入 AgentModule（因为它不会被加载，且 ExecutorService 的 ActionRegistryService 是 Optional 的）
 */
@Module({
  imports: [
    LlmModule,
    // 只有在非 MCP 模式下才导入 AgentModule
    ...(AgentModuleRef ? [AgentModuleRef] : []),
  ],
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
