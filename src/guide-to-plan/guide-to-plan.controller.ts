import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Optional,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../auth/decorators/current-user.decorator';
import { successResponse } from '../common/dto/standard-response.dto';
import { GuideToPlanSessionService } from './guide-to-plan-session.service';
import { GuideIngestService } from './services/guide-ingest.service';
import { GuideParseJobService } from './services/guide-parse-job.service';
import { GuideParseProgressStreamService } from './services/guide-parse-progress-stream.service';
import { GuideToPlanOrchestrator } from './services/guide-to-plan.orchestrator';
import {
  AcceptGuidePlanDto,
  BindGuidePlaceDto,
  ConfirmGuidePlanItemsDto,
  ConfirmGuideTravelContextDto,
  CreateGuideToPlanSessionDto,
  GenerateGuidePlanDto,
  ImportGuideTextDto,
  RematchGuidePlacesDto,
} from './dto/guide-to-plan.dto';
import { VisionService } from '../vision/vision.service';

interface MulterFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@ApiTags('guide-to-plan')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('guide-to-plan')
export class GuideToPlanController {
  constructor(
    private readonly sessionService: GuideToPlanSessionService,
    private readonly ingestService: GuideIngestService,
    private readonly parseJobService: GuideParseJobService,
    private readonly parseStreamService: GuideParseProgressStreamService,
    private readonly orchestrator: GuideToPlanOrchestrator,
    @Optional() private readonly visionService?: VisionService,
  ) {}

  @Post('sessions')
  @ApiOperation({ summary: '创建攻略导入会话' })
  async createSession(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: CreateGuideToPlanSessionDto,
  ) {
    return successResponse(await this.sessionService.create(user.userId, body));
  }

  @Get('sessions')
  @ApiOperation({ summary: '列出当前用户的攻略导入会话' })
  async listSessions(
    @CurrentUser() user: CurrentUserPayload,
    @Query('status') status?: string,
    @Query('includeAbandoned') includeAbandoned?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return successResponse(
      await this.sessionService.listForUser(user.userId, {
        status: status as import('./constants/guide-to-plan-status.constants').GuideToPlanSessionStatus | undefined,
        excludeAbandoned: includeAbandoned !== 'true',
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
      }),
    );
  }

  @Get('sessions/:sessionId')
  @ApiOperation({ summary: '获取攻略导入会话详情' })
  async getSession(
    @CurrentUser() user: CurrentUserPayload,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return successResponse(await this.sessionService.getById(user.userId, sessionId));
  }

  @Get('sessions/:sessionId/import/preview')
  @ApiOperation({ summary: '导入页预计提取（解析前轻量估计）' })
  async getImportPreview(
    @CurrentUser() user: CurrentUserPayload,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return successResponse(await this.ingestService.getImportPreview(user.userId, sessionId));
  }

  @Post('sessions/:sessionId/import')
  @ApiOperation({
    summary: '导入攻略（文字 / 链接 / 手动灵感）',
    description: '默认不自动解析；点击「开始解析攻略」调用 parse/async',
  })
  async importGuide(
    @CurrentUser() user: CurrentUserPayload,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() body: ImportGuideTextDto,
  ) {
    const guide = await this.ingestService.importGuide(user.userId, sessionId, body);
    if (body.parseImmediately === true) {
      await this.parseJobService.startAsyncParse(user.userId, sessionId);
    }
    return successResponse(guide);
  }

