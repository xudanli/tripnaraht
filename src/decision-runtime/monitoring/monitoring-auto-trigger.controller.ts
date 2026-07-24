import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../common/dto/standard-response.dto';
import { MonitoringAutoTriggerService } from './monitoring-auto-trigger.service';
import type { RealtimeChangeLike } from './utils/affected-trip-lookup.util';

@ApiTags('trip-monitoring')
@Public()
@Controller('monitoring')
export class MonitoringAutoTriggerController {
  constructor(private readonly autoTrigger: MonitoringAutoTriggerService) {}

  @Post('trigger-for-changes')
  @ApiOperation({
    summary: 'S3 — 根据实时变化自动扫描受影响行程（道路封闭 / 天气预警）',
  })
  async triggerForChanges(
    @Body()
    body: {
      changes: RealtimeChangeLike[];
      dayIndex?: number;
    },
  ) {
    try {
      const data = await this.autoTrigger.scanForChanges(body.changes ?? [], {
        dayIndex: body.dayIndex,
      });
      return successResponse(data);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return errorResponse(ErrorCode.INTERNAL_ERROR, message);
    }
  }
}
