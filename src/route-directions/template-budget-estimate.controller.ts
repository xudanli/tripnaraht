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
import { UpsertTemplateBudgetEstimateDto } from './dto/upsert-template-budget-estimate.dto';
import { RouteBudgetEstimateService } from './services/route-budget-estimate.service';

function parseBooleanQueryParam(value?: string): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return undefined;
}

/**
 * 从原始 body 重建 DTO，避免 global ValidationPipe(whitelist + implicitConversion)
 * 把 dayBudgets 嵌套对象弄坏。
 */
function buildUpsertDto(body: any): UpsertTemplateBudgetEstimateDto {
  const src = body && typeof body === 'object' ? body : {};
  const dto = new UpsertTemplateBudgetEstimateDto();
  if (src.countryCode !== undefined) dto.countryCode = src.countryCode;
  if (src.currency !== undefined) dto.currency = src.currency;
  if (src.partySize !== undefined) dto.partySize = Number(src.partySize);
  if (src.vehicleType !== undefined) dto.vehicleType = src.vehicleType;
  if (src.nameCN !== undefined) dto.nameCN = src.nameCN;
  if (src.nameEN !== undefined) dto.nameEN = src.nameEN;
  if (src.version !== undefined) dto.version = src.version;
  if (src.isActive !== undefined) dto.isActive = Boolean(src.isActive);
  if (src.assumptions !== undefined) dto.assumptions = src.assumptions;
  dto.dayBudgets = Array.isArray(src.dayBudgets)
    ? src.dayBudgets.map((item: any) =>
        item && typeof item === 'object' && !Array.isArray(item) ? { ...item } : item,
      )
    : (src.dayBudgets as any);
  return dto;
}

@ApiTags('RouteTemplateBudgetEstimate')
@Controller('route-directions/templates/:templateId/budget-estimate')
export class TemplateBudgetEstimateController {
  private readonly logger = new Logger(TemplateBudgetEstimateController.name);

  constructor(
    private readonly budgetEstimateService: RouteBudgetEstimateService,
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
    summary: '按模板获取预算估算',
    description: '未绑定返回 data: null',
  })
  @ApiParam({ name: 'templateId', description: '路线模板 ID', type: Number })
  @ApiResponse({ status: 200, description: '有则返回预算，无则 data=null' })
  async getByTemplate(
    @Param('templateId', ParseIntPipe) templateId: number,
  ) {
    try {
      const result =
        await this.budgetEstimateService.findByRouteTemplateId(templateId);
      return successResponse(result);
    } catch (error) {
      return this.handleError(
        error,
        'Failed to get budget estimate by template',
      );
    }
  }

  @Public()
  @Put()
  @ApiOperation({
    summary: '按模板 upsert 预算估算',
    description: '有则更新，无则创建；dayBudgets 按天写入门票/油费/充电/停车/住宿等',
  })
  @ApiParam({ name: 'templateId', description: '路线模板 ID', type: Number })
  async upsertByTemplate(
    @Param('templateId', ParseIntPipe) templateId: number,
    @Body() body: any,
  ) {
    try {
      const dto = buildUpsertDto(body || {});
      const result = await this.budgetEstimateService.upsertByRouteTemplateId(
        templateId,
        dto,
      );
      return successResponse(result);
    } catch (error) {
      return this.handleError(
        error,
        'Failed to upsert budget estimate by template',
      );
    }
  }

  @Public()
  @Delete()
  @ApiOperation({
    summary: '解绑并删除/停用模板预算估算',
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
        await this.budgetEstimateService.unbindByRouteTemplateId(templateId, {
          hard: parseBooleanQueryParam(hard) === true,
        });
      return successResponse(result);
    } catch (error) {
      return this.handleError(
        error,
        'Failed to unbind budget estimate by template',
      );
    }
  }
}
