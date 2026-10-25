import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { QWeatherService } from './qweather.service';

@ApiTags('QWeather')
@Controller('qweather')
@Public()
export class QWeatherController {
  constructor(private readonly qweather: QWeatherService) {}

  @Get('health')
  @ApiOperation({ summary: '和风天气健康检查' })
  health() {
    return {
      status: 'ok',
      service: 'QWeatherService',
      available: this.qweather.isServiceAvailable(),
      api: 'QWeather',
    };
  }

  @Get('lookup')
  @ApiOperation({ summary: '城市查询' })
  @ApiQuery({ name: 'location', example: '北京' })
  @ApiQuery({ name: 'range', required: false, example: 'cn' })
  async lookup(
    @Query('location') location: string,
    @Query('range') range?: string,
  ) {
    if (!location?.trim()) {
      return { error: 'location 参数必填' };
    }
    const results = await this.qweather.lookupCity(location, {
      range: range || 'cn',
    });
    return { source: 'qweather', results };
  }

  @Get('now')
  @ApiOperation({ summary: '实时天气' })
  @ApiQuery({ name: 'location', description: 'LocationID 或 经度,纬度', example: '101010100' })
  async now(@Query('location') location: string) {
    if (!location?.trim()) {
      return { error: 'location 参数必填' };
    }
    return await this.qweather.getNow(location);
  }

  @Get('7d')
  @ApiOperation({ summary: '7 日预报' })
  @ApiQuery({ name: 'location', example: '101010100' })
  async daily7d(@Query('location') location: string) {
    if (!location?.trim()) {
      return { error: 'location 参数必填' };
    }
    const daily = await this.qweather.getDaily7d(location);
    return { source: 'qweather', daily };
  }

  @Get('warning')
  @ApiOperation({ summary: '天气预警' })
  @ApiQuery({ name: 'location', example: '101010100' })
  async warning(@Query('location') location: string) {
    if (!location?.trim()) {
      return { error: 'location 参数必填' };
    }
    const warnings = await this.qweather.getWarningNow(location);
    return { source: 'qweather', warnings };
  }

  @Get('snapshot')
  @ApiOperation({ summary: '城市快照：lookup + now + 7d + warning' })
  @ApiQuery({ name: 'q', description: '城市名 / LocationID / 经度,纬度', example: '上海' })
  async snapshot(@Query('q') q: string) {
    if (!q?.trim()) {
      return { error: 'q 参数必填' };
    }
    return await this.qweather.getSnapshot(q);
  }
}
