import {
  Controller,
  Get,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../../common/dto/standard-response.dto';
import { InTripBetaMetricsService } from '../services/in-trip-beta-metrics.service';
import { isInTripExecutionEnabled } from '../utils/in-trip-config.util';

@ApiTags('trip-in-trip-beta')
@Public()
@Controller('trips/in-trip/beta')
export class TripInTripBetaController {
  constructor(private readonly metrics: InTripBetaMetricsService) {}

  @Get('metrics')
  @ApiOperation({ summary: '冰岛内测验收指标仪表盘（全局 cohort）' })
  @ApiQuery({ name: 'destination', required: false, description: '目的地过滤，如 Iceland' })
  async getMetrics(@Query('destination') destination?: string) {
    try {
      if (!isInTripExecutionEnabled()) {
        throw new ServiceUnavailableException('行中执行模块未启用');
      }
      return successResponse(await this.metrics.getCohortMetrics(destination));
    } catch (e) {
      if (e instanceof ServiceUnavailableException) {
        return errorResponse(ErrorCode.BUSINESS_ERROR, e.message);
      }
      throw e;
    }
  }
}
