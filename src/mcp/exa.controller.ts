/**
 * Exa MCP Controller
 * 
 * 提供 Exa 搜索服务的 API 端点
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Query,
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
import { ExaService } from './exa.service';
import { ExaMonitoringService } from './exa-monitoring.service';
import {
  ExaWebSearchDto,
  ExaCodeContextDto,
  ExaCompanyResearchDto,
  ExaCrawlUrlDto,
  ExaDeepResearcherStartDto,
  ExaDeepResearcherCheckDto,
} from './dto/exa-search.dto';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../common/dto/api-response.dto';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('exa')
@Controller('exa')
@Public() // 临时开放，生产环境可能需要认证
export class ExaController {
  private readonly logger = new Logger(ExaController.name);

  constructor(
    private readonly exaService: ExaService,
    private readonly monitoring: ExaMonitoringService,
  ) {}

  @Post('search/web')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Web 搜索',
    description: '使用 Exa 进行 Web 搜索',
  })
  @ApiBody({ type: ExaWebSearchDto })
  @ApiResponse({
    status: 200,
    description: '搜索成功',
    type: ApiSuccessResponseDto,
  })
  async webSearch(@Body() dto: ExaWebSearchDto) {
    try {
      this.logger.log(`Web search: ${dto.query}`);
      const result = await this.exaService.webSearch(dto.query, {
        numResults: dto.numResults,
        useAutoprompt: dto.useAutoprompt,
        category: dto.category,
        startPublishedDate: dto.startPublishedDate,
        endPublishedDate: dto.endPublishedDate,
      });
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Web search failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || 'Web 搜索失败',
      );
    }
  }

  @Post('search/code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '代码上下文搜索',
    description: '搜索代码示例、文档和编程解决方案',
  })
  @ApiBody({ type: ExaCodeContextDto })
  @ApiResponse({
    status: 200,
    description: '搜索成功',
    type: ApiSuccessResponseDto,
  })
  async getCodeContext(@Body() dto: ExaCodeContextDto) {
    try {
      this.logger.log(`Code context search: ${dto.query}`);
      const result = await this.exaService.getCodeContext(dto.query, {
        numResults: dto.numResults,
        languages: dto.languages,
      });
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Code context search failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '代码上下文搜索失败',
      );
    }
  }

  @Post('research/company')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '公司研究',
    description: '研究公司信息、新闻和洞察',
  })
  @ApiBody({ type: ExaCompanyResearchDto })
  @ApiResponse({
    status: 200,
    description: '研究成功',
    type: ApiSuccessResponseDto,
  })
  async companyResearch(@Body() dto: ExaCompanyResearchDto) {
    try {
      this.logger.log(`Company research: ${dto.companyName}`);
      const result = await this.exaService.companyResearch(dto.companyName, {
        numResults: dto.numResults,
      });
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Company research failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '公司研究失败',
      );
    }
  }

  @Post('crawl')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '网页爬取',
    description: '获取指定 URL 的完整内容',
  })
  @ApiBody({ type: ExaCrawlUrlDto })
  @ApiResponse({
    status: 200,
    description: '爬取成功',
    type: ApiSuccessResponseDto,
  })
  async crawlUrl(@Body() dto: ExaCrawlUrlDto) {
    try {
      this.logger.log(`Crawling URL: ${dto.url}`);
      const result = await this.exaService.crawlUrl(dto.url, {
        text: dto.text,
        html: dto.html,
        markdown: dto.markdown,
      });
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Crawl URL failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '网页爬取失败',
      );
    }
  }

  @Post('deep-research/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '开始深度研究',
    description: '启动 AI 研究代理，搜索、阅读并生成详细报告',
  })
  @ApiBody({ type: ExaDeepResearcherStartDto })
  @ApiResponse({
    status: 200,
    description: '研究任务已启动',
    type: ApiSuccessResponseDto,
  })
  async deepResearcherStart(@Body() dto: ExaDeepResearcherStartDto) {
    try {
      this.logger.log(`Starting deep research: ${dto.query}`);
      const result = await this.exaService.deepResearcherStart(dto.query, {
        reportType: dto.reportType,
        numResults: dto.numResults,
      });
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Deep research start failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '启动深度研究失败',
      );
    }
  }

  @Post('deep-research/check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '检查深度研究状态',
    description: '检查深度研究任务的状态并获取结果',
  })
  @ApiBody({ type: ExaDeepResearcherCheckDto })
  @ApiResponse({
    status: 200,
    description: '获取成功',
    type: ApiSuccessResponseDto,
  })
  async deepResearcherCheck(@Body() dto: ExaDeepResearcherCheckDto) {
    try {
      this.logger.log(`Checking deep research: ${dto.taskId}`);
      const result = await this.exaService.deepResearcherCheck(dto.taskId);
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Deep research check failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '检查深度研究状态失败',
      );
    }
  }

  @Get('tools')
  @ApiOperation({
    summary: '列出所有可用工具',
    description: '获取 Exa MCP 服务器提供的所有工具列表',
  })
  @ApiResponse({
    status: 200,
    description: '获取成功',
    type: ApiSuccessResponseDto,
  })
  async listTools() {
    try {
      const result = await this.exaService.listTools();
      return successResponse({ tools: result });
    } catch (error: any) {
      this.logger.error('List tools failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '获取工具列表失败',
      );
    }
  }

  @Get('status')
  @ApiOperation({
    summary: '检查连接状态',
    description: '检查 Exa MCP 连接状态和 API Key 配置',
  })
  @ApiResponse({
    status: 200,
    description: '获取成功',
    type: ApiSuccessResponseDto,
  })
  async checkStatus() {
    try {
      const status = await this.exaService.checkConnectionStatus();
      return successResponse(status);
    } catch (error: any) {
      this.logger.error('Check status failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '检查状态失败',
      );
    }
  }

  @Get('monitoring/stats')
  @ApiOperation({
    summary: '获取 Exa API 使用统计',
    description: '获取最近 N 天的 Exa API 调用统计、性能指标和成本估算',
  })
  @ApiResponse({
    status: 200,
    description: '获取成功',
    type: ApiSuccessResponseDto,
  })
  async getStats(@Query('days') days?: string) {
    try {
      const daysNum = days ? parseInt(days, 10) : 7;
      const stats = await this.monitoring.getRecentStats(daysNum);
      const performance = await this.monitoring.getPerformanceMetrics(daysNum);
      const totalCost = await this.monitoring.getTotalCostEstimate(daysNum);

      return successResponse({
        dailyStats: stats,
        performance,
        totalCostEstimate: totalCost,
      });
    } catch (error: any) {
      this.logger.error('Get stats failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '获取统计失败',
      );
    }
  }

  @Get('monitoring/cost-check')
  @ApiOperation({
    summary: '检查成本限制',
    description: '检查今日 Exa API 调用成本是否超过限制',
  })
  @ApiResponse({
    status: 200,
    description: '检查成功',
    type: ApiSuccessResponseDto,
  })
  async checkCostLimit(@Query('dailyLimit') dailyLimit?: string) {
    try {
      const limit = dailyLimit ? parseFloat(dailyLimit) : 10;
      const checkResult = await this.monitoring.checkCostLimit(limit);

      return successResponse(checkResult);
    } catch (error: any) {
      this.logger.error('Check cost limit failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '检查成本限制失败',
      );
    }
  }
}
