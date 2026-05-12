import { Body, Controller, HttpCode, HttpStatus, Logger, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../../auth/decorators/public.decorator';
import { successResponse, errorResponse, ErrorCode } from '../../../../common/dto/standard-response.dto';
import { McpAgentExecutorService } from '../services/mcp-agent-executor.service';
import { McpAgentLoopRunDto } from '../dto/mcp-agent-loop.dto';

@ApiTags('规划助手智能体')
@Controller('agent/planning-assistant')
export class McpAgentLoopController {
  private readonly logger = new Logger(McpAgentLoopController.name);

  constructor(private readonly mcpAgentExecutor: McpAgentExecutorService) {}

  /**
   * 原生 Tool Calling + MCP 执行闭环（最小垂直切片，默认天气工具包）。
   */
  @Public()
  @Post('tool-loop/run')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'MCP Agent Tool Loop（实验）',
    description:
      'OpenAI 兼容 chat/completions + 原生 tools，执行 MCP weather.* 并回填 tool_result。需配置 OPENAI_API_KEY 或 DEEPSEEK_API_KEY 或 VLLM。',
  })
  async runToolLoop(@Body() dto: McpAgentLoopRunDto) {
    try {
      const result = await this.mcpAgentExecutor.runLoop({
        message: dto.message,
        systemPrompt: dto.system_prompt,
        maxSteps: dto.max_steps,
        provider: dto.provider,
        toolPacks: dto.tool_packs?.length ? dto.tool_packs : dto.tool_pack ? [dto.tool_pack] : undefined,
      });
      return successResponse(result);
    } catch (error: any) {
      this.logger.error(`tool-loop failed: ${error?.message}`, error?.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error?.message || 'tool-loop failed');
    }
  }
}
