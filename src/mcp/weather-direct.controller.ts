import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { WeatherDirectService } from './weather-direct.service';

@ApiTags('Weather Direct')
@Controller('api/weather-direct')
export class WeatherDirectController {
  constructor(private readonly weatherDirectService: WeatherDirectService) {}

  @Get('health')
  @ApiOperation({ summary: '健康检查' })
  health() {
    return {
      status: 'ok',
      service: 'Weather Direct Service',
      available: this.weatherDirectService.isServiceAvailable(),
      api: 'Open-Meteo API',
    };
  }

  @Get('current')
  @ApiOperation({ summary: '获取当前天气' })
  @ApiQuery({ name: 'city', description: '城市名称', example: 'New York' })
  async getCurrentWeather(@Query('city') city: string) {
    if (!city) {
      return { error: 'City parameter is required' };
    }
    return await this.weatherDirectService.getCurrentWeather(city);
  }

  @Get('forecast')
  @ApiOperation({ summary: '获取天气预报' })
  @ApiQuery({ name: 'city', description: '城市名称', example: 'Tokyo' })
  @ApiQuery({ name: 'start_date', description: '开始日期 (YYYY-MM-DD)', example: '2026-02-07' })
  @ApiQuery({ name: 'end_date', description: '结束日期 (YYYY-MM-DD)', example: '2026-02-10' })
  async getWeatherByDatetimeRange(
    @Query('city') city: string,
    @Query('start_date') startDate: string,
    @Query('end_date') endDate: string,
  ) {
    if (!city || !startDate || !endDate) {
      return { error: 'City, start_date, and end_date parameters are required' };
    }
    return await this.weatherDirectService.getWeatherByDatetimeRange(city, startDate, endDate);
  }

  @Get('datetime')
  @ApiOperation({ summary: '获取当前日期时间' })
  @ApiQuery({ name: 'timezone', description: '时区', example: 'Asia/Shanghai', required: false })
  async getCurrentDateTime(@Query('timezone') timezone?: string) {
    return await this.weatherDirectService.getCurrentDateTime(timezone);
  }
}
