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
import { SearchNearbyPoiQueryDto, NearbyPoiCategory } from './dto/search-nearby-poi.dto';
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

  @Public()
  @Post()
  @ApiOperation({ 
    summary: '创建行程项（带智能校验）',
    description: `在指定日期添加行程项。系统会自动校验：
- **时间重叠**：与同日其他行程项是否有时间冲突
- **交通时间**：从前一个地点到此地点的交通时间是否充足
- **缓冲时间**：行程项之间的缓冲时间是否充足
- **营业时间**：地点在指定时间是否营业

如存在潜在问题，将返回警告要求用户确认后继续。`
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
              message: '检测到时间安排可能存在问题，请确认是否继续添加？',
              requiresConfirmation: true, // 前端可据此显示确认按钮
              // 兼容前端 API Client：部分调用方从 error.details 提取 warnings/travelInfo
              details: {
                warnings: unresolvedWarnings,
                travelInfo: validation.travelInfo,
              },
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
  @ApiQuery({ 
    name: 'costCategory', 
    required: false, 
    description: '可选：按费用分类筛选（如 ACCOMMODATION）。用于「加入行程」前检查当日是否已有住宿',
    enum: ['ACCOMMODATION', 'TRANSPORTATION', 'FOOD', 'ACTIVITIES', 'SHOPPING', 'OTHER'],
    type: String 
  })
  @ApiResponse({ 
    status: 200, 
    description: '成功返回行程项列表（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async findAll(
    @Query('tripDayId') tripDayId?: string,
    @Query('costCategory') costCategory?: string,
  ) {
    const items = tripDayId
      ? await this.itineraryItemsService.findByTripDay(tripDayId, costCategory ? { costCategory } : undefined)
      : await this.itineraryItemsService.findAll();
    return successResponse(items);
  }

  @Public()
  @Get('nearby-poi')
  @ApiOperation({
    summary: '基于行程项搜索附近的POI',
    description: '搜索行程项附近的景点、餐厅、住宿、加油站、休息点等。可以基于行程项ID或直接提供坐标。',
  })
  @ApiQuery({
    name: 'itemId',
    description: '行程项ID（可选，如果提供则使用行程项的坐标）',
    required: false,
    type: String,
  })
  @ApiQuery({
    name: 'lat',
    description: '纬度（如果未提供 itemId，则必须提供）',
    required: false,
    type: Number,
  })
  @ApiQuery({
    name: 'lng',
    description: '经度（如果未提供 itemId，则必须提供）',
    required: false,
    type: Number,
  })
  @ApiQuery({
    name: 'radius',
    description: '搜索半径（米），默认5000米',
    required: false,
    type: Number,
  })
  @ApiQuery({
    name: 'categories',
    description: '要搜索的POI类别（可多选，用逗号分隔）',
    required: false,
    enum: NearbyPoiCategory,
    isArray: true,
  })
  @ApiQuery({
    name: 'minRating',
    description: '最小评分（0-5）',
    required: false,
    type: Number,
  })
  @ApiQuery({
    name: 'openNow',
    description: '是否只返回当前营业的地点（仅对餐厅有效）',
    required: false,
    type: Boolean,
  })
  @ApiQuery({
    name: 'limit',
    description: '返回结果数量限制，默认20',
    required: false,
    type: Number,
  })
  @ApiResponse({
    status: 200,
    description: '成功返回附近POI列表（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '参数错误（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程项不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async searchNearbyPoi(
    @Query('itemId') itemId?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radius') radius?: string,
    @Query('categories') categories?: string,
    @Query('minRating') minRating?: string,
    @Query('openNow') openNow?: string,
    @Query('limit') limit?: string,
  ) {
    try {
      // 参数验证：必须提供 itemId 或 lat/lng
      if (!itemId && (!lat || !lng)) {
        return errorResponse(
          ErrorCode.VALIDATION_ERROR,
          '必须提供 itemId 或 lat/lng 坐标'
        );
      }

      // 验证坐标格式
      if (lat && (isNaN(parseFloat(lat)) || parseFloat(lat) < -90 || parseFloat(lat) > 90)) {
        return errorResponse(
          ErrorCode.VALIDATION_ERROR,
          '纬度必须在 -90 到 90 之间'
        );
      }

      if (lng && (isNaN(parseFloat(lng)) || parseFloat(lng) < -180 || parseFloat(lng) > 180)) {
        return errorResponse(
          ErrorCode.VALIDATION_ERROR,
          '经度必须在 -180 到 180 之间'
        );
      }

      // 解析 categories
      let categoryArray: NearbyPoiCategory[] | undefined;
      if (categories) {
        categoryArray = categories.split(',').map(c => c.trim() as NearbyPoiCategory);
        // 验证类别值
        const validCategories = Object.values(NearbyPoiCategory);
        const invalidCategories = categoryArray.filter(c => !validCategories.includes(c));
        if (invalidCategories.length > 0) {
          return errorResponse(
            ErrorCode.VALIDATION_ERROR,
            `无效的类别: ${invalidCategories.join(', ')}`
          );
        }
      }

      // 构建查询对象
      const query: SearchNearbyPoiQueryDto = {
        itemId: itemId,
        lat: lat ? parseFloat(lat) : undefined,
        lng: lng ? parseFloat(lng) : undefined,
        radius: radius ? parseFloat(radius) : undefined,
        categories: categoryArray,
        minRating: minRating ? parseFloat(minRating) : undefined,
        openNow: openNow === 'true' ? true : openNow === 'false' ? false : undefined,
        limit: limit ? parseInt(limit) : undefined,
      };

      console.log(`🔍 [searchNearbyPoi] 控制器开始处理请求: itemId=${itemId}, lat=${lat}, lng=${lng}`);
      this.logger.log(`[searchNearbyPoi] 控制器开始处理请求: itemId=${itemId}, lat=${lat}, lng=${lng}`);
      let results: any;
      try {
        results = await this.itineraryItemsService.searchNearbyPoi(query);
        console.log(`🔍 [searchNearbyPoi] 服务方法返回: ${results === null ? 'null' : results === undefined ? 'undefined' : Array.isArray(results) ? `array(${results.length})` : typeof results}`);
        this.logger.log(`[searchNearbyPoi] 服务方法返回: ${results === null ? 'null' : results === undefined ? 'undefined' : Array.isArray(results) ? `array(${results.length})` : typeof results}`);
      } catch (serviceError: any) {
        this.logger.error(`[searchNearbyPoi] 服务方法抛出异常:`, serviceError);
        throw serviceError; // 重新抛出，让外层catch处理
      }
      
      // 确保返回数组而不是null
      const safeResults = Array.isArray(results) ? results : [];
      console.log(`🔍 [searchNearbyPoi] 最终返回结果数量: ${safeResults.length} 条`);
      this.logger.log(`[searchNearbyPoi] 最终返回结果数量: ${safeResults.length} 条`);
      if (!Array.isArray(results)) {
        this.logger.warn(`[searchNearbyPoi] ⚠️ 服务返回了非数组类型: ${typeof results}, 值: ${JSON.stringify(results)}, 已转换为空数组`);
      }
      return successResponse(safeResults);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      this.logger.error('搜索附近POI失败:', error);
      this.logger.error('错误堆栈:', error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Get('trip/:tripId')
  @ApiOperation({
    summary: '按 trip 批量拉取行程项（P0）',
    description:
      '一次返回全程全部 ItineraryItem（含 Place 坐标），替代 N×GET /itinerary-items?tripDayId=…。' +
      '可与 GET /trips/:tripId/journey-map 并行或单独使用。',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiQuery({
    name: 'includePlace',
    required: false,
    type: Boolean,
    description: '是否包含 Place 坐标（全程地图 marker 需要，默认 true）',
  })
  @ApiResponse({ status: 200, description: '成功', type: ApiSuccessResponseDto })
  async findByTrip(
    @Param('tripId') tripId: string,
    @Query('includePlace') includePlace?: string,
  ) {
    try {
      const items = await this.itineraryItemsService.findByTrip(tripId, {
        includePlace: includePlace !== 'false',
      });
      return successResponse(items);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
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

如存在潜在问题或级联影响，将返回警告要求用户确认后继续。`
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
      const cascadeMode = dto.cascadeMode ?? 'auto'; // 默认为 'auto'
      
      // 执行校验（如果 cascadeMode 为 'none'，不检测级联影响）
      const validation = await this.validationService.validateUpdate(id, dto, {
        detectCascadeImpact: cascadeMode === 'auto',
      });

      // 如果有 ERROR 级别错误，直接返回
      if (!validation.canProceed) {
        return errorResponse(
          ErrorCode.VALIDATION_ERROR,
          validation.errors[0]?.message || '校验失败',
          { 
            errors: validation.errors,
            cascadeImpact: cascadeMode === 'auto' ? validation.cascadeImpact : undefined,
          }
        );
      }

      // 如果有 WARNING 或级联影响，且未强制更新
      // 如果 cascadeMode 为 'none'，忽略级联影响，只检查警告
      const hasUnresolvedIssues = validation.requiresConfirmation || (cascadeMode === 'auto' && validation.cascadeImpact);
      if (hasUnresolvedIssues && !dto.forceCreate) {
        const ignoredCodes = new Set(dto.ignoreWarnings || []);
        const unresolvedWarnings = validation.warnings.filter(
          w => !ignoredCodes.has(w.code)
        );

        const hasCascadeImpact = cascadeMode === 'auto' && validation.cascadeImpact;
        if (unresolvedWarnings.length > 0 || hasCascadeImpact) {
          return {
            success: false,
            error: {
              code: 'REQUIRES_CONFIRMATION',
              message: hasCascadeImpact
                ? validation.cascadeImpact!.adjustmentSummary 
                  ? `修改时间将影响后续行程：${validation.cascadeImpact!.adjustmentSummary}。确认继续？`
                  : `修改时间将影响后续 ${validation.cascadeImpact!.affectedCount} 个行程项。确认继续？`
                : '存在时间冲突，请确认是否继续',
              requiresConfirmation: true, // 前端可据此显示确认按钮
              // 兼容前端 API Client：部分调用方从 error.details 提取 warnings/cascadeImpact/travelInfo
              details: {
                warnings: unresolvedWarnings,
                cascadeImpact: hasCascadeImpact ? validation.cascadeImpact : undefined,
                travelInfo: validation.travelInfo,
              },
            },
            warnings: unresolvedWarnings,
            cascadeImpact: hasCascadeImpact ? validation.cascadeImpact : undefined,
            travelInfo: validation.travelInfo,
          };
        }
      }

      // 执行更新（如果用户已确认级联影响，跳过执行阶段的时间校验）
      const item = await this.itineraryItemsService.update(id, dto, {
        forceUpdate: dto.forceCreate === true,
      });

      return successResponse({
        item,
        warnings: validation.warnings.length > 0 ? validation.warnings : undefined,
        cascadeImpact: cascadeMode === 'auto' ? validation.cascadeImpact : undefined,
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

  // ========== 数据修复接口 ==========

  /**
   * ⚠️ 管理/维护接口 - 普通用户不应访问
   * @deprecated 建议移到 /admin/itinerary-items/fix-dates
   */
  @Public()
  @Post('trip/:tripId/fix-dates')
  @ApiOperation({ 
    summary: '[Admin] 修复行程项日期一致性',
    description: '⚠️ 管理/维护接口。修复行程项的 startTime/endTime 与所属 TripDay.date 不一致的问题。会自动将日期调整为正确的日期，同时保留时间部分'
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiResponse({ 
    status: 200, 
    description: '修复结果',
    schema: {
      type: 'object',
      properties: {
        tripId: { type: 'string' },
        totalDays: { type: 'number' },
        fixedCount: { type: 'number' },
        fixes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              itemId: { type: 'string' },
              oldStartTime: { type: 'string' },
              newStartTime: { type: 'string' },
              fixed: { type: 'boolean' },
            },
          },
        },
      },
    },
  })
  async fixItemDates(@Param('tripId') tripId: string) {
    try {
      const result = await this.itineraryItemsService.fixItemDateConsistency(tripId);
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  // ========== 交通信息相关接口 ==========

  @Public()
  @Post('trip/:tripId/calculate-all-travel')
  @ApiOperation({ 
    summary: '计算整个行程的交通信息（支持跨天）',
    description: '自动计算整个行程所有行程项之间的交通时间和距离，包括跨天的交通段。例如：第1天最后一个景点 → 第2天第一个景点'
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        defaultTravelMode: { 
          type: 'string', 
          enum: ['DRIVING', 'WALKING', 'TRANSIT'],
          default: 'DRIVING'
        },
      },
    },
  })
  @ApiResponse({ 
    status: 200, 
    description: '计算结果',
    schema: {
      type: 'object',
      properties: {
        tripId: { type: 'string' },
        totalDays: { type: 'number' },
        totalItems: { type: 'number' },
        calculatedCount: { type: 'number' },
        crossDaySegments: { type: 'number', description: '跨天交通段数量' },
        results: { type: 'array' },
        summary: { type: 'object' },
      },
    },
  })
  async calculateAllTravelInfo(
    @Param('tripId') tripId: string,
    @Body() body: { defaultTravelMode?: 'DRIVING' | 'WALKING' | 'TRANSIT' },
  ) {
    try {
      const result = await this.itineraryItemsService.calculateAllTravelInfo(
        tripId,
        body.defaultTravelMode || 'DRIVING'
      );
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Post('trip/:tripId/days/:dayId/calculate-travel')
  @ApiOperation({ 
    summary: '自动计算单天交通信息',
    description: '自动计算某天所有行程项之间的交通时间和距离，并保存到数据库。支持自动选择交通方式：<1km步行，1-50km驾车，>50km需手动指定'
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiParam({ name: 'dayId', description: '行程日期 ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        defaultTravelMode: { 
          type: 'string', 
          enum: ['DRIVING', 'WALKING', 'TRANSIT'],
          description: '默认交通方式（无法自动判断时使用）',
          default: 'DRIVING'
        },
      },
    },
  })
  @ApiResponse({ 
    status: 200, 
    description: '计算结果',
    schema: {
      type: 'object',
      properties: {
        dayId: { type: 'string' },
        date: { type: 'string' },
        itemCount: { type: 'number' },
        calculatedCount: { type: 'number' },
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              itemId: { type: 'string' },
              fromPlace: { type: 'string' },
              toPlace: { type: 'string' },
              duration: { type: 'number', description: '分钟' },
              distance: { type: 'number', description: '米' },
              travelMode: { type: 'string' },
              calculated: { type: 'boolean' },
              error: { type: 'string' },
            },
          },
        },
        summary: {
          type: 'object',
          properties: {
            totalDuration: { type: 'number' },
            totalDistance: { type: 'number' },
            successRate: { type: 'number' },
          },
        },
      },
    },
  })
  async calculateTravelInfo(
    @Param('tripId') tripId: string,
    @Param('dayId') dayId: string,
    @Body() body: { defaultTravelMode?: 'DRIVING' | 'WALKING' | 'TRANSIT' },
  ) {
    try {
      const result = await this.itineraryItemsService.calculateAndSaveTravelInfo(
        tripId,
        dayId,
        body.defaultTravelMode || 'DRIVING'
      );
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Get('trip/:tripId/travel-info')
  @ApiOperation({
    summary: '批量获取行程交通信息（只读缓存）',
    description:
      '一次返回所有天的交通段，仅读 ItineraryItem.travelFromPrevious*，不触发路由重算。' +
      '重算请用 POST /itinerary-items/trip/:tripId/calculate-all-travel。',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiQuery({
    name: 'dates',
    required: false,
    description: 'YYYY-MM-DD 逗号分隔，仅返回指定天',
  })
  @ApiResponse({ status: 200, description: '批量交通信息（cached）' })
  async getTripTravelInfo(
    @Param('tripId') tripId: string,
    @Query('dates') dates?: string,
  ) {
    try {
      const dateFilter = dates
        ?.split(',')
        .map((d) => d.trim())
        .filter(Boolean);
      const result = await this.itineraryItemsService.getTripTravelInfoFromCache(tripId, {
        dates: dateFilter?.length ? dateFilter : undefined,
      });
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Get('trip/:tripId/days/:dayId/travel-info')
  @ApiOperation({ 
    summary: '获取某天的交通信息',
    description: '计算某天所有行程项之间的交通时间、距离和交通方式'
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiParam({ name: 'dayId', description: '行程日期 ID' })
  @ApiQuery({
    name: 'mode',
    required: false,
    enum: ['live', 'cached'],
    description: 'cached 只读 DB 段；live（默认）可能触发路由计算',
  })
  @ApiQuery({
    name: 'includeTerrain',
    required: false,
    description:
      'Legacy: 1/true → terrainPolicy=REQUIRED. Default is server AUTO (Iceland/F-road/highland auto DEM). Prefer omitting.',
  })
  @ApiResponse({ 
    status: 200, 
    description: '交通信息',
    schema: {
      type: 'object',
      properties: {
        dayId: { type: 'string' },
        date: { type: 'string', format: 'date' },
        itemCount: { type: 'number' },
        segments: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              fromItemId: { type: 'string' },
              toItemId: { type: 'string' },
              fromPlace: { type: 'string' },
              toPlace: { type: 'string' },
              duration: {
                type: 'number',
                description: '分钟 — equals eta.schedulableDurationMin (Shadow=base)',
              },
              distance: { type: 'number', description: '米' },
              travelMode: { type: 'string', enum: ['DRIVING', 'WALKING', 'TRANSIT', 'FLIGHT', 'TRAIN', 'FERRY', 'BICYCLE', 'TAXI'] },
              eta: {
                type: 'object',
                description:
                  'tripnara/travel-eta/v1 — baseDurationMin / planningDurationMin / schedulableDurationMin / shadowPlanningDurationMin / adjustments / terrain',
              },
              userEvidence: {
                type: 'object',
                description:
                  'tripnara/travel-eta-user-evidence/v1 — 基础车程/建议预留/阻断文案（Web/iOS 直接渲染）',
              },
            },
          },
        },
        summary: {
          type: 'object',
          properties: {
            totalDuration: { type: 'number', description: '总时间（分钟）' },
            totalDistance: { type: 'number', description: '总距离（米）' },
            segmentCount: { type: 'number' },
          },
        },
      },
    },
  })
  async getDayTravelInfo(
    @Param('tripId') tripId: string,
    @Param('dayId') dayId: string,
    @Query('mode') mode?: 'live' | 'cached',
    @Query('includeTerrain') includeTerrain?: string,
  ) {
    try {
      const wantTerrain = includeTerrain === '1' || includeTerrain === 'true';
      const result =
        mode === 'cached'
          ? await this.itineraryItemsService.getDayTravelInfoFromCache(tripId, dayId)
          : await this.itineraryItemsService.getDayTravelInfo(tripId, dayId, {
              // Server AUTO by default; legacy flag forces REQUIRED
              terrainPolicy: wantTerrain ? 'REQUIRED' : 'AUTO',
              includeTerrain: wantTerrain,
            });
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  // ========== 预订信息相关接口 ==========

  @Public()
  @Patch(':id/booking')
  @ApiOperation({ 
    summary: '更新预订状态',
    description: '更新行程项的预订状态、确认号、预订链接等信息'
  })
  @ApiParam({ name: 'id', description: '行程项 ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        bookingStatus: { 
          type: 'string', 
          enum: ['BOOKED', 'NEED_BOOKING', 'NO_BOOKING'],
          description: '预订状态'
        },
        bookingConfirmation: { type: 'string', description: '预订确认号' },
        bookingUrl: { type: 'string', description: '预订链接' },
        bookedAt: { type: 'string', format: 'date-time', description: '预订时间' },
      },
    },
  })
  @ApiResponse({ status: 200, description: '更新成功' })
  async updateBookingStatus(
    @Param('id') id: string,
    @Body() body: {
      bookingStatus?: 'BOOKED' | 'NEED_BOOKING' | 'NO_BOOKING';
      bookingConfirmation?: string;
      bookingUrl?: string;
      bookedAt?: string;
    },
  ) {
    try {
      const item = await this.itineraryItemsService.updateBookingStatus(id, body);
      return successResponse({ item, message: '预订状态更新成功' });
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Patch(':id/travel-info')
  @ApiOperation({ 
    summary: '更新交通信息',
    description: '更新行程项从上一地点的交通时间、距离和交通方式'
  })
  @ApiParam({ name: 'id', description: '行程项 ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        travelFromPreviousDuration: { type: 'number', description: '从上一地点的时间（分钟）' },
        travelFromPreviousDistance: { type: 'number', description: '从上一地点的距离（米）' },
        travelMode: { 
          type: 'string', 
          enum: ['DRIVING', 'WALKING', 'TRANSIT', 'FLIGHT', 'TRAIN', 'FERRY', 'BICYCLE', 'TAXI'],
          description: '交通方式: DRIVING(自驾), WALKING(步行), TRANSIT(公交), FLIGHT(飞机), TRAIN(火车/高铁), FERRY(轮渡), BICYCLE(骑行), TAXI(出租车)'
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: '更新成功' })
  async updateTravelInfo(
    @Param('id') id: string,
    @Body() body: {
      travelFromPreviousDuration?: number;
      travelFromPreviousDistance?: number;
      travelMode?: 'DRIVING' | 'WALKING' | 'TRANSIT';
    },
  ) {
    try {
      const item = await this.itineraryItemsService.updateTravelInfo(id, body);
      return successResponse({ item, message: '交通信息更新成功' });
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }
}
