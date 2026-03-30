// src/chain-of-work/controllers/chain-of-work.controller.ts

import { Controller, Post, Get, Body, Param, Query, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ChainOfWorkService } from '../services/chain-of-work.service';
import { VersionService } from '../version/version.service';
import {
  GenerateDraftDto,
  SaveDraftDto,
  ExecuteDraftDto,
  RollbackVersionDto,
} from '../dto/chain-of-work.dto';
import {
  TripNARAWorkflowDraft,
  ExecutionResult,
  Version,
} from '../interfaces/chain-of-work.interface';
import { Public } from '../../auth/decorators/public.decorator';

@ApiTags('Chain-of-Work')
@Controller('chain-of-work')
@Public() // 临时开放测试，生产环境应移除并添加认证
export class ChainOfWorkController {
  private readonly logger = new Logger(ChainOfWorkController.name);

  constructor(
    private readonly chainOfWorkService: ChainOfWorkService,
    private readonly versionService: VersionService,
  ) {}

  @Post('draft/generate')
  @ApiOperation({ summary: '生成步骤草案', description: '根据用户旅行需求，生成符合 CLAUDE_SM 状态机流程的步骤草案' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: '步骤草案生成成功' })
  @ApiResponse({ status: 401, description: '未授权（需要登录）' })
  // @Public() // TODO: 临时开放测试，生产环境应移除
  async generateDraft(@Body() dto: GenerateDraftDto): Promise<{
    draft: TripNARAWorkflowDraft;
    generation_time_ms: number;
  }> {
    const startTime = Date.now();
    const draft = await this.chainOfWorkService.generateDraft(
      dto.trip_plan_request,
      dto.config,
    );
    const generationTime = Date.now() - startTime;
    
    return {
      draft,
      generation_time_ms: generationTime,
    };
  }

  @Post('draft/save')
  @ApiOperation({ summary: '保存步骤草案' })
  @ApiResponse({ status: 200, description: '步骤草案保存成功' })
  async saveDraft(@Body() dto: SaveDraftDto): Promise<{
    draft_id: string;
    version: string;
    saved_at: string;
  }> {
    const version = await this.versionService.saveVersion(
      dto.draft.workflow_id,
      dto.draft,
      {
        creator: 'user', // TODO: 从认证信息获取
        description: dto.is_auto_save ? '自动保存' : '手动保存',
      },
    );
    
    return {
      draft_id: dto.draft.draft_id,
      version: version.version,
      saved_at: version.created_at,
    };
  }

  @Get('draft/:draftId')
  @ApiOperation({ summary: '查询步骤草案' })
  @ApiResponse({ status: 200, description: '步骤草案查询成功' })
  async getDraft(@Param('draftId') _draftId: string): Promise<{
    draft: TripNARAWorkflowDraft;
  }> {
    // TODO: 从数据库查询
    throw new Error('Not implemented');
  }

  @Post('draft/:draftId/execute')
  @ApiOperation({ summary: '执行步骤草案' })
  @ApiResponse({ status: 200, description: '执行成功' })
  async executeDraft(
    @Param('draftId') _draftId: string,
    @Body() _dto: ExecuteDraftDto,
  ): Promise<{
    execution_id: string;
    result: ExecutionResult;
  }> {
    // TODO: 从数据库获取草案，生成执行计划，执行
    throw new Error('Not implemented');
  }

  @Get('version/:workflowId')
  @ApiOperation({ summary: '查询版本列表' })
  @ApiResponse({ status: 200, description: '版本列表查询成功' })
  async getVersionList(
    @Param('workflowId') workflowId: string,
    @Query('page') page?: number,
    @Query('page_size') pageSize?: number,
  ): Promise<{
    versions: Version[];
    total: number;
    page: number;
    page_size: number;
  }> {
    const versions = await this.versionService.getVersionList(workflowId);
    const pagedVersions = versions.slice(
      ((page || 1) - 1) * (pageSize || 20),
      (page || 1) * (pageSize || 20),
    );
    
    return {
      versions: pagedVersions,
      total: versions.length,
      page: page || 1,
      page_size: pageSize || 20,
    };
  }

  @Post('version/:workflowId/rollback')
  @ApiOperation({ summary: '回滚到指定版本' })
  @ApiResponse({ status: 200, description: '回滚成功' })
  async rollbackVersion(
    @Param('workflowId') workflowId: string,
    @Body() dto: RollbackVersionDto,
  ): Promise<{
    success: boolean;
    new_version: string;
    rolled_back_at: string;
  }> {
    if (!dto.confirm) {
      throw new Error('需要确认才能回滚');
    }
    
    // DTO 使用 version_id，但 Version 接口使用 id，这里直接传递即可（rollbackToVersion 接受 id）
    const version = await this.versionService.rollbackToVersion(workflowId, dto.version_id);
    
    return {
      success: true,
      new_version: version.version,
      rolled_back_at: new Date().toISOString(),
    };
  }
}