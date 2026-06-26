import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import { successResponse } from '../../common/dto/standard-response.dto';
import { AccountContextService } from '../services/account-context.service';
import { ContextPermissionService } from '../services/context-permission.service';
import { SwitchAccountContextDto } from '../dto/account-context.dto';

@ApiTags('identity-governance')
@Controller('identity/account')
export class AccountContextController {
  constructor(
    private readonly accountContext: AccountContextService,
    private readonly contextPermission: ContextPermissionService,
  ) {}

  @Get('overview')
  @ApiOperation({ summary: '账号角色中心概览（上下文、验证、发布权限）' })
  async getOverview(@CurrentUser() user: CurrentUserPayload) {
    return successResponse(await this.accountContext.getOverview(user.userId));
  }

  @Get('permissions')
  @ApiOperation({ summary: '当前账号有效权限（组合式计算）' })
  async getPermissions(@CurrentUser() user: CurrentUserPayload) {
    return successResponse(await this.contextPermission.resolveForUser(user.userId));
  }

  @Post('context/switch')
  @ApiOperation({ summary: '切换账号上下文（个人 / 专业 / 机构）' })
  async switchContext(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: SwitchAccountContextDto,
  ) {
    return successResponse(
      await this.accountContext.switchContext(user.userId, body.contextType, body.contextId),
    );
  }
}
