import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { successResponse } from '../common/dto/standard-response.dto';
import {
  HikingDemoPreviewQueryDto,
  TrailPlanPreviewBodyDto,
} from './dto/hiking-demo-preview.dto';
import { HikingDemoService } from './hiking-demo.service';
import { TrailPlanningAdapter } from '../trips/decision/adapters/trail-planning.adapter';

@ApiTags('Hiking Demo (Phase 1–2)')
@Controller('demo/hiking')
export class HikingDemoController {
  constructor(
    private readonly hikingDemo: HikingDemoService,
    private readonly trailPlanning: TrailPlanningAdapter,
  ) {}

  @Public()
  @Get('laugavegur')
  @ApiOperation({
    summary: 'Laugavegur 样板间 — 路线方向快照',
    description: '返回 IS_LAUGAVEGUR fixture、日骨架、补给锚点与 polyline，不触发决策引擎。',
  })
  getLaugavegurSnapshot() {
    return successResponse(this.hikingDemo.getLaugavegurSnapshot());
  }

  @Public()
  @Get('laugavegur/preview')
  @ApiOperation({ summary: 'Laugavegur 完整预览（GET）' })
  @ApiQuery({ name: 'longestHike', required: false, type: Number })
  @ApiQuery({ name: 'useCachedProfileFallback', required: false, type: Boolean })
  async getLaugavegurPreview(@Query() query: HikingDemoPreviewQueryDto) {
    const data = await this.hikingDemo.buildLaugavegurPreview({
      longestHike: query.longestHike,
      useCachedProfileFallback: query.useCachedProfileFallback,
    });
    return successResponse(data);
  }

  @Public()
  @Post('laugavegur/preview')
  @ApiOperation({ summary: 'Laugavegur 完整预览（POST）' })
  async postLaugavegurPreview(@Body() body: HikingDemoPreviewQueryDto) {
    const data = await this.hikingDemo.buildLaugavegurPreview({
      longestHike: body.longestHike,
      useCachedProfileFallback: body.useCachedProfileFallback,
    });
    return successResponse(data);
  }

  @Public()
  @Post('trail-plan/preview')
  @ApiOperation({ summary: 'Trail 段编排预览（Phase 2 POC）' })
  @ApiBody({ type: TrailPlanPreviewBodyDto })
  async trailPlanPreview(@Body() body: TrailPlanPreviewBodyDto) {
    const preview = await this.trailPlanning.buildPreview({
      routeDirectionName: body.routeDirectionName,
      longestHike: body.longestHike,
      placeIds: body.placeIds ?? [],
    });
    return successResponse(preview);
  }
}
