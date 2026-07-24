import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'crypto';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import { ErrorCode } from '../../common/dto/standard-response.dto';
import { mobileErrorResponse, mobileSuccessResponse } from '../utils/mobile-envelope.util';
import { MobileEmergencyContactsService } from '../services/mobile-emergency-contacts.service';
import { MobilePushTokenService } from '../services/mobile-push-token.service';
import type { PutEmergencyContactsRequestDto } from '../dto/emergency-contacts.dto';
import type { RegisterPushTokenRequestDto } from '../dto/mobile-push.dto';
import { ConstraintSolverAccessService } from '../../trips/trip-constraint-solver/services/constraint-solver-access.service';

@ApiTags('mobile-user')
@Public()
@Controller('mobile/users/me')
export class MobileUserController {
  constructor(
    private readonly emergencyContacts: MobileEmergencyContactsService,
    private readonly pushTokens: MobilePushTokenService,
    private readonly access: ConstraintSolverAccessService,
  ) {}

  @Get('emergency-contacts')
  @ApiOperation({ summary: 'iOS 读取紧急联系人' })
  async getEmergencyContacts(@CurrentUser() user?: CurrentUserPayload) {
    return this.run(user, (userId) => this.emergencyContacts.getContacts(userId));
  }

  @Put('emergency-contacts')
  @ApiOperation({ summary: 'iOS 保存紧急联系人（全量替换）' })
  async putEmergencyContacts(
    @Body() body: PutEmergencyContactsRequestDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(user, (userId) => this.emergencyContacts.putContacts(userId, body));
  }

  @Post('push-tokens')
  @ApiOperation({ summary: 'iOS 注册/更新 APNs device token' })
  async registerPushToken(
    @Body() body: RegisterPushTokenRequestDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(user, (userId) => this.pushTokens.registerToken(userId, body));
  }

  @Delete('push-tokens/:deviceId')
  @ApiOperation({ summary: 'iOS 注销 device token（登出/卸载）' })
  async unregisterPushToken(
    @Param('deviceId') deviceId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(user, (userId) => this.pushTokens.unregisterToken(userId, deviceId));
  }

  private async run<T>(user: CurrentUserPayload | undefined, fn: (userId: string) => Promise<T>) {
    const requestId = randomUUID();
    const meta = { requestId, serverTime: new Date().toISOString() };
    try {
      const userId = this.access.resolveUserId(user);
      const data = await fn(userId);
      return mobileSuccessResponse(data, meta);
    } catch (e) {
      if (e instanceof UnauthorizedException) {
        return mobileErrorResponse(ErrorCode.UNAUTHORIZED, e.message, meta);
      }
      if (e instanceof NotFoundException) {
        return mobileErrorResponse(ErrorCode.NOT_FOUND, e.message, meta);
      }
      if (e instanceof BadRequestException) {
        return mobileErrorResponse(ErrorCode.VALIDATION_ERROR, e.message, meta);
      }
      const message = e instanceof Error ? e.message : String(e);
      return mobileErrorResponse(ErrorCode.INTERNAL_ERROR, message, meta);
    }
  }
}
