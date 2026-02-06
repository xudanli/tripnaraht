/**
 * Browserbase MCP Controller
 * 
 * 提供 Browserbase MCP 服务的 API 端点
 */

import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { BrowserbaseMcpService } from './browserbase-mcp.service';
import { 
  CreateSessionDto, 
  NavigateDto, 
  ScreenshotDto, 
  ClickDto, 
  EvaluateDto 
} from './dto/browserbase.dto';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../common/dto/api-response.dto';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('browserbase-mcp')
@Controller('browserbase-mcp')
@Public() // 临时开放，生产环境可能需要认证
export class BrowserbaseMcpController {
  private readonly logger = new Logger(BrowserbaseMcpController.name);

  constructor(
    private readonly browserbaseMcpService: BrowserbaseMcpService,
  ) {}

  @Post('session/create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '创建浏览器会话',
    description: '创建一个新的 Browserbase 浏览器会话',
  })
  @ApiBody({ type: CreateSessionDto })
  @ApiResponse({
    status: 200,
    description: '会话创建成功',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '请求参数错误',
    type: ApiErrorResponseDto,
  })
  async createSession(@Body() dto: CreateSessionDto) {
    try {
      if (!this.browserbaseMcpService.isAvailable()) {
        return errorResponse(
          ErrorCode.INTERNAL_ERROR,
          'Browserbase MCP service is not available. Please check BROWSERBASE_MCP_SERVER_URL configuration.',
        );
      }

      const result = await this.browserbaseMcpService.createSession(dto);
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Browserbase create session failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '创建会话失败',
      );
    }
  }

  @Post('navigate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '导航到 URL',
    description: '在浏览器会话中导航到指定 URL',
  })
  @ApiBody({ type: NavigateDto })
  @ApiResponse({
    status: 200,
    description: '导航成功',
    type: ApiSuccessResponseDto,
  })
  async navigate(@Body() dto: NavigateDto) {
    try {
      if (!this.browserbaseMcpService.isAvailable()) {
        return errorResponse(
          ErrorCode.INTERNAL_ERROR,
          'Browserbase MCP service is not available.',
        );
      }

      const result = await this.browserbaseMcpService.navigate(dto);
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Browserbase navigate failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '导航失败',
      );
    }
  }

  @Post('screenshot')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '截图',
    description: '对浏览器会话进行截图',
  })
  @ApiBody({ type: ScreenshotDto })
  @ApiResponse({
    status: 200,
    description: '截图成功',
    type: ApiSuccessResponseDto,
  })
  async screenshot(@Body() dto: ScreenshotDto) {
    try {
      if (!this.browserbaseMcpService.isAvailable()) {
        return errorResponse(
          ErrorCode.INTERNAL_ERROR,
          'Browserbase MCP service is not available.',
        );
      }

      const result = await this.browserbaseMcpService.screenshot(dto);
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Browserbase screenshot failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '截图失败',
      );
    }
  }

  @Post('click')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '点击元素',
    description: '在浏览器会话中点击指定元素',
  })
  @ApiBody({ type: ClickDto })
  @ApiResponse({
    status: 200,
    description: '点击成功',
    type: ApiSuccessResponseDto,
  })
  async click(@Body() dto: ClickDto) {
    try {
      if (!this.browserbaseMcpService.isAvailable()) {
        return errorResponse(
          ErrorCode.INTERNAL_ERROR,
          'Browserbase MCP service is not available.',
        );
      }

      const result = await this.browserbaseMcpService.click(dto);
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Browserbase click failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '点击失败',
      );
    }
  }

  @Post('evaluate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '执行 JavaScript',
    description: '在浏览器会话中执行 JavaScript 代码',
  })
  @ApiBody({ type: EvaluateDto })
  @ApiResponse({
    status: 200,
    description: '执行成功',
    type: ApiSuccessResponseDto,
  })
  async evaluate(@Body() dto: EvaluateDto) {
    try {
      if (!this.browserbaseMcpService.isAvailable()) {
        return errorResponse(
          ErrorCode.INTERNAL_ERROR,
          'Browserbase MCP service is not available.',
        );
      }

      const result = await this.browserbaseMcpService.evaluate(dto);
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Browserbase evaluate failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '执行失败',
      );
    }
  }

  @Get('tools')
  @ApiOperation({
    summary: '列出所有可用工具',
    description: '获取 Browserbase MCP 服务器提供的所有工具列表',
  })
  @ApiResponse({
    status: 200,
    description: '获取成功',
    type: ApiSuccessResponseDto,
  })
  async listTools() {
    try {
      if (!this.browserbaseMcpService.isAvailable()) {
        return errorResponse(
          ErrorCode.INTERNAL_ERROR,
          'Browserbase MCP service is not available.',
        );
      }

      const tools = await this.browserbaseMcpService.listTools();
      return successResponse({ tools });
    } catch (error: any) {
      this.logger.error('List tools failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '获取工具列表失败',
      );
    }
  }

  @Get('health')
  @ApiOperation({
    summary: '检查服务状态',
    description: '检查 Browserbase MCP 服务是否可用',
  })
  @ApiResponse({
    status: 200,
    description: '服务状态',
    type: ApiSuccessResponseDto,
  })
  async health() {
    return successResponse({
      available: this.browserbaseMcpService.isAvailable(),
      service: 'browserbase-mcp',
    });
  }

  @Get('auth/url')
  @ApiOperation({
    summary: '获取授权 URL',
    description: '获取 Browserbase OAuth 授权 URL 和 connectionId，用户需要访问此 URL 完成授权',
  })
  @ApiResponse({
    status: 200,
    description: '授权 URL 和 connectionId',
    type: ApiSuccessResponseDto,
  })
  async getAuthorizationUrl() {
    try {
      const result = await this.browserbaseMcpService.getAuthorizationUrl();
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Get authorization URL failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '获取授权 URL 失败',
      );
    }
  }

  @Post('auth/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '验证授权状态',
    description: '使用 connectionId 验证 OAuth 授权是否已完成',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        connectionId: {
          type: 'string',
          description: '从 getAuthorizationUrl 获取的 connectionId',
        },
      },
      required: ['connectionId'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '验证结果',
    type: ApiSuccessResponseDto,
  })
  async verifyAuthorization(@Body() body: { connectionId: string }) {
    try {
      const result = await this.browserbaseMcpService.verifyAuthorization(body.connectionId);
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Verify authorization failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '验证授权失败',
      );
    }
  }
}
