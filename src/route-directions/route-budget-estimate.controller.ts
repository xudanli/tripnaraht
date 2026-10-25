import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Logger,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
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
import { CreateRouteBudgetEstimateDto } from './dto/create-route-budget-estimate.dto';
import { UpdateRouteBudgetEstimateDto } from './dto/update-route-budget-estimate.dto';
import { QueryRouteBudgetEstimateDto } from './dto/query-route-budget-estimate.dto';
import { RouteBudgetEstimateService } from './services/route-budget-estimate.service';

function parseBooleanQueryParam(value?: string): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return undefined;
}

@ApiTags('RouteBudgetEstimates')
@Controller('route-directions/budget-estimates')
export class RouteBudgetEstimateController {
  private readonly logger = new Logger(RouteBudgetEstimateController.name);

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
    if (error instanceof ConflictException) {
      return errorResponse(ErrorCode.CONFLICT, error.message, {
        statusCode: 409,
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
    summary: '查询路线预算估算列表',
    description: '支持按 routeTemplateId / countryCode / currency / isActive 筛选',
  })
  @ApiResponse({ status: 200, description: '成功返回列表' })
  async list(
    @Query() query: QueryRouteBudgetEstimateDto,
    @Query('isActive') rawIsActive?: string,
  ) {
    try {
      const result = await this.budgetEstimateService.findMany({
        routeTemplateId: query.routeTemplateId,
        countryCode: query.countryCode,
        currency: query.currency,
        isActive: parseBooleanQueryParam(rawIsActive) ?? query.isActive,
        page: query.page,
        limit: query.limit,
      });
      return successResponse(result);
    } catch (error) {
      return this.handleError(error, 'Failed to list budget estimates');
    }
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: '获取路线预算估算详情（含按天明细）' })
  @ApiParam({ name: 'id', description: '预算估算 UUID' })
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    try {
      const result = await this.budgetEstimateService.findById(id);
      return successResponse(result);
    } catch (error) {
      return this.handleError(error, 'Failed to get budget estimate');
    }
  }

  @Public()
  @Post()
  @ApiOperation({
    summary: '创建路线预算估算',
    description: 'routeTemplateId 唯一；dayBudgets 按天含门票/油费/充电/停车/住宿等',
  })
  async create(@Body() body: any) {
    try {
      const src = body && typeof body === 'object' ? body : {};
      const dto = new CreateRouteBudgetEstimateDto();
      dto.routeTemplateId = Number(src.routeTemplateId);
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
            item && typeof item === 'object' && !Array.isArray(item)
              ? { ...item }
              : item,
          )
        : src.dayBudgets;
      const result = await this.budgetEstimateService.create(dto);
      return successResponse(result);
    } catch (error) {
      return this.handleError(error, 'Failed to create budget estimate');
    }
  }

  @Public()
  @Put(':id')
  @ApiOperation({ summary: '局部更新路线预算估算' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: any,
  ) {
    try {
      const src = body && typeof body === 'object' ? body : {};
      const dto = new UpdateRouteBudgetEstimateDto();
      if (src.countryCode !== undefined) dto.countryCode = src.countryCode;
      if (src.currency !== undefined) dto.currency = src.currency;
      if (src.partySize !== undefined) dto.partySize = Number(src.partySize);
      if (src.vehicleType !== undefined) dto.vehicleType = src.vehicleType;
      if (src.nameCN !== undefined) dto.nameCN = src.nameCN;
      if (src.nameEN !== undefined) dto.nameEN = src.nameEN;
      if (src.version !== undefined) dto.version = src.version;
      if (src.isActive !== undefined) dto.isActive = Boolean(src.isActive);
      if (src.assumptions !== undefined) dto.assumptions = src.assumptions;
      if (src.dayBudgets !== undefined) {
        dto.dayBudgets = Array.isArray(src.dayBudgets)
          ? src.dayBudgets.map((item: any) =>
              item && typeof item === 'object' && !Array.isArray(item)
                ? { ...item }
                : item,
            )
          : src.dayBudgets;
      }
      const result = await this.budgetEstimateService.update(id, dto);
      return successResponse(result);
    } catch (error) {
      return this.handleError(error, 'Failed to update budget estimate');
    }
  }

  @Public()
  @Delete(':id')
  @ApiOperation({
    summary: '删除路线预算估算',
    description: '默认软删；?hard=true 物理删除',
  })
  @ApiQuery({ name: 'hard', required: false, type: Boolean })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('hard') hard?: string,
  ) {
    try {
      const result = await this.budgetEstimateService.remove(id, {
        hard: parseBooleanQueryParam(hard) === true,
      });
      return successResponse(result);
    } catch (error) {
      return this.handleError(error, 'Failed to delete budget estimate');
    }
  }
}
