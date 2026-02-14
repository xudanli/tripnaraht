"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var ItineraryItemsController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ItineraryItemsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const itinerary_items_service_1 = require("./itinerary-items.service");
const itinerary_validation_service_1 = require("./services/itinerary-validation.service");
const item_cost_service_1 = require("./services/item-cost.service");
const create_itinerary_item_dto_1 = require("./dto/create-itinerary-item.dto");
const update_itinerary_item_dto_1 = require("./dto/update-itinerary-item.dto");
const validation_result_dto_1 = require("./dto/validation-result.dto");
const item_cost_dto_1 = require("./dto/item-cost.dto");
const search_nearby_poi_dto_1 = require("./dto/search-nearby-poi.dto");
const standard_response_dto_1 = require("../common/dto/standard-response.dto");
const api_response_dto_1 = require("../common/dto/api-response.dto");
const public_decorator_1 = require("../auth/decorators/public.decorator");
let ItineraryItemsController = ItineraryItemsController_1 = class ItineraryItemsController {
    constructor(itineraryItemsService, validationService, itemCostService) {
        this.itineraryItemsService = itineraryItemsService;
        this.validationService = validationService;
        this.itemCostService = itemCostService;
        this.logger = new common_1.Logger(ItineraryItemsController_1.name);
    }
    async validate(dto) {
        try {
            const result = await this.validationService.validateCreate(dto);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('预校验失败:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message);
        }
    }
    async batchValidate(tripId, body) {
        try {
            const result = await this.validationService.validateBatch(tripId, body.dates);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('批量校验失败:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async create(dto) {
        var _a;
        try {
            const validation = await this.validationService.validateCreate(dto);
            if (!validation.canProceed) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, ((_a = validation.errors[0]) === null || _a === void 0 ? void 0 : _a.message) || '校验失败', {
                    errors: validation.errors,
                    travelInfo: validation.travelInfo,
                });
            }
            if (validation.requiresConfirmation && !dto.forceCreate) {
                const ignoredCodes = new Set(dto.ignoreWarnings || []);
                const unresolvedWarnings = validation.warnings.filter(w => !ignoredCodes.has(w.code));
                if (unresolvedWarnings.length > 0) {
                    return {
                        success: false,
                        error: {
                            code: 'REQUIRES_CONFIRMATION',
                            message: '检测到时间安排可能存在问题，请确认是否继续添加？',
                            requiresConfirmation: true,
                        },
                        warnings: unresolvedWarnings,
                        travelInfo: validation.travelInfo,
                    };
                }
            }
            const item = await this.itineraryItemsService.create(dto);
            return (0, standard_response_dto_1.successResponse)({
                item,
                warnings: validation.warnings.length > 0 ? validation.warnings : undefined,
                infos: validation.infos.length > 0 ? validation.infos : undefined,
                travelInfo: validation.travelInfo,
            });
        }
        catch (error) {
            this.logger.error('创建行程项失败:', error);
            if (error instanceof common_1.BadRequestException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message);
            }
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async findAll(tripDayId) {
        const items = tripDayId
            ? await this.itineraryItemsService.findByTripDay(tripDayId)
            : await this.itineraryItemsService.findAll();
        return (0, standard_response_dto_1.successResponse)(items);
    }
    async searchNearbyPoi(itemId, lat, lng, radius, categories, minRating, openNow, limit) {
        try {
            if (!itemId && (!lat || !lng)) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, '必须提供 itemId 或 lat/lng 坐标');
            }
            if (lat && (isNaN(parseFloat(lat)) || parseFloat(lat) < -90 || parseFloat(lat) > 90)) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, '纬度必须在 -90 到 90 之间');
            }
            if (lng && (isNaN(parseFloat(lng)) || parseFloat(lng) < -180 || parseFloat(lng) > 180)) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, '经度必须在 -180 到 180 之间');
            }
            let categoryArray;
            if (categories) {
                categoryArray = categories.split(',').map(c => c.trim());
                const validCategories = Object.values(search_nearby_poi_dto_1.NearbyPoiCategory);
                const invalidCategories = categoryArray.filter(c => !validCategories.includes(c));
                if (invalidCategories.length > 0) {
                    return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, `无效的类别: ${invalidCategories.join(', ')}`);
                }
            }
            const query = {
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
            let results;
            try {
                results = await this.itineraryItemsService.searchNearbyPoi(query);
                console.log(`🔍 [searchNearbyPoi] 服务方法返回: ${results === null ? 'null' : results === undefined ? 'undefined' : Array.isArray(results) ? `array(${results.length})` : typeof results}`);
                this.logger.log(`[searchNearbyPoi] 服务方法返回: ${results === null ? 'null' : results === undefined ? 'undefined' : Array.isArray(results) ? `array(${results.length})` : typeof results}`);
            }
            catch (serviceError) {
                this.logger.error(`[searchNearbyPoi] 服务方法抛出异常:`, serviceError);
                throw serviceError;
            }
            const safeResults = Array.isArray(results) ? results : [];
            console.log(`🔍 [searchNearbyPoi] 最终返回结果数量: ${safeResults.length} 条`);
            this.logger.log(`[searchNearbyPoi] 最终返回结果数量: ${safeResults.length} 条`);
            if (!Array.isArray(results)) {
                this.logger.warn(`[searchNearbyPoi] ⚠️ 服务返回了非数组类型: ${typeof results}, 值: ${JSON.stringify(results)}, 已转换为空数组`);
            }
            return (0, standard_response_dto_1.successResponse)(safeResults);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            if (error instanceof common_1.BadRequestException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message);
            }
            this.logger.error('搜索附近POI失败:', error);
            this.logger.error('错误堆栈:', error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async findOne(id) {
        try {
            const item = await this.itineraryItemsService.findOne(id);
            return (0, standard_response_dto_1.successResponse)(item);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            throw error;
        }
    }
    async update(id, dto) {
        var _a, _b;
        try {
            const cascadeMode = (_a = dto.cascadeMode) !== null && _a !== void 0 ? _a : 'auto';
            const validation = await this.validationService.validateUpdate(id, dto, {
                detectCascadeImpact: cascadeMode === 'auto',
            });
            if (!validation.canProceed) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, ((_b = validation.errors[0]) === null || _b === void 0 ? void 0 : _b.message) || '校验失败', {
                    errors: validation.errors,
                    cascadeImpact: cascadeMode === 'auto' ? validation.cascadeImpact : undefined,
                });
            }
            const hasUnresolvedIssues = validation.requiresConfirmation || (cascadeMode === 'auto' && validation.cascadeImpact);
            if (hasUnresolvedIssues && !dto.forceCreate) {
                const ignoredCodes = new Set(dto.ignoreWarnings || []);
                const unresolvedWarnings = validation.warnings.filter(w => !ignoredCodes.has(w.code));
                const hasCascadeImpact = cascadeMode === 'auto' && validation.cascadeImpact;
                if (unresolvedWarnings.length > 0 || hasCascadeImpact) {
                    return {
                        success: false,
                        error: {
                            code: 'REQUIRES_CONFIRMATION',
                            message: hasCascadeImpact
                                ? validation.cascadeImpact.adjustmentSummary
                                    ? `修改时间将影响后续行程：${validation.cascadeImpact.adjustmentSummary}。确认继续？`
                                    : `修改时间将影响后续 ${validation.cascadeImpact.affectedCount} 个行程项。确认继续？`
                                : '存在时间冲突，请确认是否继续',
                            requiresConfirmation: true,
                        },
                        warnings: unresolvedWarnings,
                        cascadeImpact: hasCascadeImpact ? validation.cascadeImpact : undefined,
                        travelInfo: validation.travelInfo,
                    };
                }
            }
            const item = await this.itineraryItemsService.update(id, dto, {
                forceUpdate: dto.forceCreate === true,
            });
            return (0, standard_response_dto_1.successResponse)({
                item,
                warnings: validation.warnings.length > 0 ? validation.warnings : undefined,
                cascadeImpact: cascadeMode === 'auto' ? validation.cascadeImpact : undefined,
                travelInfo: validation.travelInfo,
            });
        }
        catch (error) {
            this.logger.error('更新行程项失败:', error);
            if (error instanceof common_1.BadRequestException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message);
            }
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async remove(id) {
        try {
            await this.itineraryItemsService.remove(id);
            return (0, standard_response_dto_1.successResponse)({ message: '删除成功' });
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            throw error;
        }
    }
    async getItemCost(id) {
        try {
            const cost = await this.itemCostService.getItemCost(id);
            return (0, standard_response_dto_1.successResponse)(cost);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async updateItemCost(id, dto) {
        try {
            const item = await this.itemCostService.updateItemCost(id, dto);
            return (0, standard_response_dto_1.successResponse)({ item, message: '费用更新成功' });
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async batchUpdateCost(dto) {
        try {
            const result = await this.itemCostService.batchUpdateCost(dto);
            return (0, standard_response_dto_1.successResponse)({ ...result, message: `成功更新 ${result.updated} 条记录` });
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getTripCostSummary(tripId) {
        try {
            const summary = await this.itemCostService.getTripCostSummary(tripId);
            return (0, standard_response_dto_1.successResponse)(summary);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getUnpaidItems(tripId) {
        try {
            const items = await this.itemCostService.getUnpaidItems(tripId);
            return (0, standard_response_dto_1.successResponse)(items);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async fixItemDates(tripId) {
        try {
            const result = await this.itineraryItemsService.fixItemDateConsistency(tripId);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async calculateAllTravelInfo(tripId, body) {
        try {
            const result = await this.itineraryItemsService.calculateAllTravelInfo(tripId, body.defaultTravelMode || 'DRIVING');
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async calculateTravelInfo(tripId, dayId, body) {
        try {
            const result = await this.itineraryItemsService.calculateAndSaveTravelInfo(tripId, dayId, body.defaultTravelMode || 'DRIVING');
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getDayTravelInfo(tripId, dayId) {
        try {
            const result = await this.itineraryItemsService.getDayTravelInfo(tripId, dayId);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async updateBookingStatus(id, body) {
        try {
            const item = await this.itineraryItemsService.updateBookingStatus(id, body);
            return (0, standard_response_dto_1.successResponse)({ item, message: '预订状态更新成功' });
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async updateTravelInfo(id, body) {
        try {
            const item = await this.itineraryItemsService.updateTravelInfo(id, body);
            return (0, standard_response_dto_1.successResponse)({ item, message: '交通信息更新成功' });
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
};
exports.ItineraryItemsController = ItineraryItemsController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('validate'),
    (0, swagger_1.ApiOperation)({
        summary: '预校验行程项',
        description: '校验行程项是否可创建，返回时间重叠、交通时间等校验结果，但不实际创建。用于前端实时校验。'
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '校验结果',
        type: validation_result_dto_1.AggregatedValidationResultDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_itinerary_item_dto_1.CreateItineraryItemDto]),
    __metadata("design:returntype", Promise)
], ItineraryItemsController.prototype, "validate", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('batch-validate/:tripId'),
    (0, swagger_1.ApiOperation)({
        summary: '批量校验行程',
        description: '校验整个行程的所有行程项，返回所有时间冲突、交通时间不足等问题'
    }),
    (0, swagger_1.ApiParam)({ name: 'tripId', description: '行程 ID' }),
    (0, swagger_1.ApiBody)({
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
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '批量校验结果',
        type: validation_result_dto_1.BatchValidationResultDto,
    }),
    __param(0, (0, common_1.Param)('tripId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ItineraryItemsController.prototype, "batchValidate", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({
        summary: '创建行程项（带智能校验）',
        description: `在指定日期添加行程项。系统会自动校验：
- **时间重叠**：与同日其他行程项是否有时间冲突
- **交通时间**：从前一个地点到此地点的交通时间是否充足
- **缓冲时间**：行程项之间的缓冲时间是否充足
- **营业时间**：地点在指定时间是否营业

如存在潜在问题，将返回警告要求用户确认后继续。`
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '行程项创建成功（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '校验失败或需要确认（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_itinerary_item_dto_1.CreateItineraryItemDto]),
    __metadata("design:returntype", Promise)
], ItineraryItemsController.prototype, "create", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({
        summary: '获取所有行程项',
        description: '返回所有行程项列表，按开始时间排序'
    }),
    (0, swagger_1.ApiQuery)({
        name: 'tripDayId',
        required: false,
        description: '可选：筛选指定 TripDay 的行程项',
        type: String
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回行程项列表（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Query)('tripDayId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ItineraryItemsController.prototype, "findAll", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('nearby-poi'),
    (0, swagger_1.ApiOperation)({
        summary: '基于行程项搜索附近的POI',
        description: '搜索行程项附近的景点、餐厅、住宿、加油站、休息点等。可以基于行程项ID或直接提供坐标。',
    }),
    (0, swagger_1.ApiQuery)({
        name: 'itemId',
        description: '行程项ID（可选，如果提供则使用行程项的坐标）',
        required: false,
        type: String,
    }),
    (0, swagger_1.ApiQuery)({
        name: 'lat',
        description: '纬度（如果未提供 itemId，则必须提供）',
        required: false,
        type: Number,
    }),
    (0, swagger_1.ApiQuery)({
        name: 'lng',
        description: '经度（如果未提供 itemId，则必须提供）',
        required: false,
        type: Number,
    }),
    (0, swagger_1.ApiQuery)({
        name: 'radius',
        description: '搜索半径（米），默认5000米',
        required: false,
        type: Number,
    }),
    (0, swagger_1.ApiQuery)({
        name: 'categories',
        description: '要搜索的POI类别（可多选，用逗号分隔）',
        required: false,
        enum: search_nearby_poi_dto_1.NearbyPoiCategory,
        isArray: true,
    }),
    (0, swagger_1.ApiQuery)({
        name: 'minRating',
        description: '最小评分（0-5）',
        required: false,
        type: Number,
    }),
    (0, swagger_1.ApiQuery)({
        name: 'openNow',
        description: '是否只返回当前营业的地点（仅对餐厅有效）',
        required: false,
        type: Boolean,
    }),
    (0, swagger_1.ApiQuery)({
        name: 'limit',
        description: '返回结果数量限制，默认20',
        required: false,
        type: Number,
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回附近POI列表（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: '参数错误（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '行程项不存在（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Query)('itemId')),
    __param(1, (0, common_1.Query)('lat')),
    __param(2, (0, common_1.Query)('lng')),
    __param(3, (0, common_1.Query)('radius')),
    __param(4, (0, common_1.Query)('categories')),
    __param(5, (0, common_1.Query)('minRating')),
    __param(6, (0, common_1.Query)('openNow')),
    __param(7, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], ItineraryItemsController.prototype, "searchNearbyPoi", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({
        summary: '获取单个行程项详情',
        description: '根据 ID 获取完整的行程项信息，包括关联的 Place 和 TripDay'
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程项 ID (UUID)', example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回行程项详情（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '行程项不存在（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ItineraryItemsController.prototype, "findOne", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Patch)(':id'),
    (0, swagger_1.ApiOperation)({
        summary: '更新行程项（带智能校验和级联影响分析）',
        description: `更新行程项信息。系统会：
1. 执行时间重叠、交通时间等校验
2. 分析修改对后续行程项的级联影响
3. 返回受影响的行程项及建议的调整时间

如存在潜在问题或级联影响，将返回警告要求用户确认后继续。`
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程项 ID (UUID)' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '更新成功（统一响应格式，包含级联影响）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '校验失败或需要确认（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_itinerary_item_dto_1.UpdateItineraryItemDto]),
    __metadata("design:returntype", Promise)
], ItineraryItemsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({
        summary: '删除行程项',
        description: '删除指定的行程项'
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程项 ID (UUID)' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '删除成功（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '行程项不存在（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ItineraryItemsController.prototype, "remove", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(':id/cost'),
    (0, swagger_1.ApiOperation)({
        summary: '获取行程项费用信息',
        description: '获取单个行程项的费用详情'
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程项 ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '费用信息' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ItineraryItemsController.prototype, "getItemCost", null);
__decorate([
    (0, common_1.Patch)(':id/cost'),
    (0, swagger_1.ApiOperation)({
        summary: '更新行程项费用',
        description: '更新单个行程项的预估费用、实际费用、支付状态等'
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程项 ID' }),
    (0, swagger_1.ApiBody)({ type: item_cost_dto_1.ItemCostDto }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '更新成功' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, item_cost_dto_1.ItemCostDto]),
    __metadata("design:returntype", Promise)
], ItineraryItemsController.prototype, "updateItemCost", null);
__decorate([
    (0, common_1.Patch)('batch-cost'),
    (0, swagger_1.ApiOperation)({
        summary: '批量更新行程项费用',
        description: '批量更新多个行程项的实际费用和支付状态，适用于旅行后记账场景'
    }),
    (0, swagger_1.ApiBody)({ type: item_cost_dto_1.BatchUpdateCostDto }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '批量更新结果', type: item_cost_dto_1.BatchUpdateCostResultDto }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [item_cost_dto_1.BatchUpdateCostDto]),
    __metadata("design:returntype", Promise)
], ItineraryItemsController.prototype, "batchUpdateCost", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('trip/:tripId/cost-summary'),
    (0, swagger_1.ApiOperation)({
        summary: '获取行程费用汇总',
        description: '获取行程的费用汇总，包括按分类、按日期的统计，以及预算使用情况'
    }),
    (0, swagger_1.ApiParam)({ name: 'tripId', description: '行程 ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '费用汇总', type: item_cost_dto_1.TripCostSummaryDto }),
    __param(0, (0, common_1.Param)('tripId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ItineraryItemsController.prototype, "getTripCostSummary", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('trip/:tripId/unpaid'),
    (0, swagger_1.ApiOperation)({
        summary: '获取未支付的行程项',
        description: '获取行程中所有未支付的行程项列表，便于用户追踪待付款项目'
    }),
    (0, swagger_1.ApiParam)({ name: 'tripId', description: '行程 ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '未支付行程项列表' }),
    __param(0, (0, common_1.Param)('tripId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ItineraryItemsController.prototype, "getUnpaidItems", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('trip/:tripId/fix-dates'),
    (0, swagger_1.ApiOperation)({
        summary: '[Admin] 修复行程项日期一致性',
        description: '⚠️ 管理/维护接口。修复行程项的 startTime/endTime 与所属 TripDay.date 不一致的问题。会自动将日期调整为正确的日期，同时保留时间部分'
    }),
    (0, swagger_1.ApiParam)({ name: 'tripId', description: '行程 ID' }),
    (0, swagger_1.ApiResponse)({
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
    }),
    __param(0, (0, common_1.Param)('tripId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ItineraryItemsController.prototype, "fixItemDates", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('trip/:tripId/calculate-all-travel'),
    (0, swagger_1.ApiOperation)({
        summary: '计算整个行程的交通信息（支持跨天）',
        description: '自动计算整个行程所有行程项之间的交通时间和距离，包括跨天的交通段。例如：第1天最后一个景点 → 第2天第一个景点'
    }),
    (0, swagger_1.ApiParam)({ name: 'tripId', description: '行程 ID' }),
    (0, swagger_1.ApiBody)({
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
    }),
    (0, swagger_1.ApiResponse)({
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
    }),
    __param(0, (0, common_1.Param)('tripId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ItineraryItemsController.prototype, "calculateAllTravelInfo", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('trip/:tripId/days/:dayId/calculate-travel'),
    (0, swagger_1.ApiOperation)({
        summary: '自动计算单天交通信息',
        description: '自动计算某天所有行程项之间的交通时间和距离，并保存到数据库。支持自动选择交通方式：<1km步行，1-50km驾车，>50km需手动指定'
    }),
    (0, swagger_1.ApiParam)({ name: 'tripId', description: '行程 ID' }),
    (0, swagger_1.ApiParam)({ name: 'dayId', description: '行程日期 ID' }),
    (0, swagger_1.ApiBody)({
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
    }),
    (0, swagger_1.ApiResponse)({
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
    }),
    __param(0, (0, common_1.Param)('tripId')),
    __param(1, (0, common_1.Param)('dayId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], ItineraryItemsController.prototype, "calculateTravelInfo", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('trip/:tripId/days/:dayId/travel-info'),
    (0, swagger_1.ApiOperation)({
        summary: '获取某天的交通信息',
        description: '计算某天所有行程项之间的交通时间、距离和交通方式'
    }),
    (0, swagger_1.ApiParam)({ name: 'tripId', description: '行程 ID' }),
    (0, swagger_1.ApiParam)({ name: 'dayId', description: '行程日期 ID' }),
    (0, swagger_1.ApiResponse)({
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
                            duration: { type: 'number', description: '分钟' },
                            distance: { type: 'number', description: '米' },
                            travelMode: { type: 'string', enum: ['DRIVING', 'WALKING', 'TRANSIT', 'FLIGHT', 'TRAIN', 'FERRY', 'BICYCLE', 'TAXI'] },
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
    }),
    __param(0, (0, common_1.Param)('tripId')),
    __param(1, (0, common_1.Param)('dayId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ItineraryItemsController.prototype, "getDayTravelInfo", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Patch)(':id/booking'),
    (0, swagger_1.ApiOperation)({
        summary: '更新预订状态',
        description: '更新行程项的预订状态、确认号、预订链接等信息'
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程项 ID' }),
    (0, swagger_1.ApiBody)({
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
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '更新成功' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ItineraryItemsController.prototype, "updateBookingStatus", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Patch)(':id/travel-info'),
    (0, swagger_1.ApiOperation)({
        summary: '更新交通信息',
        description: '更新行程项从上一地点的交通时间、距离和交通方式'
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '行程项 ID' }),
    (0, swagger_1.ApiBody)({
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
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '更新成功' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ItineraryItemsController.prototype, "updateTravelInfo", null);
exports.ItineraryItemsController = ItineraryItemsController = ItineraryItemsController_1 = __decorate([
    (0, swagger_1.ApiTags)('itinerary-items'),
    (0, common_1.Controller)('itinerary-items'),
    __metadata("design:paramtypes", [itinerary_items_service_1.ItineraryItemsService,
        itinerary_validation_service_1.ItineraryValidationService,
        item_cost_service_1.ItemCostService])
], ItineraryItemsController);
//# sourceMappingURL=itinerary-items.controller.js.map