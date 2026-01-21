// src/itinerary-items/itinerary-items.controller.ts
import { Controller, Get, Post, Body, Patch, Param, Delete, Query, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBody } from '@nestjs/swagger';
import { ItineraryItemsService } from './itinerary-items.service';
import { ItineraryValidationService } from './services/itinerary-validation.service';
import { ItemCostService } from './services/item-cost.service';
import { CreateItineraryItemDto } from './dto/create-itinerary-item.dto';
import { UpdateItineraryItemDto } from './dto/update-itinerary-item.dto';
import { AggregatedValidationResultDto, BatchValidationResultDto } from './dto/validation-result.dto';
import { ItemCostDto, BatchUpdateCostDto, TripCostSummaryDto, BatchUpdateCostResultDto } from './dto/item-cost.dto';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../common/dto/api-response.dto';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('itinerary-items')
@Controller('itinerary-items')
export class ItineraryItemsController {
  private readonly logger = new Logger(ItineraryItemsController.name);

  constructor(
    private readonly itineraryItemsService: ItineraryItemsService,
    private readonly validationService: ItineraryValidationService,
    private readonly itemCostService: ItemCostService,
  ) {}

  /**
   * 预校验接口（不实际创建）
   */
  @Public()
  @Post('validate')
  @ApiOperation({ 
    summary: '预校验行程项',
    description: '校验行程项是否可创建，返回时间重叠、交通时间等校验结果，但不实际创建。用于前端实时校验。'
  })
  @ApiResponse({ 
    status: 200, 
    description: '校验结果',
    type: AggregatedValidationResultDto,
  })
  async validate(@Body() dto: CreateItineraryItemDto) {
    try {
      const result = await this.validationService.validateCreate(dto);
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('预校验失败:', error);
      return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
    }
  }

