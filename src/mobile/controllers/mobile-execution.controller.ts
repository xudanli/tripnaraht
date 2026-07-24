import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Headers,
  Req,
  UploadedFile,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import { randomUUID } from 'crypto';
import {
  ErrorCode,
} from '../../common/dto/standard-response.dto';
import {
  buildMobileEnvelopeMeta,
  mobileErrorResponse,
  mobileSuccessResponse,
} from '../utils/mobile-envelope.util';
import { TripContextChangeNotifierService } from '../ws/trip-context-change-notifier.service';
import { MobileExecutionService } from '../services/mobile-execution.service';
import { ConstraintSolverAccessService } from '../../trips/trip-constraint-solver/services/constraint-solver-access.service';
import { TravelStatusService } from '../../trips/travel-status/services/travel-status.service';
import { InTripCommsPeersService } from '../../trips/in-trip-execution/services/in-trip-comms-peers.service';
import { MobileExecutionWriteService } from '../services/mobile-execution-write.service';
import { MobileEmergencyPackService } from '../services/mobile-emergency-pack.service';
import { MobilePushNotificationService } from '../services/mobile-push-notification.service';
import { ConsumerDecisionQueueService } from '../../trips/travel-status/services/consumer-decision-queue.service';
import { TepLocalRepairApplyService } from '../../trips/tep/services/tep-local-repair-apply.service';

interface MulterFile {
  buffer: Buffer;
  mimetype?: string;
  originalname?: string;
}

@ApiTags('mobile-execution')
@Public()
@Controller('mobile/trips/:tripId')
export class MobileExecutionController {
  constructor(
    private readonly mobile: MobileExecutionService,
    private readonly mobileWrite: MobileExecutionWriteService,
    private readonly emergencyPack: MobileEmergencyPackService,
    private readonly access: ConstraintSolverAccessService,
    private readonly travelStatus: TravelStatusService,
    private readonly commsPeers: InTripCommsPeersService,
    private readonly decisionQueue: ConsumerDecisionQueueService,
    private readonly contextNotifier: TripContextChangeNotifierService,
    private readonly mobilePush: MobilePushNotificationService,
    private readonly tepRepairApply: TepLocalRepairApplyService,
  ) {}

  @Get('context-snapshot')
  @ApiOperation({ summary: 'iOS Trip Context Snapshot（Mobile 投影）' })
  async getContextSnapshot(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(tripId, user, () =>
      this.mobile.getContextSnapshot(tripId, this.access.resolveUserId(user)),
    );
  }

  @Get('execution-overview')
  @ApiOperation({ summary: 'iOS 执行总览 Tab 聚合读模型' })
  @ApiQuery({ name: 'dayIndex', required: false, type: Number })
  @ApiQuery({
    name: 'lite',
    required: false,
    type: Boolean,
    description: '1/true 时跳过 execution-advisory，首屏更快；响应 data.meta.partial=true',
  })
  async getExecutionOverview(
    @Param('tripId') tripId: string,
    @Query('dayIndex') dayIndex?: string,
    @Query('lite') lite?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    const parsedDay = dayIndex != null ? Number(dayIndex) : undefined;
    const useLite = lite === '1' || lite === 'true';
    return this.run(tripId, user, () =>
      this.mobile.getExecutionOverview(tripId, this.access.resolveUserId(user), {
        dayIndex: Number.isFinite(parsedDay) ? parsedDay : undefined,
        lite: useLite,
      }),
    );
  }

  @Get('today-itinerary')
  @ApiOperation({ summary: 'iOS 今日行程 Tab 聚合读模型' })
  @ApiQuery({ name: 'dayIndex', required: false, type: Number })
  async getTodayItinerary(
    @Param('tripId') tripId: string,
    @Query('dayIndex') dayIndex?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    const parsedDay = dayIndex != null ? Number(dayIndex) : undefined;
    return this.run(tripId, user, () =>
      this.mobile.getTodayItinerary(tripId, this.access.resolveUserId(user), {
        dayIndex: Number.isFinite(parsedDay) ? parsedDay : undefined,
      }),
    );
  }

