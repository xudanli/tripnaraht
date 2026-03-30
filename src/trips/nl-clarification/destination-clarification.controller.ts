// src/trips/nl-clarification/destination-clarification.controller.ts

import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBody, ApiResponse } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { DestinationClarificationConfigService } from './services/destination-clarification-config.service';
import { GatePrecheckService } from './services/gate-precheck.service';
import {
  CreateOrUpdateDestinationClarificationConfigDto,
  TestConfigDto,
} from './dto/create-or-update-config.dto';
import { successResponse } from '../../common/dto/standard-response.dto';

@Controller('admin/destination-clarification')
@ApiTags('Admin - 目的地澄清配置')
@Public() // 临时开放测试，生产环境应移除或添加权限控制
export class DestinationClarificationController {
  constructor(
    private readonly configService: DestinationClarificationConfigService,
    private readonly gatePrecheckService: GatePrecheckService,
  ) {}

  /**
   * 获取所有目的地的配置列表
   */
  @Get()
  @ApiOperation({ summary: '获取所有目的地澄清配置' })
  @ApiResponse({ status: 200, description: '成功获取配置列表' })
  async getAllConfigs() {
    const configs = await this.configService.getAllConfigs();
    return successResponse(configs);
  }

  /**
   * 获取特定目的地的配置
   */
  @Get(':destinationCode')
  @ApiOperation({ summary: '获取目的地澄清配置' })
  @ApiParam({ name: 'destinationCode', description: '目的地代码（ISO 3166-1 alpha-2）' })
  @ApiResponse({ status: 200, description: '成功获取配置' })
  async getConfig(@Param('destinationCode') destinationCode: string) {
    const config = await this.configService.getConfig(destinationCode);
    if (!config) {
      return successResponse(null);
    }
    return successResponse(config);
  }

  /**
   * 创建或更新配置
   */
  @Post(':destinationCode')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '创建或更新目的地澄清配置' })
  @ApiParam({ name: 'destinationCode', description: '目的地代码' })
  @ApiBody({ type: CreateOrUpdateDestinationClarificationConfigDto })
  @ApiResponse({ status: 200, description: '配置已保存' })
  async createOrUpdateConfig(
    @Param('destinationCode') destinationCode: string,
    @Body() dto: CreateOrUpdateDestinationClarificationConfigDto
  ) {
    await this.configService.createOrUpdateConfig(
      destinationCode,
      dto.config,
      'admin' // TODO: 从认证中获取用户ID
    );
    return successResponse({ message: '配置已保存' });
  }

  /**
   * 启用配置
   */
  @Patch(':destinationCode/enable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '启用目的地澄清配置' })
  @ApiParam({ name: 'destinationCode', description: '目的地代码' })
  @ApiResponse({ status: 200, description: '配置已启用' })
  async enableConfig(@Param('destinationCode') destinationCode: string) {
    await this.configService.setEnabled(destinationCode, true, 'admin');
    return successResponse({ message: '配置已启用' });
  }

  /**
   * 禁用配置
   */
  @Patch(':destinationCode/disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '禁用目的地澄清配置' })
  @ApiParam({ name: 'destinationCode', description: '目的地代码' })
  @ApiResponse({ status: 200, description: '配置已禁用' })
  async disableConfig(@Param('destinationCode') destinationCode: string) {
    await this.configService.setEnabled(destinationCode, false, 'admin');
    return successResponse({ message: '配置已禁用' });
  }

  /**
   * 测试配置（预览澄清流程）
   */
  @Post(':destinationCode/test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '测试目的地澄清配置' })
  @ApiParam({ name: 'destinationCode', description: '目的地代码' })
  @ApiBody({ type: TestConfigDto })
  @ApiResponse({ status: 200, description: '测试结果' })
  async testConfig(
    @Param('destinationCode') destinationCode: string,
    @Body() testScenario: TestConfigDto
  ) {
    const config = await this.configService.getConfig(destinationCode);
    if (!config) {
      return successResponse({
        error: '配置不存在或未启用',
        shouldUseGenericFlow: true,
      });
    }

    // 模拟澄清流程
    const roundInfo = await this.configService.getCurrentRoundQuestions(
      destinationCode,
      testScenario.currentParams,
      [] // 无历史对话
    );

    if (!roundInfo) {
      return successResponse({
        message: '所有轮次已完成，可以创建行程',
        canCreateTrip: true,
      });
    }

    // 检查是否需要 Gate 预检查
    let gateResult = null;
    if (roundInfo.shouldTriggerGate && config.gatePrechecks) {
      gateResult = await this.gatePrecheckService.executePrechecks(
        config.gatePrechecks,
        testScenario.currentParams,
        destinationCode
      );
    }

    return successResponse({
      currentRound: {
        roundId: roundInfo.round.roundId,
        name: roundInfo.round.name,
        description: roundInfo.round.description,
      },
      questions: roundInfo.questions,
      gateCheck: gateResult,
      needsClarification: true,
    });
  }
}
