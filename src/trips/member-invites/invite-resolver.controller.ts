import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../common/dto/standard-response.dto';
import { InviteResolverService } from './services/invite-resolver.service';

@ApiTags('invites')
@Controller('invites')
export class InviteResolverController {
  constructor(private readonly resolver: InviteResolverService) {}

  @Public()
  @Get(':token/resolve')
  @ApiOperation({ summary: '统一邀请解析（trip_member → team → gate1）' })
  @ApiParam({ name: 'token', description: '邀请 token / code' })
  async resolve(@Param('token') token: string) {
    try {
      const data = await this.resolver.resolve(token);
      if (!data) {
        return errorResponse(ErrorCode.NOT_FOUND, '邀请不存在或已失效');
      }
      return successResponse(data);
    } catch (e) {
      if (e instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, e.message);
      }
      throw e;
    }
  }
}
