import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  NotFoundException,
  Param,
  ParseIntPipe,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../common/dto/standard-response.dto';
import { UpsertTemplatePackingChecklistDto } from './dto/upsert-template-packing-checklist.dto';
import { RoutePackingChecklistService } from './services/route-packing-checklist.service';

function parseBooleanQueryParam(value?: string): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return undefined;
}

@ApiTags('RouteTemplatePackingChecklist')
@Controller('route-directions/templates/:templateId/packing-checklist')
export class TemplatePackingChecklistController {
  private readonly logger = new Logger(TemplatePackingChecklistController.name);

  constructor(
    private readonly packingChecklistService: RoutePackingChecklistService,
  ) {}

  private handleError(error: unknown, fallbackMessage: string) {
    if (error instanceof NotFoundException) {
      return errorResponse(ErrorCode.NOT_FOUND, error.message, {
        statusCode: 404,
      });
    }
    if (error instanceof BadRequestException) {
      return errorResponse(ErrorCode.VALIDATION_ERROR, error.message, {
        statusCode: 400,
      });
    }
    this.logger.error(fallbackMessage, error);
    return errorResponse(ErrorCode.INTERNAL_ERROR, fallbackMessage, {
      originalError: error instanceof Error ? error.message : String(error),
    });
  }

  @Public()
  @Get()
  @ApiOperation({
    summary: '按模板获取打包清单',
    description: '未绑定返回 data: null（便于管理端补全）',
  })
  @ApiParam({ name: 'templateId', description: '路线模板 ID', type: Number })
  @ApiResponse({ status: 200, description: '有则返回清单，无则 data=null' })
  async getByTemplate(
    @Param('templateId', ParseIntPipe) templateId: number,
  ) {
    try {
      const result =
        await this.packingChecklistService.findByRouteTemplateId(templateId);
      return successResponse(result);
    } catch (error) {
      return this.handleError(
        error,
        'Failed to get packing checklist by template',
      );
    }
  }

  @Public()
  @Put()
  @ApiOperation({
    summary: '按模板 upsert 打包清单',
    description: '有则更新，无则创建并硬绑定 routeTemplateId',
  })
  @ApiParam({ name: 'templateId', description: '路线模板 ID', type: Number })
  async upsertByTemplate(
    @Param('templateId', ParseIntPipe) templateId: number,
    @Body() dto: UpsertTemplatePackingChecklistDto,
  ) {
    try {
      const result = await this.packingChecklistService.upsertByRouteTemplateId(
        templateId,
        dto,
      );
      return successResponse(result);
    } catch (error) {
      return this.handleError(
        error,
        'Failed to upsert packing checklist by template',
      );
    }
  }

  @Public()
  @Delete()
  @ApiOperation({
    summary: '解绑并删除/停用模板打包清单',
    description: '默认软删；?hard=true 物理删除',
  })
  @ApiParam({ name: 'templateId', description: '路线模板 ID', type: Number })
  @ApiQuery({ name: 'hard', required: false, type: Boolean })
  async unbindByTemplate(
    @Param('templateId', ParseIntPipe) templateId: number,
    @Query('hard') hard?: string,
  ) {
    try {
      const result =
        await this.packingChecklistService.unbindByRouteTemplateId(templateId, {
          hard: parseBooleanQueryParam(hard) === true,
        });
      return successResponse(result);
    } catch (error) {
      return this.handleError(
        error,
        'Failed to unbind packing checklist by template',
      );
    }
  }
}
