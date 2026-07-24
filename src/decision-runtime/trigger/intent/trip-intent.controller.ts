import {
  Body,
  Controller,
  Param,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiProperty, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { Public } from '../../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../../common/dto/standard-response.dto';
import { ConstraintSolverAccessService } from '../../../trips/trip-constraint-solver/services/constraint-solver-access.service';
import { TripIntentRouterService } from './trip-intent-router.service';

class PostTripIntentBodyDto {
  @ApiProperty({ description: '用户自然语言输入' })
  @IsString()
  @MinLength(1)
  message!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  problemId?: string;

  @ApiProperty({ required: false, description: '0-based day index' })
  @IsOptional()
  @IsInt()
  dayIndex?: number;
}

@ApiTags('trip-intent')
@Public()
@Controller('trips/:tripId')
export class TripIntentController {
  constructor(
    private readonly intentRouter: TripIntentRouterService,
    private readonly access: ConstraintSolverAccessService,
  ) {}

  @Post('intent')
  @ApiOperation({
    summary: '统一 NL 意图入口 → Trip Context Snapshot → Decision Trigger Gateway',
    description:
      '规则分类（S1）+ snapshot 绑定 + Gateway dispatch。规划/修改类建议继续 CALL_ROUTE_AND_RUN。',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiQuery({
    name: 'dryRun',
    required: false,
    description: 'dryRun=1 仅分类 + snapshot，不 dispatch',
  })
  async postIntent(
    @Param('tripId') tripId: string,
    @Body() body: PostTripIntentBodyDto,
    @Query('dryRun') dryRun?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);

      if (!body.message?.trim()) {
        return errorResponse(ErrorCode.BAD_REQUEST, 'message is required');
      }

      const data = await this.intentRouter.route({
        tripId,
        message: body.message.trim(),
        userId,
        problemId: body.problemId?.trim(),
        dayIndex: body.dayIndex,
        dryRun: dryRun === '1' || dryRun === 'true',
      });

      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  private handleError(e: unknown) {
    if (e instanceof UnauthorizedException) {
      return errorResponse(ErrorCode.UNAUTHORIZED, e.message);
    }
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes('not found')) {
      return errorResponse(ErrorCode.NOT_FOUND, message);
    }
    return errorResponse(ErrorCode.INTERNAL_ERROR, message);
  }
}
