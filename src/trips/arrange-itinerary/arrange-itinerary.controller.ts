import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../common/dto/standard-response.dto';
import { AttractionExploreAccessService } from '../attraction-explore/services/attraction-explore-access.service';
import { ArrangeItineraryItemsService } from './services/arrange-itinerary-items.service';
import { ArrangeItineraryOverviewService } from './services/arrange-itinerary-overview.service';
import { ArrangeItineraryAiActionsService } from './services/arrange-itinerary-ai-actions.service';
import { PlanningOrchestratorFacadeService } from './services/planning-orchestrator-facade.service';
import { AttractionExploreAutoArrangeService } from '../attraction-explore/services/attraction-explore-auto-arrange.service';
import {
  ArrangeItineraryGapDto,
  ArrangeItineraryItemDto,
  AttractionExploreAiActionDto,
  PlaceAttractionExploreCandidateDto,
} from './dto/arrange-itinerary.dto';
import {
  AttractionExploreAutoArrangeDto,
  AttractionExploreMapPlaceProposalDto,
} from '../attraction-explore/dto/attraction-explore.dto';
import { ArrangeItineraryMapPlacementService } from './services/arrange-itinerary-map-placement.service';
import {
  ApplyPlanProposalDto,
  AnalyzeItineraryItemMoveDto,
  CopilotActionDto,
  CreatePlanProposalDto,
  UpdatePlanningModeDto,
} from './dto/plan-proposal.dto';
import { ArrangeItineraryMoveAnalysisService } from './services/arrange-itinerary-move-analysis.service';
import { PlanningItemLockService } from './services/planning-item-lock.service';
import { PlanningModeService } from './services/planning-mode.service';
import { ArrangeItineraryCopilotService } from './services/arrange-itinerary-copilot.service';
import { PlanningCopilotActionService } from './services/planning-copilot-action.service';
import { PlanningWorkbenchSnapshotService } from './services/planning-workbench-snapshot.service';
import { PlanningProposalMonitorService } from './services/planning-proposal-monitor.service';
import { PlanningDecisionCausalChainService } from './services/planning-decision-causal-chain.service';
import { PlanningDecisionBasisService } from './services/planning-decision-basis.service';
import { PlanningDecisionInspectorService } from './services/planning-decision-inspector.service';

@ApiTags('trip-arrange-itinerary')
@ApiBearerAuth()
@Public()
@Controller('trips/:tripId/arrange-itinerary')
export class ArrangeItineraryController {
  constructor(
    private readonly access: AttractionExploreAccessService,
    private readonly overview: ArrangeItineraryOverviewService,
    private readonly items: ArrangeItineraryItemsService,
    private readonly aiActions: ArrangeItineraryAiActionsService,
    private readonly orchestrator: PlanningOrchestratorFacadeService,
    private readonly itemLocks: PlanningItemLockService,
    private readonly planningMode: PlanningModeService,
    private readonly moveAnalysis: ArrangeItineraryMoveAnalysisService,
    private readonly copilot: ArrangeItineraryCopilotService,
    private readonly copilotActions: PlanningCopilotActionService,
    private readonly workbenchSnapshot: PlanningWorkbenchSnapshotService,
    private readonly proposalMonitor: PlanningProposalMonitorService,
    private readonly causalChain: PlanningDecisionCausalChainService,
    private readonly decisionBasis: PlanningDecisionBasisService,
    private readonly decisionInspector: PlanningDecisionInspectorService,
  ) {}