  @Get('itinerary-calendar')
  @ApiOperation({
    summary: 'iOS 行程日历聚合（执行期按天总览；切天用 today-itinerary?dayIndex）',
  })
  async getItineraryCalendar(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(tripId, user, () =>
      this.mobile.getItineraryCalendar(tripId, this.access.resolveUserId(user)),
    );
  }

  @Get('activities/:activityId/execution-detail')
  @ApiOperation({ summary: 'iOS 活动执行详情（确认码/商家/成员/导航点）' })
  @ApiParam({ name: 'activityId', description: 'ItineraryItem UUID' })
  async getActivityExecutionDetail(
    @Param('tripId') tripId: string,
    @Param('activityId') activityId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(tripId, user, () =>
      this.mobile.getActivityExecutionDetail(
        tripId,
        this.access.resolveUserId(user),
        activityId,
      ),
    );
  }

  @Get('activities/:activityId')
  @ApiOperation({ summary: 'iOS 活动详情（等价 execution-detail）' })
  @ApiParam({ name: 'activityId', description: 'ItineraryItem UUID' })
  async getActivityDetail(
    @Param('tripId') tripId: string,
    @Param('activityId') activityId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(tripId, user, () =>
      this.mobile.getActivityExecutionDetail(
        tripId,
        this.access.resolveUserId(user),
        activityId,
      ),
    );
  }

  @Get('live-route')
  @ApiOperation({ summary: 'iOS 路线地图 Tab 聚合读模型' })
  async getLiveRoute(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(tripId, user, () =>
      this.mobile.getLiveRoute(tripId, this.access.resolveUserId(user)),
    );
  }

  @Get('execution/execution-alerts')
  @ApiOperation({ summary: 'iOS 执行预警（第一层）— STOP / REPLAN_REQUIRED / AT_RISK' })
  async getExecutionAlerts(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(tripId, user, () =>
      this.mobile.getExecutionAlerts(tripId, this.access.resolveUserId(user)),
    );
  }

  @Get('execution/risk-alerts')
  @ApiOperation({ summary: '【已废弃】请改用 execution/execution-alerts' })
  async getRiskAlerts(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(tripId, user, () =>
      this.mobile.getExecutionAlerts(tripId, this.access.resolveUserId(user)),
    );
  }

  @Get('execution/interventions/:interventionId/causal-trace')
  @ApiOperation({ summary: 'iOS 单个 ExecutionIntervention 因果链完整回放' })
  async getInterventionCausalTrace(
    @Param('tripId') tripId: string,
    @Param('interventionId') interventionId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(tripId, user, () =>
      this.mobile.getInterventionCausalTrace(
        tripId,
        this.access.resolveUserId(user),
        interventionId,
      ),
    );
  }

  @Get('execution/adjustment-queue')
  @ApiOperation({ summary: 'iOS 待调整事项（ExecutionAdjustmentQueue / ExecutionIntervention）' })
  async getExecutionAdjustmentQueue(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(tripId, user, () =>
      this.mobile.getExecutionAdjustmentQueue(tripId, this.access.resolveUserId(user)),
    );
  }

  @Get('execution/pending-adjustments')
  @ApiOperation({ summary: '【已废弃】请改用 execution/adjustment-queue' })
  async getPendingAdjustments(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(tripId, user, () =>
      this.mobile.getExecutionAdjustmentQueue(tripId, this.access.resolveUserId(user)),
    );
  }

  @Post('execution/tep-repairs/:interventionId/accept')
  @ApiOperation({
    summary: 'iOS 接受 TEP Local Repair（intervention-tep-* → PlanVersion 写回）',
    description:
      '用于 adjustment-queue 无 decisionProblemId 的 TEP 修复卡；等价于 POST /trips/:tripId/executability/repairs/:optionId/apply',
  })
  async acceptTepRepair(
    @Param('tripId') tripId: string,
    @Param('interventionId') interventionId: string,
    @Body() body: { optionId?: string; comment?: string; basePlanVersionId?: string },
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(tripId, user, async () => {
      const userId = this.access.resolveUserId(user);
      const data = await this.tepRepairApply.applyRecoveryOption({
        tripId,
        interventionOrOptionId: body.optionId ?? interventionId,
        userId,
        comment: body.comment,
        basePlanVersionId: body.basePlanVersionId,
      });
      const contextVersion = Date.now();
      this.contextNotifier.notifyTripContextChanged({
        tripId,
        contextVersion,
        changedSections: ['execution', 'decisions'],
      });
      const memberIds = await this.mobilePush.listTripMemberIds(tripId, userId);
      this.mobilePush.notifyTripEvent({
        tripId,
        contextVersion,
        recipientUserIds: memberIds,
        eventType: 'decision',
        title: '行程修复已应用',
        body: body.comment?.trim() || '已应用驾驶负荷修复方案',
        changedSections: ['execution', 'decisions'],
        excludeUserId: userId,
      });
      return {
        contextVersion,
        decisionStatus: 'accepted',
        previewSummary: body.comment ?? '已应用修复方案',
        result: data,
      };
    });
  }

