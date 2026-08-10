import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Public } from '../../auth/decorators/public.decorator';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../auth/decorators/current-user.decorator';
import { successResponse } from '../../common/dto/standard-response.dto';
import { CreateIcelandSelfDriveTripDto } from './dto/create-iceland-self-drive-trip.dto';
import {
  PatchIcelandSelfDriveDrivingSettingsDto,
  PreviewDrivingSettingsImpactDto,
  PreviewVehicleImpactDto,
  ReevaluateDrivingSettingsDto,
} from './dto/patch-driving-settings.dto';
import { UpsertIcelandSelfDriveDraftDto } from './dto/upsert-iceland-self-drive-draft.dto';
import { IcelandSelfDriveCreateService } from './services/iceland-self-drive-create.service';
import { IcelandSelfDriveBootstrapService } from './services/iceland-self-drive-bootstrap.service';
import { IcelandSelfDriveDrivingSettingsService } from './services/iceland-self-drive-driving-settings.service';
import { IcelandSelfDriveCatalogService } from './services/iceland-self-drive-catalog.service';
import { IcelandSelfDriveDraftService } from './services/iceland-self-drive-draft.service';
import { IcelandSelfDriveBookablePlacesService } from './services/iceland-self-drive-bookable-places.service';
import {
  ICELAND_SELF_DRIVE_BOOKING_KINDS,
  type IcelandSelfDriveBookingKind,
} from './dto/iceland-self-drive-enums';

type MulterFile = {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
  size?: number;
};

@ApiTags('iceland-self-drive')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('iceland-self-drive')
export class IcelandSelfDriveController {
  constructor(
    private readonly createService: IcelandSelfDriveCreateService,
    private readonly bootstrapService: IcelandSelfDriveBootstrapService,
    private readonly drivingSettings: IcelandSelfDriveDrivingSettingsService,
    private readonly catalog: IcelandSelfDriveCatalogService,
    private readonly drafts: IcelandSelfDriveDraftService,
    private readonly bookablePlaces: IcelandSelfDriveBookablePlacesService,
  ) {}

  @Public()
  @Get('regions')
  @ApiOperation({ summary: '想去区域字典 + 封面图（P2；免登录）' })
  listRegions() {
    return successResponse(this.catalog.listRegions());
  }

  @Public()
  @Get('locations')
  @ApiOperation({ summary: '起终点字典（P2；免登录）' })
  listLocations() {
    return successResponse(this.catalog.listLocations());
  }

  @Public()
  @Get('catalog/rental-companies')
  @ApiOperation({ summary: '租车公司字典（避免前端写死；免登录）' })
  listRentalCompanies() {
    return successResponse(this.catalog.listRentalCompanies());
  }

  @Public()
  @Get('catalog/vehicle-classes')
  @ApiOperation({ summary: '车型等级字典（code + 展示名 + 默认属性；免登录）' })
  listVehicleClasses() {
    return successResponse(this.catalog.listVehicleClasses());
  }

