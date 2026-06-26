import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../common/dto/standard-response.dto';
import { WISH_CATEGORIES, type WishCategory } from '../wishlist/types/trip-wish.types';
import { TripDomainInfluenceService } from './services/trip-domain-influence.service';
import {
  BulkSetDomainWeightsDto,
  ClaimDomainDto,
  ConfirmDomainRulesDto,
  EndorseDomainClaimDto,
  SetDomainWeightsDto,
} from './dto/trip-domain.dto';

@ApiTags('trip-domain-influence')
@Public()
@Controller('trips/:tripId/domain-influence')
export class TripDomainInfluenceController {
  constructor(private readonly domainService: TripDomainInfluenceService) {}

  @Get()
  @ApiOperation({ summary: '领域影响力全景（认领 + 权重 + 决策规则）' })
  @ApiParam({ name: 'tripId' })
  async getSnapshot(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(
        await this.domainService.getSnapshot(tripId, this.resolveUserId(user)),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('workbench-sidebar')
  @ApiOperation({ summary: '规划工作台右侧栏 — 行程领域分解' })
  async getWorkbenchSidebar(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(
        await this.domainService.getWorkbenchSidebar(tripId, this.resolveUserId(user)),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('recommendations')
  @ApiOperation({ summary: '系统推荐认领领域（F2.1）' })
  async getRecommendations(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse({
        items: await this.domainService.getRecommendations(tripId, this.resolveUserId(user)),
      });
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('domains/:domain/decision-brief')
  @ApiOperation({ summary: '领域负责人决策简报（含私密心愿单约束）' })
  async getDecisionBrief(
    @Param('tripId') tripId: string,
    @Param('domain') domain: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      if (!WISH_CATEGORIES.includes(domain as WishCategory)) {
        throw new BadRequestException(`无效领域 ${domain}`);
      }
      return successResponse(
        await this.domainService.getDecisionBrief(
          tripId,
          domain as WishCategory,
          this.resolveUserId(user),
        ),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('claims')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '认领领域专家（F2.1）' })
  async claimDomain(
    @Param('tripId') tripId: string,
    @Body() body: ClaimDomainDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(
        await this.domainService.claimDomain(tripId, this.resolveUserId(user), body),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Delete('claims/:claimId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '撤回领域认领' })
  async withdrawClaim(
    @Param('tripId') tripId: string,
    @Param('claimId') claimId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.domainService.withdrawClaim(tripId, claimId, this.resolveUserId(user));
      return successResponse({ withdrawn: true });
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('endorsements')
  @ApiOperation({ summary: '认可某成员的领域认领' })
  async endorseClaim(
    @Param('tripId') tripId: string,
    @Body() body: EndorseDomainClaimDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(
        await this.domainService.endorseClaim(tripId, this.resolveUserId(user), body),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Put('weights')
  @ApiOperation({ summary: '结构化协商后调整领域权重（F2.2）' })
  async setDomainWeights(
    @Param('tripId') tripId: string,
    @Body() body: SetDomainWeightsDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(
        await this.domainService.setDomainWeights(tripId, this.resolveUserId(user), body),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Put('weights/bulk')
  @ApiOperation({ summary: '批量调整多个领域权重' })
  async bulkSetDomainWeights(
    @Param('tripId') tripId: string,
    @Body() body: BulkSetDomainWeightsDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      const results = [];
      for (const item of body.domains) {
        results.push(await this.domainService.setDomainWeights(tripId, userId, item));
      }
      return successResponse({ domains: results });
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('confirm-rules')
  @ApiOperation({ summary: '全员确认领域决策规则（F2.3 透明化）' })
  async confirmRules(
    @Param('tripId') tripId: string,
    @Body() _body: ConfirmDomainRulesDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(
        await this.domainService.confirmRules(tripId, this.resolveUserId(user)),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  private resolveUserId(user?: CurrentUserPayload): string {
    if (user?.userId) {
      return user.userId;
    }
    if (process.env.NODE_ENV !== 'production') {
      return 'anonymous-dev-user';
    }
    throw new UnauthorizedException('未认证或 token 无效');
  }

  private handleError(e: unknown) {
    if (e instanceof UnauthorizedException) {
      return errorResponse(ErrorCode.UNAUTHORIZED, e.message);
    }
    if (e instanceof BadRequestException) {
      return errorResponse(ErrorCode.BAD_REQUEST, e.message);
    }
    const message = e instanceof Error ? e.message : String(e);
    return errorResponse(ErrorCode.INTERNAL_ERROR, message);
  }
}
