/**
 * Public + admin self-drive settings endpoints (global, countryCode-driven).
 */

import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../../common/dto/standard-response.dto';
import { PatchIcelandSelfDriveDrivingSettingsDto } from '../../iceland-self-drive/dto/patch-driving-settings.dto';
import { SelfDriveSettingsFacade } from '../services/self-drive-settings.facade';

@ApiTags('self-drive-settings')
@Controller()
export class SelfDriveSettingsAdminController {
  constructor(private readonly settings: SelfDriveSettingsFacade) {}

  /** iOS / 管理台：按国家码拉 Destination Pack capabilities（免登录） */
  @Public()
  @Get('self-drive/capabilities')
  @ApiOperation({
    summary: '按国家码查询自驾能力包',
    description: 'iOS 用 countryCode 决定展示哪些设置项；未知国家返回保守 NONE 默认。',
  })
  @ApiQuery({ name: 'countryCode', required: true, example: 'IS' })
  getCapabilities(@Query('countryCode') countryCode: string) {
    if (!countryCode?.trim()) {
      return errorResponse(ErrorCode.VALIDATION_ERROR, 'countryCode is required');
    }
    return successResponse(this.settings.getCapabilities(countryCode));
  }

  @Public()
  @Get('trips/admin/:tripId/self-drive/driving-settings')
  @ApiOperation({ summary: '管理端：读取行程自驾设置' })
  @ApiParam({ name: 'tripId' })
  async getAdmin(@Param('tripId') tripId: string) {
    try {
      const data = await this.settings.getAdmin(tripId);
      return successResponse(data);
    } catch (e) {
      if (e instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, e.message);
      }
      const message = e instanceof Error ? e.message : 'admin self-drive get failed';
      return errorResponse(ErrorCode.INTERNAL_ERROR, message);
    }
  }

  @Public()
  @Patch('trips/admin/:tripId/self-drive/driving-settings')
  @ApiOperation({ summary: '管理端：更新行程自驾设置' })
  @ApiParam({ name: 'tripId' })
  async patchAdmin(
    @Param('tripId') tripId: string,
    @Body() body: PatchIcelandSelfDriveDrivingSettingsDto,
  ) {
    try {
      const data = await this.settings.patchAdmin(tripId, body);
      return successResponse(data);
    } catch (e) {
      if (e instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, e.message);
      }
      const message = e instanceof Error ? e.message : 'admin self-drive patch failed';
      return errorResponse(ErrorCode.INTERNAL_ERROR, message);
    }
  }
}