  @Get('bookable-places')
  @ApiOperation({
    summary: 'Step3 可预订地点目录（lodging/activity，无 tripId；与规划 Place 同源）',
  })
  @ApiQuery({ name: 'kind', required: true, enum: ICELAND_SELF_DRIVE_BOOKING_KINDS })
  @ApiQuery({ name: 'q', required: false, description: '关键词' })
  @ApiQuery({
    name: 'regionIds',
    required: false,
    description: '逗号分隔 ISD regionId，如 south_coast,golden_circle',
  })
  @ApiQuery({ name: 'limit', required: false, example: 40 })
  async listBookablePlaces(
    @Query('kind') kind: string,
    @Query('q') q?: string,
    @Query('regionIds') regionIdsRaw?: string,
    @Query('limit') limitRaw?: string,
  ) {
    if (!(ICELAND_SELF_DRIVE_BOOKING_KINDS as readonly string[]).includes(kind)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'kind must be lodging | activity',
      });
    }
    const regionIds = regionIdsRaw
      ? regionIdsRaw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;
    const limit = limitRaw ? Number(limitRaw) : undefined;
    const data = await this.bookablePlaces.search({
      kind: kind as IcelandSelfDriveBookingKind,
      q,
      regionIds,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    return successResponse(data);
  }

  @Get('daylight-hint')
  @ApiOperation({ summary: 'Step1 日照/季节提示（P2）' })
  @ApiQuery({ name: 'startDate', required: true, example: '2027-02-10' })
  @ApiQuery({ name: 'endDate', required: true, example: '2027-02-18' })
  getDaylightHint(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return successResponse(this.catalog.getDaylightHint(startDate, endDate));
  }

  @Post('drafts')
  @ApiOperation({ summary: '创建或更新服务端向导草稿（不占用 tripId）' })
  async upsertDraft(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: UpsertIcelandSelfDriveDraftDto,
    @Query('draftId') draftId?: string,
  ) {
    const data = await this.drafts.upsert(user.userId, body, draftId);
    return successResponse(data);
  }

  @Get('drafts')
  @ApiOperation({ summary: '列出当前用户的冰岛自驾草稿' })
  async listDrafts(@CurrentUser() user: CurrentUserPayload) {
    return successResponse(await this.drafts.list(user.userId));
  }

  @Get('drafts/:draftId')
  @ApiOperation({ summary: '恢复服务端草稿' })
  async getDraft(
    @CurrentUser() user: CurrentUserPayload,
    @Param('draftId', ParseUUIDPipe) draftId: string,
  ) {
    return successResponse(await this.drafts.get(user.userId, draftId));
  }

  @Post('trips')
  @ApiOperation({
    summary: '创建冰岛自驾 Trip 并生成初始路线骨架（支持 asyncGeneration）',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async createTrip(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: CreateIcelandSelfDriveTripDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const data = await this.createService.createTrip(
      user.userId,
      body,
      idempotencyKey,
    );
    return successResponse(data);
  }

  @Get('trips/:tripId/bootstrap')
  @ApiOperation({ summary: '结果页 bootstrap：进度 + checklist + generationStatus' })
  async bootstrap(
    @CurrentUser() user: CurrentUserPayload,
    @Param('tripId', ParseUUIDPipe) tripId: string,
  ) {
    const data = await this.bootstrapService.getBootstrap(user.userId, tripId);
    return successResponse(data);
  }

  @Get('trips/:tripId/driving-settings')
  @ApiOperation({ summary: '自驾设置聚合（含扩展 vehicle payload）' })
  async getDrivingSettings(
    @CurrentUser() user: CurrentUserPayload,
    @Param('tripId', ParseUUIDPipe) tripId: string,
  ) {
    const data = await this.drivingSettings.get(user.userId, tripId);
    return successResponse(data);
  }

  @Patch('trips/:tripId/driving-settings')
  @ApiOperation({ summary: '部分更新自驾设置（车辆字段可读写扩展）' })
  async patchDrivingSettings(
    @CurrentUser() user: CurrentUserPayload,
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Body() body: PatchIcelandSelfDriveDrivingSettingsDto,
  ) {
    const data = await this.drivingSettings.patch(user.userId, tripId, body);
    return successResponse(data);
  }

  @Post('trips/:tripId/driving-settings/preview-impact')
  @ApiOperation({ summary: '通用草稿影响预览（车辆/节奏/保险/燃油）' })
  async previewDrivingSettingsImpact(
    @CurrentUser() user: CurrentUserPayload,
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Body() body: PreviewDrivingSettingsImpactDto,
  ) {
    const data = await this.drivingSettings.previewImpact(
      user.userId,
      tripId,
      body,
    );
    return successResponse(data);
  }

  @Post('trips/:tripId/driving-settings/reevaluate')
  @ApiOperation({ summary: '保存后触发路线重评 / 生成调整草案（P1）' })
  async reevaluateDrivingSettings(
    @CurrentUser() user: CurrentUserPayload,
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Body() body: ReevaluateDrivingSettingsDto,
  ) {
    const data = await this.drivingSettings.reevaluate(
      user.userId,
      tripId,
      body,
    );
    return successResponse(data);
  }

  @Post('trips/:tripId/driving-settings/vehicle/preview-impact')
  @ApiOperation({ summary: '预览车辆草稿对路线的影响摘要（专用别名）' })
  async previewVehicleImpact(
    @CurrentUser() user: CurrentUserPayload,
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Body() body: PreviewVehicleImpactDto,
  ) {
    const data = await this.drivingSettings.previewImpact(
      user.userId,
      tripId,
      body,
    );
    return successResponse(data);
  }

  @Post('trips/:tripId/driving-settings/vehicle/documents')
  @ApiOperation({ summary: '上传订单/合同截图或 PDF，返回可合并 vehicle 草稿（P1 stub OCR）' })
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
    @Param('tripId', ParseUUIDPipe) tripId: string,
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

  @Get('trips/:tripId/driving-settings/vehicle/documents/:docId')
  @ApiOperation({ summary: '查询订单/合同识别状态与草稿结果' })
  async getVehicleDocument(
    @CurrentUser() user: CurrentUserPayload,
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Param('docId', ParseUUIDPipe) docId: string,
  ) {
    const data = await this.drivingSettings.getVehicleDocument(
      user.userId,
      tripId,
      docId,
    );
    return successResponse(data);
  }
}