  /**
   * 批量校验行程
   */
  @Public()
  @Post('batch-validate/:tripId')
  @ApiOperation({ 
    summary: '批量校验行程',
    description: '校验整个行程的所有行程项，返回所有时间冲突、交通时间不足等问题'
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiBody({ 
    schema: {
      type: 'object',
      properties: {
        dates: {
          type: 'array',
          items: { type: 'string' },
          description: '可选：仅校验指定日期',
          example: ['2025-12-05', '2025-12-06']
        }
      }
    }
  })
  @ApiResponse({ 
    status: 200, 
    description: '批量校验结果',
    type: BatchValidationResultDto,
  })
  async batchValidate(
    @Param('tripId') tripId: string,
    @Body() body: { dates?: string[] }
  ) {
    try {
      const result = await this.validationService.validateBatch(tripId, body.dates);
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('批量校验失败:', error);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post()
  @ApiOperation({ 
    summary: '创建行程项（带智能校验）',
    description: `在指定日期添加行程项。系统会自动校验：
- **时间重叠**：与同日其他行程项是否有时间冲突（ERROR 级别，必须修正）
- **交通时间**：从前一个地点到此地点的交通时间是否充足（WARNING 级别，可用 forceCreate 覆盖）
- **缓冲时间**：行程项之间的缓冲时间是否充足（INFO 级别，仅提示）
- **营业时间**：地点在指定时间是否营业

如存在 WARNING 级别问题且未设置 forceCreate=true，将返回警告要求确认。`
  })
  @ApiResponse({ 
    status: 200, 
    description: '行程项创建成功（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({ 
    status: 200, 
    description: '校验失败或需要确认（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async create(@Body() dto: CreateItineraryItemDto) {
    try {
      // 执行校验
      const validation = await this.validationService.validateCreate(dto);

      // 如果有 ERROR 级别错误，直接返回
      if (!validation.canProceed) {
        return errorResponse(
          ErrorCode.VALIDATION_ERROR,
          validation.errors[0]?.message || '校验失败',
          {
            errors: validation.errors,
            travelInfo: validation.travelInfo,
          }
        );
      }

      // 如果有 WARNING 且未强制创建
      if (validation.requiresConfirmation && !dto.forceCreate) {
        // 检查是否忽略了所有警告
        const ignoredCodes = new Set(dto.ignoreWarnings || []);
        const unresolvedWarnings = validation.warnings.filter(
          w => !ignoredCodes.has(w.code)
        );

        if (unresolvedWarnings.length > 0) {
          return {
            success: false,
            error: {
              code: 'REQUIRES_CONFIRMATION',
              message: '存在警告需要确认。请设置 forceCreate=true 或调整时间后重新提交',
            },
            warnings: unresolvedWarnings,
            travelInfo: validation.travelInfo,
          };
        }
      }

      // 创建行程项
      const item = await this.itineraryItemsService.create(dto);
      
      // 返回成功结果，附带警告和提示信息
      return successResponse({
        item,
        warnings: validation.warnings.length > 0 ? validation.warnings : undefined,
        infos: validation.infos.length > 0 ? validation.infos : undefined,
        travelInfo: validation.travelInfo,
      });
    } catch (error: any) {
      this.logger.error('创建行程项失败:', error);
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Get()
  @ApiOperation({ 
    summary: '获取所有行程项',
    description: '返回所有行程项列表，按开始时间排序'
  })
  @ApiQuery({ 
    name: 'tripDayId', 
    required: false, 
    description: '可选：筛选指定 TripDay 的行程项',
    type: String 
  })
  @ApiResponse({ 
    status: 200, 
    description: '成功返回行程项列表（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async findAll(@Query('tripDayId') tripDayId?: string) {
    const items = tripDayId
      ? await this.itineraryItemsService.findByTripDay(tripDayId)
      : await this.itineraryItemsService.findAll();
    return successResponse(items);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ 
    summary: '获取单个行程项详情',
    description: '根据 ID 获取完整的行程项信息，包括关联的 Place 和 TripDay'
  })
  @ApiParam({ name: 'id', description: '行程项 ID (UUID)', example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1' })
  @ApiResponse({ 
    status: 200, 
    description: '成功返回行程项详情（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({ 
    status: 200, 
    description: '行程项不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async findOne(@Param('id') id: string) {
    try {
      const item = await this.itineraryItemsService.findOne(id);
      return successResponse(item);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      throw error;
    }
  }

  @Public()
  @Patch(':id')
  @ApiOperation({ 
    summary: '更新行程项（带智能校验和级联影响分析）',
    description: `更新行程项信息。系统会：
1. 执行时间重叠、交通时间等校验
2. 分析修改对后续行程项的级联影响
3. 返回受影响的行程项及建议的调整时间

如存在 WARNING 级别问题且未设置 forceCreate=true，将返回警告和级联影响分析。`
  })
  @ApiParam({ name: 'id', description: '行程项 ID (UUID)' })
  @ApiResponse({ 
    status: 200, 
    description: '更新成功（统一响应格式，包含级联影响）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({ 
    status: 200, 
    description: '校验失败或需要确认（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async update(@Param('id') id: string, @Body() dto: UpdateItineraryItemDto) {
    try {
      // 执行校验（包含级联影响检测）
      const validation = await this.validationService.validateUpdate(id, dto);

      // 如果有 ERROR 级别错误，直接返回
      if (!validation.canProceed) {
        return errorResponse(
          ErrorCode.VALIDATION_ERROR,
          validation.errors[0]?.message || '校验失败',
          { 
            errors: validation.errors,
            cascadeImpact: validation.cascadeImpact,
          }
        );
      }

      // 如果有 WARNING 或级联影响，且未强制更新
      const hasUnresolvedIssues = validation.requiresConfirmation || validation.cascadeImpact;
      if (hasUnresolvedIssues && !dto.forceCreate) {
        const ignoredCodes = new Set(dto.ignoreWarnings || []);
        const unresolvedWarnings = validation.warnings.filter(
          w => !ignoredCodes.has(w.code)
        );

        if (unresolvedWarnings.length > 0 || validation.cascadeImpact) {
          return {
            success: false,
            error: {
              code: 'REQUIRES_CONFIRMATION',
              message: validation.cascadeImpact 
                ? `此修改将影响后续 ${validation.cascadeImpact.affectedCount} 个行程项。请设置 forceCreate=true 确认更新`
                : '存在警告需要确认',
            },
            warnings: unresolvedWarnings,
            cascadeImpact: validation.cascadeImpact,
            travelInfo: validation.travelInfo,
          };
        }
      }

      // 执行更新
      const item = await this.itineraryItemsService.update(id, dto);

      return successResponse({
        item,
        warnings: validation.warnings.length > 0 ? validation.warnings : undefined,
        cascadeImpact: validation.cascadeImpact,
        travelInfo: validation.travelInfo,
      });
    } catch (error: any) {
      this.logger.error('更新行程项失败:', error);
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Delete(':id')
  @ApiOperation({ 
    summary: '删除行程项',
    description: '删除指定的行程项'
  })
  @ApiParam({ name: 'id', description: '行程项 ID (UUID)' })
  @ApiResponse({ 
    status: 200, 
    description: '删除成功（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({ 
    status: 200, 
    description: '行程项不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async remove(@Param('id') id: string) {
    try {
      await this.itineraryItemsService.remove(id);
      return successResponse({ message: '删除成功' });
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      throw error;
    }
  }

  // ========== 费用管理相关接口 ==========

  @Public()
  @Get(':id/cost')
  @ApiOperation({ 
    summary: '获取行程项费用信息',
    description: '获取单个行程项的费用详情'
  })
  @ApiParam({ name: 'id', description: '行程项 ID' })
  @ApiResponse({ status: 200, description: '费用信息' })
  async getItemCost(@Param('id') id: string) {
    try {
      const cost = await this.itemCostService.getItemCost(id);
      return successResponse(cost);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Patch(':id/cost')
  @ApiOperation({ 
    summary: '更新行程项费用',
    description: '更新单个行程项的预估费用、实际费用、支付状态等'
  })
  @ApiParam({ name: 'id', description: '行程项 ID' })
  @ApiBody({ type: ItemCostDto })
  @ApiResponse({ status: 200, description: '更新成功' })
  async updateItemCost(
    @Param('id') id: string,
    @Body() dto: ItemCostDto,
  ) {
    try {
      const item = await this.itemCostService.updateItemCost(id, dto);
      return successResponse({ item, message: '费用更新成功' });
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Patch('batch-cost')
  @ApiOperation({ 
    summary: '批量更新行程项费用',
    description: '批量更新多个行程项的实际费用和支付状态，适用于旅行后记账场景'
  })
  @ApiBody({ type: BatchUpdateCostDto })
  @ApiResponse({ status: 200, description: '批量更新结果', type: BatchUpdateCostResultDto })
  async batchUpdateCost(@Body() dto: BatchUpdateCostDto) {
    try {
      const result = await this.itemCostService.batchUpdateCost(dto);
      return successResponse({ ...result, message: `成功更新 ${result.updated} 条记录` });
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Get('trip/:tripId/cost-summary')
  @ApiOperation({ 
    summary: '获取行程费用汇总',
    description: '获取行程的费用汇总，包括按分类、按日期的统计，以及预算使用情况'
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiResponse({ status: 200, description: '费用汇总', type: TripCostSummaryDto })
  async getTripCostSummary(@Param('tripId') tripId: string) {
    try {
      const summary = await this.itemCostService.getTripCostSummary(tripId);
      return successResponse(summary);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Get('trip/:tripId/unpaid')
  @ApiOperation({ 
    summary: '获取未支付的行程项',
    description: '获取行程中所有未支付的行程项列表，便于用户追踪待付款项目'
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiResponse({ status: 200, description: '未支付行程项列表' })
  async getUnpaidItems(@Param('tripId') tripId: string) {
    try {
      const items = await this.itemCostService.getUnpaidItems(tripId);
      return successResponse(items);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }
}
