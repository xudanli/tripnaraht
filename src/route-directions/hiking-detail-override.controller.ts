import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { successResponse } from '../common/dto/standard-response.dto';
import { HikingDetailOverrideService } from '../hiking-demo/services/hiking-detail-override.service';
import type { HikingDetailOverrideV1 } from './types/hiking-detail-override.types';

@ApiTags('HikingDetailOverride')
@Controller('route-directions/:routeDirectionId/hiking-detail-override')
export class HikingDetailOverrideController {
  constructor(private readonly overrideService: HikingDetailOverrideService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: '读取 hikingDetailOverride' })
  @ApiParam({ name: 'routeDirectionId', type: Number })
  async getOverride(@Param('routeDirectionId', ParseIntPipe) routeDirectionId: number) {
    return successResponse(await this.overrideService.getOverride(routeDirectionId));
  }

  @Public()
  @Put()
  @ApiOperation({ summary: '整块替换 hikingDetailOverride（幂等）' })
  @ApiBody({ description: 'HikingDetailOverrideV1' })
  async putOverride(
    @Param('routeDirectionId', ParseIntPipe) routeDirectionId: number,
    @Body() body: HikingDetailOverrideV1,
  ) {
    return successResponse(
      await this.overrideService.putOverride(routeDirectionId, body),
    );
  }

  @Public()
  @Patch('risk')
  @ApiOperation({ summary: 'PATCH 风险与约束块' })
  async patchRisk(
    @Param('routeDirectionId', ParseIntPipe) routeDirectionId: number,
    @Body()
    body: Pick<HikingDetailOverrideV1, 'riskMatrix' | 'hardGates' | 'emergency'>,
  ) {
    return successResponse(
      await this.overrideService.patchRisk(routeDirectionId, body),
    );
  }

  @Public()
  @Patch('logistics')
  @ApiOperation({ summary: 'PATCH 后勤与补给块' })
  async patchLogistics(
    @Param('routeDirectionId', ParseIntPipe) routeDirectionId: number,
    @Body()
    body: Pick<
      HikingDetailOverrideV1,
      'access' | 'supplyPois' | 'shelters' | 'timeWindow'
    >,
  ) {
    return successResponse(
      await this.overrideService.patchLogistics(routeDirectionId, body),
    );
  }

  @Public()
  @Patch('prep')
  @ApiOperation({ summary: 'PATCH 准备清单与许可模板（运营可配）' })
  async patchPrep(
    @Param('routeDirectionId', ParseIntPipe) routeDirectionId: number,
    @Body()
    body: Pick<HikingDetailOverrideV1, 'checklistTemplates' | 'permits'>,
  ) {
    return successResponse(
      await this.overrideService.patchPrep(routeDirectionId, body),
    );
  }

  @Public()
  @Get('prep-preview')
  @ApiOperation({ summary: '预览 HikePlan prep 模板（合并 override 后，不落库）' })
  @ApiQuery({ name: 'longestHike', required: false, type: Number })
  async prepPreview(
    @Param('routeDirectionId', ParseIntPipe) routeDirectionId: number,
    @Query('longestHike') longestHike?: string,
  ) {
    const level =
      longestHike != null && longestHike !== ''
        ? Math.min(4, Math.max(0, parseInt(longestHike, 10)))
        : undefined;
    return successResponse(
      await this.overrideService.previewPrepTemplate(routeDirectionId, {}, level),
    );
  }

  @Public()
  @Delete('prep')
  @ApiOperation({ summary: '删除准备清单与许可 override（回退代码种子）' })
  async deletePrep(@Param('routeDirectionId', ParseIntPipe) routeDirectionId: number) {
    return successResponse(await this.overrideService.deletePrepBlock(routeDirectionId));
  }

  @Public()
  @Patch('alternatives')
  @ApiOperation({ summary: 'PATCH 替代与修复块（Phase 2）' })
  async patchAlternatives(
    @Param('routeDirectionId', ParseIntPipe) routeDirectionId: number,
    @Body() body: Pick<HikingDetailOverrideV1, 'alternatives'>,
  ) {
    return successResponse(
      await this.overrideService.patchAlternatives(routeDirectionId, body),
    );
  }

  @Public()
  @Delete()
  @ApiOperation({ summary: '删除整个 hikingDetailOverride' })
  async deleteOverride(@Param('routeDirectionId', ParseIntPipe) routeDirectionId: number) {
    return successResponse(await this.overrideService.deleteOverride(routeDirectionId));
  }

  @Public()
  @Delete('risk')
  @ApiOperation({ summary: '删除风险与约束块字段' })
  async deleteRisk(@Param('routeDirectionId', ParseIntPipe) routeDirectionId: number) {
    return successResponse(await this.overrideService.deleteRiskBlock(routeDirectionId));
  }

  @Public()
  @Delete('logistics')
  @ApiOperation({ summary: '删除后勤与补给块字段' })
  async deleteLogistics(@Param('routeDirectionId', ParseIntPipe) routeDirectionId: number) {
    return successResponse(await this.overrideService.deleteLogisticsBlock(routeDirectionId));
  }

  @Public()
  @Post('preview')
  @ApiOperation({ summary: '预览合并后的 hikingDetail（不持久化）' })
  @ApiQuery({ name: 'longestHike', required: false, type: Number })
  async preview(
    @Param('routeDirectionId', ParseIntPipe) routeDirectionId: number,
    @Body() body: HikingDetailOverrideV1,
    @Query('longestHike') longestHike?: string,
  ) {
    const level =
      longestHike != null && longestHike !== ''
        ? Math.min(4, Math.max(0, parseInt(longestHike, 10)))
        : undefined;
    return successResponse(
      await this.overrideService.previewMergedDetail(routeDirectionId, body, level),
    );
  }
}
