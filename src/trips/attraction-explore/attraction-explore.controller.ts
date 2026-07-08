import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../common/dto/standard-response.dto';
import { AttractionExploreOrchestratorService } from './services/attraction-explore-orchestrator.service';
import {
  AddAttractionExploreCandidateDto,
  AttractionExploreAiConsultDto,
  AttractionExploreIntentDto,
  AttractionExploreMapQueryDto,
  AttractionExploreRecommendationsQueryDto,
  AttractionExploreSearchDto,
  PatchAttractionExploreCandidatesDto,
  UpdateAttractionExploreContextDto,
} from './dto/attraction-explore.dto';

@ApiTags('trip-attraction-explore')
@ApiBearerAuth()
@Public()
@Controller('trips/:tripId/attraction-explore')
export class AttractionExploreController {
  constructor(private readonly orchestrator: AttractionExploreOrchestratorService) {}

  @Get('context')
  @ApiOperation({ summary: '探索上下文（左栏）— 主题/筛选/旅行条件/成员偏好' })
  @ApiParam({ name: 'tripId' })
  async getContext(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(await this.orchestrator.getContext(tripId, this.resolveUserId(user)));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Patch('context')
  @ApiOperation({ summary: '更新探索筛选（主题/适合谁/viewTab）' })
  async patchContext(
    @Param('tripId') tripId: string,
    @Body() body: UpdateAttractionExploreContextDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(
        await this.orchestrator.updateContext(tripId, this.resolveUserId(user), body),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('recommendations')
  @ApiOperation({ summary: '分组推荐（中栏）' })
  async getRecommendations(
    @Param('tripId') tripId: string,
    @Query() query: AttractionExploreRecommendationsQueryDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(
        await this.orchestrator.getRecommendations(tripId, this.resolveUserId(user), query),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('explore-intent')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '编译自然语言探索意图（结构化检索条件）' })
  async compileExploreIntent(@Body() body: AttractionExploreIntentDto) {
    try {
      return successResponse(
        await this.orchestrator.compileExploreIntent(body.query, { useLlm: body.useLlm }),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '语义搜索（顶栏）' })
  async search(
    @Param('tripId') tripId: string,
    @Body() body: AttractionExploreSearchDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(await this.orchestrator.search(tripId, this.resolveUserId(user), body));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('candidates')
  @ApiOperation({ summary: '候选清单（右栏）— 服务端持久化，含攻略 accept 写入的点' })
  async listCandidates(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(
        await this.orchestrator.listCandidates(tripId, this.resolveUserId(user)),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('candidates')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '添加候选' })
  async addCandidate(
    @Param('tripId') tripId: string,
    @Body() body: AddAttractionExploreCandidateDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(
        await this.orchestrator.addCandidate(tripId, this.resolveUserId(user), body),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Patch('candidates')
  @ApiOperation({ summary: '批量更新候选优先级与排序' })
  async patchCandidates(
    @Param('tripId') tripId: string,
    @Body() body: PatchAttractionExploreCandidatesDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(
        await this.orchestrator.patchCandidates(tripId, this.resolveUserId(user), body),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Delete('candidates/:candidateId')
  @ApiOperation({ summary: '删除单个候选' })
  @ApiParam({ name: 'candidateId', description: '候选 UUID' })
  async deleteCandidate(
    @Param('tripId') tripId: string,
    @Param('candidateId') candidateId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(
        await this.orchestrator.deleteCandidate(tripId, this.resolveUserId(user), candidateId),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('ai-consult')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'AI 选点建议' })
  async aiConsult(
    @Param('tripId') tripId: string,
    @Body() body: AttractionExploreAiConsultDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(
        await this.orchestrator.aiConsult(tripId, this.resolveUserId(user), body),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('map')
  @ApiOperation({ summary: '地图视图 — 路线 + 候选/推荐 POI 坐标' })
  async getMap(
    @Param('tripId') tripId: string,
    @Query() query: AttractionExploreMapQueryDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(await this.orchestrator.getMap(tripId, this.resolveUserId(user), query));
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
      e instanceof ForbiddenException
    ) {
      throw e;
    }
    const message = e instanceof Error ? e.message : String(e);
    return errorResponse(ErrorCode.INTERNAL_ERROR, message);
  }
}
