import {
  Controller,
  Get,
  Param,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../common/dto/standard-response.dto';
import { VoiceGuardService } from './services/voice-guard.service';

@ApiTags('trip-process-fairness')
@Public()
@Controller('trips/:tripId/voice-guard')
export class VoiceGuardController {
  constructor(private readonly voiceGuard: VoiceGuardService) {}

  @Get('status')
  @ApiOperation({ summary: '发言权保障状态（F3.3）' })
  @ApiParam({ name: 'tripId' })
  async getStatus(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(
        await this.voiceGuard.getStatus(tripId, this.resolveUserId(user)),
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return errorResponse(ErrorCode.INTERNAL_ERROR, message);
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
}
