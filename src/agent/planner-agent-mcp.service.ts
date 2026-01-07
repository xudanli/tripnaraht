// src/agent/planner-agent-mcp.service.ts
/**
 * Planner Agent using MCP Skills
 * 
 * 这是一个最薄的 Agent 层示例，展示如何使用 MCP Skills
 * 
 * 设计：
 * - 使用 LangGraph 或 OpenAI Assistants
 * - 调用 MCP 工具（tripnara.*）
 * - 理解用户自然语言需求
 * - 编排多个 Skills 完成规划任务
 */

import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../llm/services/llm.service';

export interface PlannerRequest {
  /** 用户自然语言需求 */
  userQuery: string;
  /** 用户 ID（可选） */
  userId?: string;
}

export interface PlannerResponse {
  /** 生成的计划 */
  plan?: any;
  /** 使用的 Skills */
  skillsUsed: string[];
  /** 决策日志 */
  decisionLog: Array<{
    skill: string;
    input: any;
    output: any;
  }>;
  /** 解释 */
  explanation: string;
}

@Injectable()
export class PlannerAgentMcpService {
  private readonly logger = new Logger(PlannerAgentMcpService.name);

  constructor(
    private readonly llmService: LlmService,
  ) {}

  /**
   * 规划行程（使用 MCP Skills）
   * 
   * 示例流程：
   * 1. 理解用户需求："7 月想去冰岛徒步 8 天，别太累，预算 2 万以内"
   * 2. 调用 tripnara.routeDirection.pickForIntent
   * 3. 调用 tripnara.dem.getProfile
   * 4. 调用 tripnara.decision.abuCheck
   * 5. 调用 tripnara.decision.drdrePace
   * 6. 调用 tripnara.readiness.generateChecklist
   * 7. 生成最终计划
   */
  async plan(request: PlannerRequest): Promise<PlannerResponse> {
    this.logger.log(`Planner Agent 收到请求: ${request.userQuery}`);

    // TODO: 这里应该：
    // 1. 使用 LLM 解析用户需求，提取参数（国家、月份、天数、偏好等）
    // 2. 调用 MCP 工具（通过 MCP Client 或直接调用 Skills）
    // 3. 编排多个 Skills 完成规划
    // 4. 生成最终计划和解释

    // 目前返回占位符
    return {
      skillsUsed: [
        'tripnara.routeDirection.pickForIntent',
        'tripnara.dem.getProfile',
        'tripnara.decision.abuCheck',
        'tripnara.decision.drdrePace',
        'tripnara.readiness.generateChecklist',
      ],
      decisionLog: [],
      explanation: '这是一个示例实现，实际应该通过 MCP Client 调用 Skills',
    };
  }
}

