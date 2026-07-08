import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, type CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { successResponse } from '../common/dto/standard-response.dto';
import { ConfirmPoiResolutionDto } from './dto/confirm-poi.dto';
import { ResolvePoiBatchDto, ResolvePoiDto } from './dto/resolve-poi.dto';
import { CanonicalPoiResolutionService } from './services/canonical-poi-resolution.service';
import { PoiAliasLearningService } from './services/poi-alias-learning.service';

@ApiTags('Canonical POI Resolution')
@Controller('poi')
export class CanonicalPoiResolutionController {
  constructor(
    private readonly resolution: CanonicalPoiResolutionService,
    private readonly learning: PoiAliasLearningService,
  ) {}

  @Public()
  @Post('resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '解析单个自然语言 POI 为 Canonical POI',
    description: 'CPRE — Exact + Alias match，返回 Travel Primary Key (is.*) + evidence',
  })
  async resolve(@Body() body: ResolvePoiDto) {
    const data = await this.resolution.resolve(body);
    return successResponse(data);
  }

  @Public()
  @Post('resolve/batch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '批量解析 POI（Planner 生成结束后调用）' })
  async resolveBatch(@Body() body: ResolvePoiBatchDto) {
    const data = await this.resolution.resolveBatch(body.items);
    return successResponse(data);
  }

  @Public()
  @Get('canonical/:poiId')
  @ApiOperation({ summary: '按 Travel Primary Key 查询 Canonical POI' })
  @ApiParam({ name: 'poiId', example: 'is.blue_lagoon' })
  async getCanonical(@Param('poiId') poiId: string) {
    const data = this.resolution.getCanonicalPoi(poiId);
    return successResponse(data);
  }

  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '用户确认 POI 解析（Learning Flywheel）',
    description: '写入 USER_CONFIRMED 别名；下次同文本直接 ALIAS 命中',
  })
  async confirm(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: ConfirmPoiResolutionDto,
  ) {
    const data = await this.learning.confirmSelection({
      queryName: body.queryName,
      selectedPoiId: body.selectedPoiId,
      countryCode: body.countryCode,
      locale: body.locale,
      resolutionLogId: body.resolutionLogId,
      userId: user.userId,
    });
    return successResponse(data);
  }
}