  @Get('execution/team-status')
  @ApiOperation({ summary: 'iOS 团队状态详情' })
  async getTeamStatus(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(tripId, user, () =>
      this.mobile.getTeamStatus(tripId, this.access.resolveUserId(user)),
    );
  }

  @Get('execution/today-progress')
  @ApiOperation({ summary: 'iOS 今日进度详情' })
  @ApiQuery({ name: 'dayIndex', required: false, type: Number })
  async getTodayProgress(
    @Param('tripId') tripId: string,
    @Query('dayIndex') dayIndex?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    const parsedDay = dayIndex != null ? Number(dayIndex) : undefined;
    return this.run(tripId, user, () =>
      this.mobileWrite.getTodayProgress(tripId, this.access.resolveUserId(user), Number.isFinite(parsedDay) ? parsedDay : undefined),
    );
  }

  @Get('execution/road-conditions')
  @ApiOperation({ summary: 'iOS 路况详情' })
  async getRoadConditions(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(tripId, user, () =>
      this.mobile.getRoadConditions(tripId, this.access.resolveUserId(user)),
    );
  }

  @Get('execution/meeting-points/:pointId')
  @ApiOperation({ summary: 'iOS 集合点详情（pointId 可为 itinerary item id 或 current/next）' })
  @ApiParam({ name: 'pointId', description: 'ItineraryItem ID 或 current / next' })
  async getMeetingPoint(
    @Param('tripId') tripId: string,
    @Param('pointId') pointId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(tripId, user, () =>
      this.mobile.getMeetingPoint(tripId, this.access.resolveUserId(user), pointId),
    );
  }

  @Post('execution-events')
  @ApiOperation({ summary: 'iOS 记录执行事件（append-only）' })
  async recordExecutionEvent(
    @Param('tripId') tripId: string,
    @Body()
    body: {
      type: string;
      title: string;
      severity?: string;
      activityId?: string;
      location?: { lat: number; lng: number };
      description?: string;
      attachments?: unknown[];
    },
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('if-match') ifMatch?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.runWrite(tripId, user, (userId) =>
      this.mobileWrite.recordExecutionEvent(tripId, userId, body, {
        idempotencyKey,
        ifMatch: parseIfMatch(ifMatch),
      }),
    );
  }

  @Post('notifications')
  @ApiOperation({ summary: 'iOS 发送团队通知' })
  async sendNotification(
    @Param('tripId') tripId: string,
    @Body()
    body: {
      recipientIds: string[];
      type: string;
      title: string;
      body: string;
      statusType?: string;
      attachments?: {
        includeLocation?: boolean;
        includeMeetingPoint?: boolean;
        includePlanLink?: boolean;
      };
      location?: { lat: number; lng: number };
    },
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('if-match') ifMatch?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.runWrite(tripId, user, (userId) =>
      this.mobileWrite.sendTeamNotification(tripId, userId, body, {
        idempotencyKey,
        ifMatch: parseIfMatch(ifMatch),
      }),
    );
  }

  @Patch('activities/:activityId')
  @ApiOperation({ summary: 'iOS 单项调整行程（写 Active Plan）' })
  @ApiParam({ name: 'activityId', description: 'ItineraryItem UUID' })
  async patchActivity(
    @Param('tripId') tripId: string,
    @Param('activityId') activityId: string,
    @Body()
    body: {
      startTime?: string;
      endTime?: string;
      plannedDepartAt?: string;
      title?: string;
      notes?: string;
      cascadeMode?: 'auto' | 'none';
    },
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('if-match') ifMatch?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.runWrite(tripId, user, (userId) =>
      this.mobileWrite.patchActivity(tripId, userId, activityId, body, {
        idempotencyKey,
        ifMatch: parseIfMatch(ifMatch),
      }),
    );
  }

