// src/agent/agent.controller.ts
import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';
import { AgentService } from './services/agent.service';
import { RouteAndRunRequestDto, RouteAndRunResponseDto } from './dto/route-and-run.dto';

/**
 * Agent Controller
 * 
 * 统一入口：POST /agent/route_and_run
 * 
 * COALA 骨架 + ReAct 思维流的双系统架构：
 * - System 1（快）：API/CRUD/简单查询（< 3s）
 * - System 2（慢）：ReAct 循环 + 工具 + 规划（< 60s）
 */
@ApiTags('agent')
@Controller('agent')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  /**
   * 路由并执行
   * 
   * 智能路由到 System 1 或 System 2，并执行相应的处理流程。
   * 
   * System 1 路径：
   * - SYSTEM1_API: 标准 API / CRUD / 简单查询
   * - SYSTEM1_RAG: 知识库/向量检索
   * 
   * System 2 路径：
   * - SYSTEM2_REASONING: ReAct + 工具 + TravelPlanner/Critic
   * - SYSTEM2_WEBBROWSE: 无头浏览器兜底（仅授权后）
   */
  @Post('route_and_run')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '智能体统一入口 - 路由并执行',
    description: `
智能体统一入口，根据用户输入自动路由到 System 1（快速路径）或 System 2（ReAct 循环）。

**路由策略**：
- 硬规则短路：支付/退款/浏览器 → System2 + consent_required
- 明确 CRUD → System1_API
- 单纯事实查询 → System1_RAG
- 规划/多约束/无 API → System2_REASONING

**System 2 ReAct 循环**：
- Plan → Act → Observe → Critic → Repair
- 受预算控制（max_seconds, max_steps）
- 自动可行性检查（时间窗、日界、午餐、鲁棒时间）

**返回结果**：
- route: 路由决策（route, confidence, reasons, budget）
- result: 执行结果（status, answer_text, payload）
- explain: 决策日志（decision_log）
- observability: 可观测性指标（latency, cost, tool_calls）
    `.trim(),
  })
  @ApiBody({
    type: RouteAndRunRequestDto,
    description: '智能体请求参数',
    examples: {
      '简单查询': {
        value: {
          request_id: 'req-001',
          user_id: 'user-123',
          message: '推荐新宿拉面',
        },
      },
      '规划请求': {
        value: {
          request_id: 'req-002',
          user_id: 'user-123',
          message: '规划5天东京游，包含浅草寺、东京塔、新宿',
          options: {
            max_seconds: 60,
            max_steps: 8,
          },
        },
      },
      '条件分支': {
        value: {
          request_id: 'req-003',
          user_id: 'user-123',
          message: '如果赶不上日落就改去横滨',
          options: {
            max_seconds: 30,
            max_steps: 5,
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '成功返回路由和执行结果',
    type: RouteAndRunResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '请求参数无效',
  })
  @ApiResponse({
    status: 500,
    description: '服务器内部错误',
  })
  async routeAndRun(
    @Body() request: RouteAndRunRequestDto
  ): Promise<RouteAndRunResponseDto> {
    return this.agentService.routeAndRun(request);
  }
}

