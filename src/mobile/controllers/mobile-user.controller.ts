import {
  Controller,
  Get,
  Put,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UploadedFile,
  UseInterceptors,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
  ConflictException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'crypto';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import { ErrorCode } from '../../common/dto/standard-response.dto';
import { mobileErrorResponse, mobileSuccessResponse } from '../utils/mobile-envelope.util';
import { MobileEmergencyContactsService } from '../services/mobile-emergency-contacts.service';
import { MobilePushTokenService } from '../services/mobile-push-token.service';
import { MobileIdentityService } from '../services/mobile-identity.service';
import { MobileIdentityOptionsService } from '../services/mobile-identity-options.service';
import { MobileTravelPortraitService } from '../services/mobile-travel-portrait.service';
import { MobileDriverProfileService } from '../services/mobile-driver-profile.service';
import { MobileCredentialDocumentsService } from '../services/mobile-credential-documents.service';
import type { PutEmergencyContactsRequestDto } from '../dto/emergency-contacts.dto';
import type { RegisterPushTokenRequestDto } from '../dto/mobile-push.dto';
import type { PatchMobileIdentityDto } from '../dto/mobile-identity.dto';
import type { PatchMobileTravelPortraitDto } from '../dto/mobile-travel-portrait.dto';
import type { PatchMobileDriverProfileDto } from '../dto/mobile-driver-profile.dto';
import { ConstraintSolverAccessService } from '../../trips/trip-constraint-solver/services/constraint-solver-access.service';

@ApiTags('mobile-user')
@Public()
@Controller('mobile/users/me')
export class MobileUserController {
  constructor(
    private readonly emergencyContacts: MobileEmergencyContactsService,
    private readonly pushTokens: MobilePushTokenService,
    private readonly identity: MobileIdentityService,
    private readonly identityOptions: MobileIdentityOptionsService,
    private readonly travelPortrait: MobileTravelPortraitService,
    private readonly driverProfile: MobileDriverProfileService,
    private readonly documents: MobileCredentialDocumentsService,
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

  @Get('identity/options')
  @ApiOperation({
    summary: '个人资料选项：国籍 / 常住地区 / 常用语言',
  })
  async getIdentityOptions(@CurrentUser() user?: CurrentUserPayload) {
    return this.run(user, () => this.identityOptions.getOptions());
  }

  @Get('identity/nationalities')
  @ApiOperation({ summary: '国籍列表（可搜索）' })
  async getIdentityNationalities(
    @Query('q') q?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(user, async () => ({
      items: await this.identityOptions.listNationalities(q),
    }));
  }

  @Get('identity/residency-regions')
  @ApiOperation({
    summary: '常住地区列表（ISO 3166-2）；可按 countryCode 过滤，如 CN',
  })
  async getIdentityResidencyRegions(
    @Query('countryCode') countryCode?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(user, async () =>
      this.identityOptions.listResidencyRegions(countryCode),
    );
  }

  @Get('identity')
  @ApiOperation({ summary: '个人资料（含敏感字段，仅本人）' })
  async getIdentity(@CurrentUser() user?: CurrentUserPayload) {
    return this.run(user, (userId) => this.identity.getIdentity(userId));
  }

  @Patch('identity')
  @ApiOperation({ summary: '部分更新个人资料' })
  async patchIdentity(
    @Body() body: PatchMobileIdentityDto | Record<string, unknown>,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(user, (userId) => this.identity.patchIdentity(userId, body ?? {}));
  }

  @Put('identity')
  @ApiOperation({ summary: '更新个人资料（PUT，与 PATCH 同语义）' })
  async putIdentity(
    @Body() body: PatchMobileIdentityDto | Record<string, unknown>,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.patchIdentity(body, user);
  }

  @Get('travel-portrait')
  @ApiOperation({ summary: '跨行程旅行画像' })
  async getTravelPortrait(@CurrentUser() user?: CurrentUserPayload) {
    return this.run(user, (userId) => this.travelPortrait.getPortrait(userId));
  }

  @Patch('travel-portrait')
  @ApiOperation({ summary: '部分更新旅行画像' })
  async patchTravelPortrait(
    @Body() body: PatchMobileTravelPortraitDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(user, (userId) =>
      this.travelPortrait.patchPortrait(userId, body ?? {}),
    );
  }

  @Put('travel-portrait')
  @ApiOperation({ summary: '更新旅行画像（PUT，与 PATCH 同语义）' })
  async putTravelPortrait(
    @Body() body: PatchMobileTravelPortraitDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.patchTravelPortrait(body, user);
  }

  @Get('driver-profile')
  @ApiOperation({ summary: '跨行程驾驶员资料（无评分）' })
  async getDriverProfile(@CurrentUser() user?: CurrentUserPayload) {
    return this.run(user, (userId) => this.driverProfile.getProfile(userId));
  }

  @Patch('driver-profile')
  @ApiOperation({ summary: '部分更新驾驶员资料' })
  async patchDriverProfile(
    @Body() body: PatchMobileDriverProfileDto | Record<string, unknown>,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(user, (userId) => this.driverProfile.patchProfile(userId, body ?? {}));
  }

  @Put('driver-profile')
  @ApiOperation({ summary: '更新驾驶员资料（PUT，与 PATCH 同语义）' })
  async putDriverProfile(
    @Body() body: PatchMobileDriverProfileDto | Record<string, unknown>,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.patchDriverProfile(body, user);
  }

  @Get('driver-profile/summary')
  @ApiOperation({ summary: '驾驶员资料状态卡' })
  async getDriverProfileSummary(@CurrentUser() user?: CurrentUserPayload) {
    return this.run(user, (userId) => this.driverProfile.getSummary(userId));
  }

  @Get('documents')
  @ApiOperation({ summary: '证件资料库列表（元数据）' })
  async listDocuments(@CurrentUser() user?: CurrentUserPayload) {
    return this.run(user, (userId) => this.documents.listDocuments(userId));
  }

  @Post('documents')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '上传证件（multipart）' })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadDocument(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: { type?: string; expiresOn?: string; notes?: string },
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(user, (userId) =>
      this.documents.uploadDocument(userId, {
        type: body?.type,
        expiresOn: body?.expiresOn,
        notes: body?.notes,
        file,
      }),
    );
  }

  @Get('documents/:documentId')
  @ApiOperation({ summary: '本人查看证件（含短期签名 URL）' })
  async getDocument(
    @Param('documentId') documentId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(user, (userId) => this.documents.getDocument(userId, documentId));
  }

  @Delete('documents/:documentId')
  @ApiOperation({ summary: '删除本人证件' })
  async deleteDocument(
    @Param('documentId') documentId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.run(user, (userId) => this.documents.deleteDocument(userId, documentId));
  }

  private async run<T>(
    user: CurrentUserPayload | undefined,
    fn: (userId: string) => Promise<T>,
  ) {
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
      if (e instanceof ForbiddenException) {
        return mobileErrorResponse(ErrorCode.FORBIDDEN, e.message, meta);
      }
      if (e instanceof NotFoundException) {
        return mobileErrorResponse(ErrorCode.NOT_FOUND, e.message, meta);
      }
      if (e instanceof BadRequestException) {
        return mobileErrorResponse(ErrorCode.VALIDATION_ERROR, extractMessage(e), meta);
      }
      if (e instanceof PayloadTooLargeException) {
        return mobileErrorResponse('PAYLOAD_TOO_LARGE', e.message, meta);
      }
      if (e instanceof UnsupportedMediaTypeException) {
        return mobileErrorResponse('UNSUPPORTED_MEDIA_TYPE', e.message, meta);
      }
      if (e instanceof ConflictException) {
        return mobileErrorResponse('CONFLICT', e.message, meta);
      }
      const message = e instanceof Error ? e.message : String(e);
      return mobileErrorResponse(ErrorCode.INTERNAL_ERROR, message, meta);
    }
  }
}

function extractMessage(e: BadRequestException): string {
  const res = e.getResponse();
  if (typeof res === 'string') return res;
  if (res && typeof res === 'object' && 'message' in res) {
    const m = (res as { message: string | string[] }).message;
    return Array.isArray(m) ? m.join('; ') : String(m);
  }
  return e.message;
}