  @Post('activities/:activityId/complete')
  @ApiOperation({ summary: 'iOS 标记活动完成' })
  async completeActivity(
    @Param('tripId') tripId: string,
    @Param('activityId') activityId: string,
    @Body()
    body: {
      completedAt?: string;
      actualDurationMinutes?: number;
      notes?: string;
    },
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('if-match') ifMatch?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.runWrite(tripId, user, (userId) =>
      this.mobileWrite.completeActivity(tripId, userId, activityId, body, {
        idempotencyKey,
        ifMatch: parseIfMatch(ifMatch),
      }),
    );
  }

  @Get('emergency-pack')
  @ApiOperation({ summary: 'iOS 行程应急资料包（只读）' })
  async getEmergencyPack(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(tripId, user, () =>
      this.emergencyPack.getEmergencyPack(tripId, this.access.resolveUserId(user)),
    );
  }

  @Get('emergency/local-numbers')
  @ApiOperation({ summary: 'iOS 目的地当地紧急号码' })
  async getLocalEmergencyNumbers(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(tripId, user, () =>
      this.emergencyPack.getLocalNumbers(tripId, this.access.resolveUserId(user)),
    );
  }

  @Get('emergency/sos/active')
  @ApiOperation({ summary: 'iOS 活跃 SOS 状态' })
  async getActiveSos(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(tripId, user, () =>
      this.mobileWrite.getActiveSos(tripId, this.access.resolveUserId(user)),
    );
  }

  @Post('emergency/sos/:sosId/acknowledge')
  @ApiOperation({ summary: 'iOS 领队确认收到 SOS' })
  async acknowledgeSos(
    @Param('tripId') tripId: string,
    @Param('sosId') sosId: string,
    @Headers('if-match') ifMatch?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.runWrite(tripId, user, (userId) =>
      this.mobileWrite.acknowledgeSos(tripId, userId, sosId),
    );
  }

  @Post('emergency/sos/:sosId/resolve')
  @ApiOperation({ summary: 'iOS 解除/取消 SOS' })
  async resolveSos(
    @Param('tripId') tripId: string,
    @Param('sosId') sosId: string,
    @Body() body: { reason: 'false_alarm' | 'resolved' | 'cancelled'; comment?: string },
    @Headers('if-match') ifMatch?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.runWrite(tripId, user, (userId) =>
      this.mobileWrite.resolveSos(tripId, userId, sosId, body, {
        ifMatch: parseIfMatch(ifMatch),
      }),
    );
  }

  @Post('emergency/location-share')
  @ApiOperation({ summary: 'iOS 开启 SOS 紧急位置共享' })
  async startEmergencyLocationShare(
    @Param('tripId') tripId: string,
    @Body() body: { sosId?: string },
    @Headers('if-match') ifMatch?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.runWrite(tripId, user, (userId) =>
      this.mobileWrite.startEmergencyLocationShare(tripId, userId, body, {
        ifMatch: parseIfMatch(ifMatch),
      }),
    );
  }

