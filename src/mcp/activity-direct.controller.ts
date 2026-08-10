import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { ActivityDirectService } from './activity-direct.service';

@ApiTags('activity-direct')
@Controller('activity-direct')
export class ActivityDirectController {
  constructor(private readonly activity: ActivityDirectService) {}

  @Public()
  @Get('health')
  @ApiOperation({ summary: '活动预订 Direct 健康检查' })
  health() {
    return {
      ok: true,
      service: 'activity-direct',
      browserbase_available: this.activity.browserbaseReady(),
      catalog_size: this.activity.listCatalog().length,
    };
  }

  @Public()
  @Get('catalog')
  @ApiOperation({ summary: '静态活动预订目录' })
  catalog() {
    return { items: this.activity.listCatalog() };
  }

  @Public()
  @Post('search')
  @ApiOperation({ summary: '搜索活动预订（Browserbase 探页 + 目录回落）' })
  async search(
    @Body()
    body: {
      query?: string;
      limit?: number;
      date?: string;
    },
  ) {
    return this.activity.searchActivities({
      query: body?.query,
      limit: body?.limit,
      date: body?.date,
    });
  }
}