  @Post('sessions/:sessionId/import/file')
  @ApiOperation({ summary: '上传攻略文件（PDF / Word / Excel / CSV / TXT，最大 20MB）' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        title: { type: 'string' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async importFile(
    @CurrentUser() user: CurrentUserPayload,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @UploadedFile() file: MulterFile | undefined,
    @Body() body: { title?: string },
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('请上传攻略文件');
    }
    const guide = await this.ingestService.importFile(user.userId, sessionId, file, {
      title: body.title,
    });
    return successResponse(guide);
  }

  @Post('sessions/:sessionId/import/screenshot')
  @ApiOperation({ summary: '上传攻略截图（OCR 后导入）' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        title: { type: 'string' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async importScreenshot(
    @CurrentUser() user: CurrentUserPayload,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @UploadedFile() file: MulterFile | undefined,
    @Body() body: { title?: string },
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('请上传攻略截图');
    }

    let ocrText = '';
    if (this.visionService) {
      const ocr = await this.visionService.extractText(file.buffer);
      if (ocr.success && ocr.data?.fullText) {
        ocrText = ocr.data.fullText;
      }
    }

    if (!ocrText.trim()) {
      throw new BadRequestException(
        '未能从截图提取文字；请改用「粘贴文字」或配置 OCR 服务',
      );
    }

    const guide = await this.ingestService.importScreenshot(user.userId, sessionId, {
      title: body.title,
      ocrText,
    });
    return successResponse(guide);
  }

  @Delete('sessions/:sessionId/guides/:guideId')
  @ApiOperation({ summary: '删除已添加的攻略' })
  async deleteGuide(
    @CurrentUser() user: CurrentUserPayload,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('guideId', ParseUUIDPipe) guideId: string,
  ) {
    await this.ingestService.deleteGuide(user.userId, sessionId, guideId);
    return successResponse({ deleted: true, guideId });
  }

  @Post('sessions/:sessionId/parse/async')
  @ApiOperation({
    summary: '异步开始解析攻略（推荐）',
    description:
      '立即返回 jobId；前端可 SSE 订阅 GET parse/stream，或轮询 GET parse/status',
  })
  async parseAsync(
    @CurrentUser() user: CurrentUserPayload,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return successResponse(
      await this.parseJobService.startAsyncParse(user.userId, sessionId),
    );
  }

  @Get('sessions/:sessionId/parse/status')
  @ApiOperation({ summary: '查询异步解析进度' })
  async parseStatus(
    @CurrentUser() user: CurrentUserPayload,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return successResponse(await this.parseJobService.getParseStatus(user.userId, sessionId));
  }

  @Get('sessions/:sessionId/parse/stream')
  @ApiOperation({
    summary: '解析进度 SSE 推送',
    description:
      'text/event-stream；event: message 为进度 JSON，终态后 event: end。需 Authorization Bearer（或同源 Cookie）。',
  })
  async parseStream(
    @CurrentUser() user: CurrentUserPayload,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.parseStreamService.stream(user.userId, sessionId, req, res);
  }

  @Post('sessions/:sessionId/parse')
  @ApiOperation({ summary: '同步解析（阻塞直到完成，适合脚本/调试）' })
  async parseSessionSync(
    @CurrentUser() user: CurrentUserPayload,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return successResponse(await this.orchestrator.buildUnderstanding(user.userId, sessionId));
  }

  @Get('sessions/:sessionId/understanding')
  @ApiOperation({ summary: '获取攻略理解结果（摘要页数据）' })
  async getUnderstanding(
    @CurrentUser() user: CurrentUserPayload,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return successResponse(
      await this.orchestrator.getUnderstandingView(user.userId, sessionId),
    );
  }

  @Post('sessions/:sessionId/places/rematch')
  @ApiOperation({
    summary: '批量重新匹配未绑定的 POI',
    description:
      '对 matchStatus=unmatched 的地点按名称重新匹配；countryCode 优先取 body，其次会话字段',
  })
  async rematchPlaces(
    @CurrentUser() user: CurrentUserPayload,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() body: RematchGuidePlacesDto,
  ) {
    return successResponse(
      await this.orchestrator.rematchSessionPlaces(user.userId, sessionId, body),
    );
  }

  @Patch('sessions/:sessionId/places/:candidateId')
  @ApiOperation({
    summary: '手动绑定或拒绝 POI 匹配',
    description:
      '传 placeId 绑定 POI（可配合 GET /places/autocomplete 搜索）；传 matchStatus=rejected 标记为无需匹配',
  })
  async bindPlace(
    @CurrentUser() user: CurrentUserPayload,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('candidateId', ParseUUIDPipe) candidateId: string,
    @Body() body: BindGuidePlaceDto,
  ) {
    return successResponse(
      await this.orchestrator.bindSessionPlace(user.userId, sessionId, candidateId, body),
    );
  }

  @Patch('sessions/:sessionId/travel-context')
  @ApiOperation({
    summary: '确认本次出行条件',
    description: '日期、成员、交通方式、最想保留的体验',
  })
  async confirmTravelContext(
    @CurrentUser() user: CurrentUserPayload,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() body: ConfirmGuideTravelContextDto,
  ) {
    const updated = await this.orchestrator.confirmTravelContext(
      user.userId,
      sessionId,
      body,
    );
    return successResponse({
      sessionId: updated.id,
      travelContext: updated.travelContext,
      countryCode: updated.countryCode,
      destination: updated.destination,
    });
  }

  @Post('sessions/:sessionId/generate')
  @ApiOperation({
    summary: '生成行程草案（非正式可执行计划）',
    description: '基于灵感候选与出行条件生成草案，含原攻略对比与调整说明',
  })
  async generatePlan(
    @CurrentUser() user: CurrentUserPayload,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() body: GenerateGuidePlanDto,
  ) {
    return successResponse(
      await this.orchestrator.generatePlanCandidates(user.userId, sessionId, body),
    );
  }

  @Get('sessions/:sessionId/plan-candidates')
  @ApiOperation({ summary: '列出会话内的行程草案' })
  async listPlanCandidates(
    @CurrentUser() user: CurrentUserPayload,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return successResponse(
      await this.orchestrator.listPlanCandidates(user.userId, sessionId),
    );
  }

  @Get('sessions/:sessionId/plan-candidates/:planCandidateId')
  @ApiOperation({ summary: '获取单个行程草案详情（草案页 BFF）' })
  async getPlanCandidate(
    @CurrentUser() user: CurrentUserPayload,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('planCandidateId', ParseUUIDPipe) planCandidateId: string,
  ) {
    return successResponse(
      await this.orchestrator.getPlanCandidateById(user.userId, sessionId, planCandidateId),
    );
  }

  @Post('sessions/:sessionId/abandon')
  @ApiOperation({ summary: '放弃攻略导入会话' })
  async abandonSession(
    @CurrentUser() user: CurrentUserPayload,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return successResponse(await this.orchestrator.abandonSession(user.userId, sessionId));
  }

  @Get('sessions/:sessionId/plan-candidates/:planCandidateId/review-items')
  @ApiOperation({ summary: '获取草案逐项确认列表' })
  async getPlanReviewItems(
    @CurrentUser() user: CurrentUserPayload,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('planCandidateId', ParseUUIDPipe) planCandidateId: string,
  ) {
    return successResponse(
      await this.orchestrator.getPlanReviewItems(user.userId, sessionId, planCandidateId),
    );
  }

  @Post('sessions/:sessionId/plan-candidates/:planCandidateId/confirm')
  @ApiOperation({ summary: '逐项确认后创建正式行程' })
  async confirmPlanItems(
    @CurrentUser() user: CurrentUserPayload,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('planCandidateId', ParseUUIDPipe) planCandidateId: string,
    @Body() body: ConfirmGuidePlanItemsDto,
  ) {
    if (body.planCandidateId !== planCandidateId) {
      throw new BadRequestException('planCandidateId 与路径不一致');
    }
    return successResponse(
      await this.orchestrator.confirmPlanItems(
        user.userId,
        sessionId,
        planCandidateId,
        body.acceptedItemKeys,
      ),
    );
  }

  @Post('sessions/:sessionId/accept')
  @ApiOperation({ summary: '接受某一行程草案' })
  async acceptPlan(
    @CurrentUser() user: CurrentUserPayload,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() body: AcceptGuidePlanDto,
  ) {
    return successResponse(
      await this.orchestrator.acceptPlanCandidate(
        user.userId,
        sessionId,
        body.planCandidateId,
        body.acceptanceMode,
      ),
    );
  }
}