  @Delete('emergency/location-share')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'iOS 关闭 SOS 紧急位置共享' })
  async stopEmergencyLocationShare(
    @Param('tripId') tripId: string,
    @Headers('if-match') ifMatch?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.runWrite(tripId, user, (userId) =>
      this.mobileWrite.stopEmergencyLocationShare(tripId, userId, {
        ifMatch: parseIfMatch(ifMatch),
      }),
    );
  }

  @Post('emergency/sos')
  @ApiOperation({ summary: 'iOS 紧急 SOS' })
  async sendSos(
    @Param('tripId') tripId: string,
    @Body()
    body: {
      type?: string;
      location?: { lat: number; lng: number } | null;
      message?: string;
      shareWithTeam?: boolean;
    },
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('if-match') ifMatch?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.runWrite(tripId, user, (userId) =>
      this.mobileWrite.sendSos(tripId, userId, body, {
        idempotencyKey,
        ifMatch: parseIfMatch(ifMatch),
      }),
    );
  }

  @Post('decisions/:decisionId/accept')
  @ApiOperation({ summary: 'iOS 接受决策/调整方案' })
  async acceptDecision(
    @Param('tripId') tripId: string,
    @Param('decisionId') decisionId: string,
    @Body() body: { optionId?: string; comment?: string; actionId?: string },
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(tripId, user, async () => {
      const userId = this.access.resolveUserId(user);
      const actionId = body.actionId ?? body.optionId;
      const data = await this.travelStatus.acceptRecommended(tripId, decisionId, userId, actionId);
      const contextVersion = Date.now();
      this.contextNotifier.notifyTripContextChanged({
        tripId,
        contextVersion,
        changedSections: ['decisions', 'execution'],
      });
      const memberIds = await this.mobilePush.listTripMemberIds(tripId, userId);
      this.mobilePush.notifyTripEvent({
        tripId,
        contextVersion,
        recipientUserIds: memberIds,
        eventType: 'decision',
        title: '行程决策已更新',
        body: body.comment?.trim() || '有成员接受了调整方案',
        changedSections: ['decisions', 'execution'],
        decisionId,
        excludeUserId: userId,
      });
      return {
        contextVersion,
        decisionStatus: 'accepted',
        previewSummary: body.comment ?? '已提交方案',
        result: data,
      };
    });
  }

  @Post('decisions/:decisionId/defer')
  @ApiOperation({ summary: 'iOS 延后决策（稍后再说）' })
  async deferDecision(
    @Param('tripId') tripId: string,
    @Param('decisionId') decisionId: string,
    @Body() body: { comment?: string; actionId?: string },
    @Headers('if-match') ifMatch?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(tripId, user, async () => {
      const userId = this.access.resolveUserId(user);
      const item = await this.decisionQueue.getItem(tripId, decisionId);
      if (!item) {
        throw new NotFoundException(`决策 ${decisionId} 不存在`);
      }
      const actionId = body.actionId ?? item.actions.defer.actionId;
      if (!actionId) {
        throw new BadRequestException('该决策不支持延后');
      }
      if (ifMatch != null) {
        await this.mobileWrite.assertContextVersion(
          tripId,
          userId,
          parseIfMatch(ifMatch),
        );
      }
      const data = await this.travelStatus.acceptRecommended(tripId, decisionId, userId, actionId);
      const contextVersion = Date.now();
      this.contextNotifier.notifyTripContextChanged({
        tripId,
        contextVersion,
        changedSections: ['decisions', 'execution'],
      });
      const memberIds = await this.mobilePush.listTripMemberIds(tripId, userId);
      this.mobilePush.notifyTripEvent({
        tripId,
        contextVersion,
        recipientUserIds: memberIds,
        eventType: 'decision',
        title: '行程决策已延后',
        body: body.comment?.trim() || '有成员延后了待办决策',
        changedSections: ['decisions', 'execution'],
        decisionId,
        excludeUserId: userId,
      });
      return {
        contextVersion,
        decisionStatus: 'deferred',
        previewSummary: body.comment ?? '已延后处理',
        result: data,
      };
    });
  }

  @Post('navigation/sessions')
  @ApiOperation({ summary: 'iOS 导航会话同步' })
  async createNavigationSession(
    @Param('tripId') tripId: string,
    @Body()
    body: {
      activityId: string;
      destinationId: string;
      shareWithTeam?: boolean;
    },
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('if-match') ifMatch?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.runWrite(tripId, user, (userId) =>
      this.mobileWrite.createNavigationSession(tripId, userId, body, {
        idempotencyKey,
        ifMatch: parseIfMatch(ifMatch),
      }),
    );
  }

  @Get('intercom/messages')
  @ApiOperation({ summary: 'iOS 对讲消息历史' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '默认 50，最大 100' })
  @ApiQuery({ name: 'before', required: false, type: String, description: '游标（messageId 或 ISO8601）' })
  @ApiQuery({ name: 'after', required: false, type: String, description: '增量拉取（轮询 / WS 断线补偿）' })
  async getIntercomMessages(
    @Param('tripId') tripId: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
    @Query('after') after?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    const parsedLimit = limit != null ? Number(limit) : undefined;
    return this.run(tripId, user, () =>
      this.mobile.getIntercomMessages(tripId, this.access.resolveUserId(user), {
        limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
        before,
        after,
      }),
    );
  }

  @Get('intercom/messages/:messageId/audio')
  @ApiOperation({ summary: 'iOS 对讲语音播放 URL（短期签名续期）' })
  @ApiParam({ name: 'messageId', description: '对讲消息 ID' })
  async getIntercomVoiceAudio(
    @Param('tripId') tripId: string,
    @Param('messageId') messageId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(tripId, user, () =>
      this.mobile.getIntercomVoiceAudioUrl(
        tripId,
        this.access.resolveUserId(user),
        messageId,
      ),
    );
  }

  @Get('intercom/summary')
  @ApiOperation({ summary: 'iOS 对讲 AI 状态摘要' })
  async getIntercomSummary(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(tripId, user, () =>
      this.mobile.getIntercomSummary(tripId, this.access.resolveUserId(user)),
    );
  }

  @Post('intercom/messages')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: 2 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({ summary: 'iOS 对讲消息（语音 multipart / 文字 JSON）' })
  @ApiBody({
    schema: {
      oneOf: [
        {
          type: 'object',
          required: ['audio'],
          properties: {
            audio: { type: 'string', format: 'binary' },
            durationSeconds: { type: 'number' },
            clientId: { type: 'string', format: 'uuid' },
            language: { type: 'string', example: 'zh-CN' },
            format: { type: 'string', example: 'audio/m4a' },
          },
        },
        {
          type: 'object',
          required: ['kind', 'body'],
          properties: {
            kind: { type: 'string', enum: ['text'] },
            body: { type: 'string' },
            clientId: { type: 'string', format: 'uuid' },
          },
        },
      ],
    },
  })
  async sendIntercomMessage(
    @Param('tripId') tripId: string,
    @Req() req: { headers: Record<string, string | string[] | undefined> },
    @UploadedFile() file: MulterFile | undefined,
    @Body()
    body: {
      durationSeconds?: string;
      clientId?: string;
      language?: string;
      format?: string;
      kind?: 'text';
      body?: string;
    },
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('if-match') ifMatch?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    const contentType = String(req.headers['content-type'] ?? '');
    if (contentType.includes('application/json')) {
      if (body.kind !== 'text' || !body.body?.trim()) {
        return mobileErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          'JSON 模式须包含 kind=text 与非空 body',
          buildMobileEnvelopeMeta(tripId),
        );
      }
      return this.runWrite(tripId, user, (userId) =>
        this.mobileWrite.sendIntercomTextMessage(
          tripId,
          userId,
          { kind: 'text', body: body.body!, clientId: body.clientId },
          { idempotencyKey, ifMatch: parseIfMatch(ifMatch) },
        ),
      );
    }

    if (!file?.buffer?.length) {
      return mobileErrorResponse(
        ErrorCode.VALIDATION_ERROR,
        '请上传 audio 文件',
        buildMobileEnvelopeMeta(tripId),
      );
    }
    return this.runWrite(tripId, user, (userId) =>
      this.mobileWrite.sendIntercomVoiceMessage(tripId, userId, file.buffer, {
        durationSeconds:
          body.durationSeconds != null ? Number(body.durationSeconds) : undefined,
        clientId: body.clientId,
        language: body.language,
        format: body.format ?? file.mimetype,
        idempotencyKey,
        ifMatch: parseIfMatch(ifMatch),
      }),
    );
  }

  @Put('members/:memberId/presence')
  @ApiOperation({ summary: 'iOS 成员位置/在线状态上报' })
  async updatePresence(
    @Param('tripId') tripId: string,
    @Param('memberId') memberId: string,
    @Body()
    body: {
      lat?: number;
      lng?: number;
      accuracy?: number;
      batteryPercent?: number;
      status?: string;
      recordedAt?: string;
      shareLocation?: boolean;
    },
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(tripId, user, async () => {
      const userId = this.access.resolveUserId(user);
      if (memberId !== userId) {
        throw new ForbiddenException('仅可上报本人的位置');
      }
      const result = await this.commsPeers.heartbeat(tripId, userId, {
        lat: body.lat,
        lng: body.lng,
        accuracyMeters: body.accuracy,
        clientTimestamp: body.recordedAt,
        shareLocation: body.shareLocation ?? true,
      });
      if (body.batteryPercent != null) {
        await this.mobileWrite.persistMemberPresence(tripId, userId, {
          batteryPercent: body.batteryPercent,
        });
      }
      const contextVersion = Date.now();
      this.contextNotifier.notifyTripContextChanged({
        tripId,
        contextVersion,
        changedSections: ['team', 'execution', 'intercom'],
      });
      return { contextVersion, ...result, batteryPercent: body.batteryPercent };
    });
  }

  private async runWrite<T>(
    tripId: string,
    user: CurrentUserPayload | undefined,
    fn: (userId: string) => Promise<T>,
  ) {
    const requestId = randomUUID();
    try {
      const userId = this.access.resolveUserId(user);
      const data = await fn(userId);
      return mobileSuccessResponse(data, buildMobileEnvelopeMeta(tripId, data, requestId));
    } catch (e) {
      return this.handleError(e, tripId, requestId);
    }
  }

  private async run<T>(tripId: string, user: CurrentUserPayload | undefined, fn: () => Promise<T>) {
    const requestId = randomUUID();
    try {
      this.access.resolveUserId(user);
      const data = await fn();
      return mobileSuccessResponse(data, buildMobileEnvelopeMeta(tripId, data, requestId));
    } catch (e) {
      return this.handleError(e, tripId, requestId);
    }
  }

  private handleError(e: unknown, tripId: string, requestId: string) {
    const meta = buildMobileEnvelopeMeta(tripId, undefined, requestId);
    if (e instanceof UnauthorizedException) {
      return mobileErrorResponse(ErrorCode.UNAUTHORIZED, e.message, meta);
    }
    if (e instanceof ForbiddenException) {
      return mobileErrorResponse(ErrorCode.FORBIDDEN, e.message, meta);
    }
    if (e instanceof NotFoundException) {
      const resp = e.getResponse();
      if (typeof resp === 'object' && resp !== null) {
        const row = resp as { code?: string; message?: string };
        return mobileErrorResponse(row.code ?? ErrorCode.NOT_FOUND, row.message ?? e.message, meta);
      }
      return mobileErrorResponse(ErrorCode.NOT_FOUND, e.message, meta);
    }
    if (e instanceof BadRequestException) {
      const resp = e.getResponse();
      if (typeof resp === 'object' && resp !== null) {
        const row = resp as { code?: string; message?: string };
        return mobileErrorResponse(row.code ?? ErrorCode.VALIDATION_ERROR, row.message ?? e.message, meta);
      }
      return mobileErrorResponse(ErrorCode.VALIDATION_ERROR, e.message, meta);
    }
    if (e instanceof ConflictException) {
      const resp = e.getResponse();
      if (typeof resp === 'object' && resp !== null) {
        const row = resp as { code?: string; message?: string; currentContextVersion?: number };
        return mobileErrorResponse(
          row.code ?? 'CONTEXT_VERSION_CONFLICT',
          row.message ?? e.message,
          {
            ...meta,
            contextVersion: row.currentContextVersion,
          },
          row.currentContextVersion != null
            ? { currentContextVersion: row.currentContextVersion }
            : undefined,
        );
      }
      return mobileErrorResponse('CONTEXT_VERSION_CONFLICT', e.message, meta);
    }
    if (e instanceof ServiceUnavailableException) {
      const resp = e.getResponse();
      const row =
        typeof resp === 'object' && resp !== null
          ? (resp as { code?: string; message?: string })
          : { message: e.message };
      return mobileErrorResponse(
        row.code ?? 'SERVICE_UNAVAILABLE',
        row.message ?? e.message,
        meta,
      );
    }
    const message = e instanceof Error ? e.message : String(e);
    return mobileErrorResponse(ErrorCode.INTERNAL_ERROR, message, meta);
  }
}

function parseIfMatch(header?: string): number | undefined {
  if (!header?.trim()) return undefined;
  const n = Number(header.trim());
  return Number.isFinite(n) ? n : undefined;
}
