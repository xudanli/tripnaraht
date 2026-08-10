/**
 * Trip-scoped driving settings BFF.
 * Paths: /api/iceland-self-drive/trips/:tripId/driving-settings*
 *
 * Memory Trip Shells (`trip_*`) use the same soft-auth as Preview
 * (JWT or x-owner-id). Prisma trips still require JWT.
 */

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Public } from '../../auth/decorators/public.decorator';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../auth/decorators/current-user.decorator';
import { successResponse } from '../../common/dto/standard-response.dto';
import {
  PatchIcelandSelfDriveDrivingSettingsDto,
  PreviewDrivingSettingsImpactDto,
  PreviewVehicleImpactDto,
  ReevaluateDrivingSettingsDto,
} from './dto/patch-driving-settings.dto';
import { IcelandSelfDriveDrivingSettingsService } from './services/iceland-self-drive-driving-settings.service';
import { IcelandShellDrivingSettingsService } from './services/iceland-shell-driving-settings.service';
import { isMemoryShellTripId } from './utils/iceland-memory-shell-trip-id.util';
import { resolveIcelandShellOwnerId } from './utils/iceland-shell-owner.util';

type MulterFile = {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
  size?: number;
};

@ApiTags('iceland-self-drive')
@ApiBearerAuth()
@Controller('iceland-self-drive/trips')
export class IcelandSelfDriveDrivingSettingsController {
  constructor(
    private readonly drivingSettings: IcelandSelfDriveDrivingSettingsService,
    private readonly shellDrivingSettings: IcelandShellDrivingSettingsService,
  ) {}

  @Public()
  @Get(':tripId/driving-settings')
  @ApiOperation({
    summary:
      '自驾设置聚合（Prisma trip 需 JWT；memory shell 与 Preview 同鉴权）',
  })
  @ApiHeader({ name: 'x-owner-id', required: false })
  async getDrivingSettings(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Headers('x-owner-id') ownerHeader: string | undefined,
    @Param('tripId') tripId: string,
  ) {
    if (isMemoryShellTripId(tripId)) {
      const ownerId = resolveIcelandShellOwnerId(user, ownerHeader);
      const data = this.shellDrivingSettings.get(ownerId, tripId);
      return successResponse(data);
    }
    const userId = requireJwtUserId(user);
    const data = await this.drivingSettings.get(userId, tripId);
    return successResponse(data);
  }

  @Public()
  @Patch(':tripId/driving-settings')
  @ApiOperation({
    summary:
      '部分更新自驾设置（shell：bump context + 重算 Preview；Prisma：落库）',
  })
  @ApiHeader({ name: 'x-owner-id', required: false })
  async patchDrivingSettings(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Headers('x-owner-id') ownerHeader: string | undefined,
    @Param('tripId') tripId: string,
    @Body() body: PatchIcelandSelfDriveDrivingSettingsDto,
  ) {
    if (isMemoryShellTripId(tripId)) {
      const ownerId = resolveIcelandShellOwnerId(user, ownerHeader);
      const data = await this.shellDrivingSettings.patch(ownerId, tripId, body);
      return successResponse(data);
    }
    const userId = requireJwtUserId(user);
    const data = await this.drivingSettings.patch(userId, tripId, body);
    return successResponse(data);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':tripId/driving-settings/preview-impact')
  @ApiOperation({ summary: '通用草稿影响预览（车辆/节奏/保险/燃油）' })
  async previewDrivingSettingsImpact(
    @CurrentUser() user: CurrentUserPayload,
    @Param('tripId') tripId: string,
    @Body() body: PreviewDrivingSettingsImpactDto,
  ) {
    const data = await this.drivingSettings.previewImpact(
      user.userId,
      tripId,
      body,
    );
    return successResponse(data);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':tripId/driving-settings/reevaluate')
  @ApiOperation({ summary: '保存后触发路线重评 / 生成调整草案' })
  async reevaluateDrivingSettings(
    @CurrentUser() user: CurrentUserPayload,
    @Param('tripId') tripId: string,
    @Body() body: ReevaluateDrivingSettingsDto,
  ) {
    const data = await this.drivingSettings.reevaluate(
      user.userId,
      tripId,
      body,
    );
    return successResponse(data);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':tripId/driving-settings/vehicle/preview-impact')
  @ApiOperation({ summary: '预览车辆草稿对路线的影响摘要（专用别名）' })
  async previewVehicleImpact(
    @CurrentUser() user: CurrentUserPayload,
    @Param('tripId') tripId: string,
    @Body() body: PreviewVehicleImpactDto,
  ) {
    const data = await this.drivingSettings.previewImpact(
      user.userId,
      tripId,
      body,
    );
    return successResponse(data);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':tripId/driving-settings/vehicle/documents')
  @ApiOperation({
    summary: '上传订单/合同截图或 PDF，返回可合并 vehicle 草稿（stub OCR）',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        sourceHint: {
          type: 'string',
          enum: ['order_ocr', 'contract_ocr'],
        },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 12 * 1024 * 1024 } }),
  )
  async uploadVehicleDocument(
    @CurrentUser() user: CurrentUserPayload,
    @Param('tripId') tripId: string,
    @UploadedFile() file: MulterFile | undefined,
    @Body('sourceHint') sourceHint?: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'multipart field "file" is required',
      });
    }
    const hint =
      sourceHint === 'contract_ocr' || sourceHint === 'order_ocr'
        ? sourceHint
        : undefined;
    const data = await this.drivingSettings.uploadVehicleDocument(
      user.userId,
      tripId,
      {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
        sourceHint: hint,
      },
    );
    return successResponse(data);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':tripId/driving-settings/vehicle/documents/:docId')
  @ApiOperation({ summary: '查询订单/合同识别状态与草稿结果' })
  async getVehicleDocument(
    @CurrentUser() user: CurrentUserPayload,
    @Param('tripId') tripId: string,
    @Param('docId') docId: string,
  ) {
    const data = await this.drivingSettings.getVehicleDocument(
      user.userId,
      tripId,
      docId,
    );
    return successResponse(data);
  }
}

function requireJwtUserId(user?: CurrentUserPayload): string {
  if (!user?.userId) {
    throw new UnauthorizedException({
      code: 'UNAUTHORIZED',
      message: 'Authentication required for prisma trip driving-settings',
    });
  }
  return user.userId;
}
