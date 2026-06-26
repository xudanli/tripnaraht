import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../../common/dto/standard-response.dto';
import { ApiSuccessResponseDto } from '../../../common/dto/api-response.dto';
import { NotFoundException } from '@nestjs/common';
import { MoneyDnaService } from '../services/money-dna.service';

@ApiTags('user-money-dna')
@Public()
@Controller('users/me/money-dna')
export class MoneyDnaController {
  constructor(private readonly moneyDnaService: MoneyDnaService) {}

  @Get()
  @ApiOperation({ summary: '获取当前用户 Money DNA' })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async getMyMoneyDna(@CurrentUser() user?: CurrentUserPayload) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const profile = await this.moneyDnaService.getProfile(user.userId);
      return successResponse(profile);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('recompute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '重新计算 Money DNA（内部/管理或行程结束后触发）' })
  async recompute(@CurrentUser() user?: CurrentUserPayload) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const profile = await this.moneyDnaService.recomputeForUser(user.userId);
      return successResponse(profile);
    } catch (e) {
      return this.handleError(e);
    }
  }

  private handleError(e: unknown) {
    if (e instanceof NotFoundException) {
      return errorResponse(ErrorCode.NOT_FOUND, e.message);
    }
    return errorResponse(
      ErrorCode.INTERNAL_ERROR,
      e instanceof Error ? e.message : 'Unknown error',
    );
  }
}
