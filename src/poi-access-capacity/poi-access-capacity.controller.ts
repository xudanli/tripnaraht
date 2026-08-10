import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { successResponse } from '../common/dto/standard-response.dto';
import { PoiAccessCapacityService } from './poi-access-capacity.service';
import { PoiExecutionFeedbackService } from './services/poi-execution-feedback.service';
import { IcelandPoiAccessSyncService } from './services/iceland-poi-access-sync.service';
import { IcelandCapacitySyncService } from './services/iceland-capacity-sync.service';
import { PoiExecutionFeedbackDto } from './dto/poi-execution-feedback.dto';

@ApiTags('POI Access & Capacity')
@Public()
@Controller('poi-access-capacity')
export class PoiAccessCapacityController {
  constructor(
    private readonly service: PoiAccessCapacityService,
    private readonly feedbackService: PoiExecutionFeedbackService,
    private readonly syncService: IcelandPoiAccessSyncService,
    private readonly capacitySync: IcelandCapacitySyncService,
  ) {}

  @Get('evaluate')
  @ApiOperation({
    summary: '评估 POI 准入与容量结论',
    description: '返回能不能去 / 是否合适 / Plan B（冰岛 MVP）',
  })
  @ApiQuery({ name: 'poiId', example: 'is.gullfoss' })
  @ApiQuery({ name: 'dateISO', example: '2026-07-15' })
  @ApiQuery({ name: 'arrivalTime', required: false, example: '11:00' })
  @ApiQuery({ name: 'vehicleType', required: false, example: 'SUV' })
  async evaluate(
    @Query('poiId') poiId: string,
    @Query('dateISO') dateISO: string,
    @Query('arrivalTime') arrivalTime?: string,
    @Query('vehicleType') vehicleType?: string,
    @Query('poiName') poiName?: string,
  ) {
    return this.service.evaluate({
      poiId,
      poiName,
      dateISO,
      arrivalTime,
      vehicleType,
    });
  }

  @Get('rules')
  @ApiOperation({ summary: '查询 POI 准入规则' })
  @ApiQuery({ name: 'poiId', example: 'is.skaftafell' })
  async getRules(@Query('poiId') poiId: string) {
    const rules = await this.service.getRulesForPoiSlugs([poiId]);
    const overrides = await this.service.getStatusOverridesForPoiSlugs(
      [poiId],
      new Date().toISOString().slice(0, 10),
    );
    return { poiId, rules, statusOverrides: overrides };
  }

  @Post('feedback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '提交行中 POI 执行反馈（匿名校准拥堵预测）' })
  async submitFeedback(@Body() body: PoiExecutionFeedbackDto) {
    const data = await this.feedbackService.recordAndAggregate(body);
    return successResponse(data);
  }

  @Post('sync/vatnajokull')
  @ApiOperation({ summary: '手动触发 Vatnajökull 步道状态同步' })
  async syncVatnajokull() {
    return this.syncService.syncVatnajokullTrailStatus();
  }

  @Post('sync/all')
  @ApiOperation({ summary: '手动触发全部官方状态同步（Vatnajökull + Dyrhólaey）' })
  async syncAll() {
    return this.syncService.syncAll();
  }

  @Post('sync/capacity')
  @ApiOperation({ summary: '手动触发 Parka/Bókun 库存快照同步' })
  async syncCapacity() {
    return this.capacitySync.syncFromSeedFile();
  }
}