  @Get('planning-workbench-snapshot')
  @ApiOperation({ summary: '规划工作台快照（模式/编排态/冲突/协同建议）' })
  async getPlanningWorkbenchSnapshot(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      return successResponse(await this.workbenchSnapshot.getSnapshot(tripId, userId));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('copilot-suggestions')
  @ApiOperation({ summary: '协同规划建议（空档/必去/绕路/待确认草案）' })
  async getCopilotSuggestions(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.access.assertTripMember(tripId, this.resolveUserId(user));
      return successResponse(await this.copilot.getSuggestions(tripId));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('copilot-actions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '执行协同规划动作（生成草案，不直写）' })
  async runCopilotAction(
    @Param('tripId') tripId: string,
    @Body() body: CopilotActionDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      return successResponse(
        await this.copilotActions.execute({
          tripId,
          userId,
          action: body.action,
          candidateId: body.candidateId,
          suggestionId: body.suggestionId,
          dayIndex: body.dayIndex,
        }),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('planning-mode')
  @ApiOperation({ summary: '智能规划开关（manual / copilot）' })
  async getPlanningMode(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.access.assertTripMember(tripId, this.resolveUserId(user));
      return successResponse(await this.planningMode.getMode(tripId));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('planning-mode')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '更新智能规划模式' })
  async updatePlanningMode(
    @Param('tripId') tripId: string,
    @Body() body: UpdatePlanningModeDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.access.assertTripMember(tripId, this.resolveUserId(user));
      return successResponse(await this.planningMode.setMode(tripId, body.mode));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('item-locks')
  @ApiOperation({ summary: '行程项锁定分类（航班/预订/必去/可移动）' })
  async getItemLocks(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.access.assertTripMember(tripId, this.resolveUserId(user));
      return successResponse(await this.itemLocks.getTripItemLocks(tripId));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('items/:itemId/analyze-move')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '拖拽后局部影响分析，生成 MOVE_ITEM 草案' })
  @ApiParam({ name: 'itemId' })
  async analyzeItemMove(
    @Param('tripId') tripId: string,
    @Param('itemId') itemId: string,
    @Body() body: AnalyzeItineraryItemMoveDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.access.assertTripMember(tripId, this.resolveUserId(user));
      const userId = this.resolveUserId(user);
      if (body.commitMode === 'direct') {
        throw new BadRequestException('analyze-move 仅支持 commitMode=proposal');
      }
      return successResponse(
        await this.moveAnalysis.analyzeMove({
          tripId,
          userId,
          itemId,
          dayIndex: body.dayIndex,
          startTime: body.startTime,
          endTime: body.endTime,
        }),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('orchestration-state')
  @ApiOperation({ summary: '规划编排状态机' })
  async getOrchestrationState(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.access.assertTripMember(tripId, this.resolveUserId(user));
      return successResponse(await this.orchestrator.refreshOrchestrationState(tripId));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('proposals')
  @ApiOperation({ summary: '列出待确认的规划草案' })
  async listProposals(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.access.assertTripMember(tripId, this.resolveUserId(user));
      return successResponse({ tripId, proposals: this.orchestrator.listProposals(tripId) });
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('proposals/:proposalId')
  @ApiOperation({ summary: '获取单个规划草案' })
  @ApiParam({ name: 'proposalId' })
  async getProposal(
    @Param('tripId') tripId: string,
    @Param('proposalId') proposalId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.access.assertTripMember(tripId, this.resolveUserId(user));
      const proposal = this.orchestrator.getProposal(proposalId);
      if (proposal.tripId !== tripId) {
        throw new NotFoundException('草案不属于该行程');
      }
      return successResponse(proposal);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('proposals')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '显式创建规划草案（Planning Orchestrator 入口）' })
  async createProposal(
    @Param('tripId') tripId: string,
    @Body() body: CreatePlanProposalDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.access.assertTripMember(tripId, this.resolveUserId(user));
      const proposal = await this.orchestrator.createProposal({
        tripId,
        userId: this.resolveUserId(user),
        intent: body.intent,
        // whitelist-safe: payload now decorated; still default {} if client omits
        payload: body.payload ?? {},
        topLevelCandidateIds: body.candidateIds,
      });
      return successResponse({
        mode: 'proposal' as const,
        tripId,
        proposal,
        orchestrationState: this.orchestrator.getOrchestrationState(tripId),
      });
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('decision-inspector')
  @ApiOperation({
    summary: '决策检查器（四 Tab 统一读模型）',
    description:
      '聚合 causalChain / planDiff / memberConsensus / feasibility。' +
      '决策空间传 problemId（无草案）；编排确认传 proposalId。' +
      'tabEmptyState 标示各 Tab 是否应展示空态（无 BFF 数据时不返回 fixture 文案）。',
  })
  async getDecisionInspector(
    @Param('tripId') tripId: string,
    @Query('proposalId') proposalId: string | undefined,
    @Query('problemId') problemId: string | undefined,
    @Query('optionId') optionId?: string,
    @Query('conflictId') conflictId?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      return successResponse(
        await this.decisionInspector.getInspector(tripId, {
          proposalId: proposalId?.trim() || undefined,
          problemId: problemId?.trim() || undefined,
          optionId: optionId?.trim() || undefined,
          conflictId: conflictId?.trim() || undefined,
          userId,
        }),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('decision-basis')
  @ApiOperation({
    summary: '决策依据卡（发生了什么 + 上下文六格）',
    description:
      '聚合 trip conflicts 路段/缓冲、行程项停留与预约、午餐锚点；供规划工作台问题说明卡渲染。' +
      '决策空间传 problemId（或误把 dc_/dp_ 塞进 conflictId 亦可解析，不 404）。',
  })
  async getDecisionBasis(
    @Param('tripId') tripId: string,
    @Query('conflictId') conflictId?: string,
    @Query('proposalId') proposalId?: string,
    @Query('problemId') problemId?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.access.assertTripMember(tripId, this.resolveUserId(user));
      return successResponse(
        await this.decisionBasis.getBasis(tripId, {
          conflictId: conflictId?.trim() || undefined,
          proposalId: proposalId?.trim() || undefined,
          problemId: problemId?.trim() || undefined,
        }),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('decision-causal-chain')
  @ApiOperation({
    summary: '决策因果链（竖向影响传播节点）',
    description:
      '聚合草案级联模拟、Readiness cascadeUiHints、Decision Checker impact.cascade；供规划工作台「决策因果链」组件渲染。',
  })
  async getDecisionCausalChain(
    @Param('tripId') tripId: string,
    @Query('proposalId') proposalId?: string,
    @Query('problemId') problemId?: string,
    @Query('optionId') optionId?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.access.assertTripMember(tripId, this.resolveUserId(user));
      return successResponse(
        await this.causalChain.getChain(tripId, {
          proposalId: proposalId?.trim() || undefined,
          problemId: problemId?.trim() || undefined,
          optionId: optionId?.trim() || undefined,
          userId: user?.userId,
        }),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('proposals/:proposalId/monitor')
  @ApiOperation({ summary: '草案时效监控（validUntil + 失效检测，供前端轮询）' })
  @ApiParam({ name: 'proposalId' })
  async getProposalMonitor(
    @Param('tripId') tripId: string,
    @Param('proposalId') proposalId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.access.assertTripMember(tripId, this.resolveUserId(user));
      return successResponse(await this.proposalMonitor.getValidity(proposalId));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('proposals/:proposalId/apply')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '确认并写入规划草案' })
  @ApiParam({ name: 'proposalId' })
  async applyProposal(
    @Param('tripId') tripId: string,
    @Param('proposalId') proposalId: string,
    @Body() body: ApplyPlanProposalDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.access.assertTripMember(tripId, this.resolveUserId(user));
      const proposal = this.orchestrator.getProposal(proposalId);
      if (proposal.tripId !== tripId) {
        throw new NotFoundException('草案不属于该行程');
      }
      return successResponse(
        await this.orchestrator.applyProposal({
          proposalId,
          userId: this.resolveUserId(user),
          contextVersion: body.contextVersion,
          force: body.force,
          enabledItemIds: body.enabledItemIds,
          comment: body.comment,
        }),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('proposals/:proposalId/discard')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '丢弃规划草案' })
  @ApiParam({ name: 'proposalId' })
  async discardProposal(
    @Param('tripId') tripId: string,
    @Param('proposalId') proposalId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.access.assertTripMember(tripId, this.resolveUserId(user));
      const proposal = this.orchestrator.getProposal(proposalId);
      if (proposal.tripId !== tripId) {
        throw new NotFoundException('草案不属于该行程');
      }
      return successResponse(this.orchestrator.discardProposal(proposalId));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('overview')
  @ApiOperation({ summary: '编排页左栏路线概览聚合' })
  async getOverview(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.access.assertTripMember(tripId, this.resolveUserId(user));
      return successResponse(await this.overview.getOverview(tripId, this.resolveUserId(user)));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('items')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '添加行程活动（默认生成草案，commitMode=direct 直写）' })
  async createItem(
    @Param('tripId') tripId: string,
    @Body() body: ArrangeItineraryItemDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.access.assertTripMember(tripId, this.resolveUserId(user));
      const userId = this.resolveUserId(user);
      return successResponse(
        await this.orchestrator.mutateWithMode({
          tripId,
          userId,
          commitMode: body.commitMode,
          buildProposal: () =>
            this.orchestrator.createProposal({
              tripId,
              userId,
              intent: 'ADD_ITEM',
              payload: body as unknown as Record<string, unknown>,
            }),
          applyDirect: () =>
            this.items.createItem({ tripId, userId, body }),
          mapDirect: (direct) => ({
            itineraryItem: direct.itineraryItem,
            scheduleTimeline: direct.scheduleTimeline,
          }),
        }),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('gaps')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '插入日程空档 / 休息块（默认生成草案）' })
  async createGap(
    @Param('tripId') tripId: string,
    @Body() body: ArrangeItineraryGapDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.access.assertTripMember(tripId, this.resolveUserId(user));
      const userId = this.resolveUserId(user);
      return successResponse(
        await this.orchestrator.mutateWithMode({
          tripId,
          userId,
          commitMode: body.commitMode,
          buildProposal: () =>
            this.orchestrator.createProposal({
              tripId,
              userId,
              intent: 'INSERT_REST_GAP',
              payload: body as unknown as Record<string, unknown>,
            }),
          applyDirect: () => this.items.createGap({ tripId, userId, body }),
          mapDirect: (direct) => ({
            itineraryItem: direct.itineraryItem,
            scheduleTimeline: direct.scheduleTimeline,
          }),
        }),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('ai-actions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '编排页 AI 快捷动作（默认生成草案）' })
  async runAiAction(
    @Param('tripId') tripId: string,
    @Body() body: AttractionExploreAiActionDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.access.assertTripMember(tripId, this.resolveUserId(user));
      return successResponse(
        await this.aiActions.runAction({
          tripId,
          userId: this.resolveUserId(user),
          body,
        }),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  private resolveUserId(user?: CurrentUserPayload): string {
    if (user?.userId) return user.userId;
    if (process.env.NODE_ENV !== 'production') return 'anonymous-dev-user';
    throw new UnauthorizedException('未认证或 token 无效');
  }

  private handleError(e: unknown) {
    if (
      e instanceof UnauthorizedException ||
      e instanceof BadRequestException ||
      e instanceof NotFoundException ||
      e instanceof ForbiddenException ||
      e instanceof ConflictException
    ) {
      throw e;
    }
    const message = e instanceof Error ? e.message : String(e);
    return errorResponse(ErrorCode.INTERNAL_ERROR, message);
  }
}

@ApiTags('trip-attraction-explore')
@ApiBearerAuth()
@Public()
@Controller('trips/:tripId/attraction-explore')
export class AttractionExploreArrangeController {
  constructor(
    private readonly access: AttractionExploreAccessService,
    private readonly items: ArrangeItineraryItemsService,
    private readonly aiActions: ArrangeItineraryAiActionsService,
    private readonly orchestrator: PlanningOrchestratorFacadeService,
    private readonly autoArrangeLegacy: AttractionExploreAutoArrangeService,
    private readonly mapPlacement: ArrangeItineraryMapPlacementService,
  ) {}

  @Post('map/place-proposal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '地图 POI 插入建议 — 生成 PlanProposal 草案' })
  async mapPlaceProposal(
    @Param('tripId') tripId: string,
    @Body() body: AttractionExploreMapPlaceProposalDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.access.assertTripMember(tripId, this.resolveUserId(user));
      return successResponse(
        await this.mapPlacement.buildPlaceProposal({
          tripId,
          userId: this.resolveUserId(user),
          placeId: body.placeId,
          dayIndex: body.dayIndex,
          candidateId: body.candidateId,
        }),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('auto-arrange')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary:
      '自动编排候选 → PlanProposal（mode=proposal；未确认不写 Active Plan）',
  })
  async autoArrange(
    @Param('tripId') tripId: string,
    @Body() body: AttractionExploreAutoArrangeDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.access.assertTripMember(tripId, this.resolveUserId(user));
      const userId = this.resolveUserId(user);
      const commitMode = body.mode === 'proposal' ? 'proposal' : body.commitMode;
      return successResponse(
        await this.orchestrator.mutateWithMode({
          tripId,
          userId,
          commitMode,
          buildProposal: () =>
            this.orchestrator.createProposal({
              tripId,
              userId,
              intent: 'AUTO_ARRANGE',
              payload: {
                candidateIds: body.candidateIds ?? [],
                dayIndex: body.dayIndex,
                options: body.options,
              },
            }),
          applyDirect: () =>
            this.autoArrangeLegacy.autoArrange({
              tripId,
              candidateIds: body.candidateIds,
            }),
          mapDirect: (direct) => ({
            taskId: direct.taskId,
            status: direct.status,
            itemCount: direct.itemCount,
          }),
        }),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('candidates/:candidateId/place')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '将候选放入指定日程天（默认生成草案）' })
  @ApiParam({ name: 'candidateId', description: '候选 UUID' })
  async placeCandidate(
    @Param('tripId') tripId: string,
    @Param('candidateId') candidateId: string,
    @Body() body: PlaceAttractionExploreCandidateDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.access.assertTripMember(tripId, this.resolveUserId(user));
      const userId = this.resolveUserId(user);
      return successResponse(
        await this.orchestrator.mutateWithMode({
          tripId,
          userId,
          commitMode: body.commitMode,
          buildProposal: () =>
            this.orchestrator.createProposal({
              tripId,
              userId,
              intent: 'PLACE_CANDIDATE',
              payload: { candidateId, ...body },
            }),
          applyDirect: () =>
            this.items.placeCandidate({ tripId, userId, candidateId, body }),
          mapDirect: (direct) => ({
            itineraryItem: direct.itineraryItem,
            scheduleTimeline: direct.scheduleTimeline,
            candidates: direct.candidates,
          }),
        }),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('ai-actions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '编排页 AI 快捷动作（与 arrange-itinerary/ai-actions 等价）' })
  async runAiAction(
    @Param('tripId') tripId: string,
    @Body() body: AttractionExploreAiActionDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.access.assertTripMember(tripId, this.resolveUserId(user));
      return successResponse(
        await this.aiActions.runAction({
          tripId,
          userId: this.resolveUserId(user),
          body,
        }),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  private resolveUserId(user?: CurrentUserPayload): string {
    if (user?.userId) return user.userId;
    if (process.env.NODE_ENV !== 'production') return 'anonymous-dev-user';
    throw new UnauthorizedException('未认证或 token 无效');
  }

  private handleError(e: unknown) {
    if (
      e instanceof UnauthorizedException ||
      e instanceof BadRequestException ||
      e instanceof NotFoundException ||
      e instanceof ForbiddenException ||
      e instanceof ConflictException
    ) {
      throw e;
    }
    const message = e instanceof Error ? e.message : String(e);
    return errorResponse(ErrorCode.INTERNAL_ERROR, message);
  }
}
