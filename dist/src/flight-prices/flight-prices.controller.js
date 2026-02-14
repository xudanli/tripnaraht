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
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlightPricesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const flight_price_service_1 = require("../trips/services/flight-price.service");
const flight_price_detail_service_1 = require("../trips/services/flight-price-detail.service");
const flight_price_detail_enhanced_service_1 = require("../trips/services/flight-price-detail-enhanced.service");
const price_prediction_service_1 = require("./services/price-prediction.service");
const create_flight_price_dto_1 = require("./dto/create-flight-price.dto");
const update_flight_price_dto_1 = require("./dto/update-flight-price.dto");
const predict_price_dto_1 = require("./dto/predict-price.dto");
const standard_response_dto_1 = require("../common/dto/standard-response.dto");
const api_response_dto_1 = require("../common/dto/api-response.dto");
let FlightPricesController = class FlightPricesController {
    constructor(flightPriceService, flightPriceDetailService, flightPriceDetailEnhancedService, pricePredictionService) {
        this.flightPriceService = flightPriceService;
        this.flightPriceDetailService = flightPriceDetailService;
        this.flightPriceDetailEnhancedService = flightPriceDetailEnhancedService;
        this.pricePredictionService = pricePredictionService;
    }
    async estimatePrice(countryCode, originCity, useConservative = 'true') {
        try {
            const useConservativeBool = useConservative !== 'false';
            const totalCost = await this.flightPriceService.getEstimatedCost(countryCode, originCity, useConservativeBool);
            const details = await this.flightPriceService.getPriceDetails(countryCode, originCity);
            let result;
            if (!details) {
                result = {
                    totalCost,
                    flightPrice: totalCost,
                    visaCost: 0,
                    useConservative: useConservativeBool,
                    countryCode: countryCode.toUpperCase(),
                    originCity: originCity === null || originCity === void 0 ? void 0 : originCity.toUpperCase(),
                };
            }
            else {
                result = {
                    totalCost,
                    flightPrice: useConservativeBool
                        ? details.flightPrice.highSeason
                        : details.flightPrice.average,
                    visaCost: details.visaCost,
                    useConservative: useConservativeBool,
                    countryCode: countryCode.toUpperCase(),
                    originCity: originCity === null || originCity === void 0 ? void 0 : originCity.toUpperCase(),
                };
            }
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message);
            }
            throw error;
        }
    }
    async getPriceDetails(countryCode, originCity) {
        try {
            const details = await this.flightPriceService.getPriceDetails(countryCode, originCity);
            if (!details) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, `未找到 ${countryCode}${originCity ? ` (${originCity})` : ''} 的价格参考数据`);
            }
            return (0, standard_response_dto_1.successResponse)(details);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            throw error;
        }
    }
    async findAll() {
        const prices = await this.flightPriceService.findAll();
        return (0, standard_response_dto_1.successResponse)(prices);
    }
    async estimateDomesticPrice(originCity, destinationCity, month, dayOfWeek) {
        try {
            const dayOfWeekNum = dayOfWeek ? parseInt(dayOfWeek) : undefined;
            if (month < 1 || month > 12) {
                throw new common_1.BadRequestException('月份必须在 1-12 之间');
            }
            if (dayOfWeekNum !== undefined && (dayOfWeekNum < 0 || dayOfWeekNum > 6)) {
                throw new common_1.BadRequestException('星期几必须在 0-6 之间（0=周一, 6=周日）');
            }
            const result = await this.flightPriceDetailService.estimateDomesticPrice(originCity, destinationCity, month, dayOfWeekNum);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message);
            }
            throw error;
        }
    }
    async getMonthlyTrend(originCity, destinationCity) {
        const trend = await this.flightPriceDetailService.getMonthlyTrend(originCity, destinationCity);
        return (0, standard_response_dto_1.successResponse)(trend);
    }
    async getDayOfWeekFactors() {
        const factors = await this.flightPriceDetailService.getAllDayOfWeekFactors();
        return (0, standard_response_dto_1.successResponse)(factors);
    }
    async predictPrice(dto) {
        try {
            const result = await this.pricePredictionService.predictFlightPrice({
                from_city: dto.from_city,
                to_city: dto.to_city,
                departure_date: dto.departure_date,
                return_date: dto.return_date,
            });
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getDetailedPriceOptions(originCity, destinationCity, month, dayOfWeek) {
        try {
            const dayOfWeekNum = dayOfWeek ? parseInt(dayOfWeek) : undefined;
            if (month < 1 || month > 12) {
                throw new common_1.BadRequestException('月份必须在 1-12 之间');
            }
            if (dayOfWeekNum !== undefined && (dayOfWeekNum < 0 || dayOfWeekNum > 6)) {
                throw new common_1.BadRequestException('星期几必须在 0-6 之间（0=周一, 6=周日）');
            }
            const result = await this.flightPriceDetailEnhancedService.getDetailedPriceOptions(originCity, destinationCity, month, dayOfWeekNum);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message);
            }
            throw error;
        }
    }
    async findOne(id) {
        try {
            const priceRef = await this.flightPriceService.findOne(id);
            if (!priceRef) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, `价格参考数据 ID ${id} 不存在`);
            }
            return (0, standard_response_dto_1.successResponse)(priceRef);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            throw error;
        }
    }
    async create(createDto) {
        try {
            const priceRef = await this.flightPriceService.create(createDto);
            return (0, standard_response_dto_1.successResponse)(priceRef);
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message);
            }
            throw error;
        }
    }
    async update(id, updateDto) {
        try {
            const existing = await this.flightPriceService.findOne(id);
            if (!existing) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, `价格参考数据 ID ${id} 不存在`);
            }
            const updated = await this.flightPriceService.update(id, updateDto);
            return (0, standard_response_dto_1.successResponse)(updated);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            if (error instanceof common_1.BadRequestException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message);
            }
            throw error;
        }
    }
    async remove(id) {
        try {
            const existing = await this.flightPriceService.findOne(id);
            if (!existing) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, `价格参考数据 ID ${id} 不存在`);
            }
            await this.flightPriceService.remove(id);
            return (0, standard_response_dto_1.successResponse)({ message: '删除成功' });
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            throw error;
        }
    }
};
exports.FlightPricesController = FlightPricesController;
__decorate([
    (0, common_1.Get)('estimate'),
    (0, swagger_1.ApiOperation)({
        summary: '估算机票+签证成本',
        description: '根据目的地国家代码和出发城市（可选）估算机票和签证的总成本。\n' +
            '返回保守估算值（旺季价格）或平均估算值。',
    }),
    (0, swagger_1.ApiQuery)({
        name: 'countryCode',
        description: '目的地国家代码（ISO 3166-1 alpha-2）',
        example: 'JP',
    }),
    (0, swagger_1.ApiQuery)({
        name: 'originCity',
        description: '出发城市代码（可选），如 "PEK"（北京）、"PVG"（上海）',
        example: 'PEK',
        required: false,
    }),
    (0, swagger_1.ApiQuery)({
        name: 'useConservative',
        description: '是否使用保守估算（旺季价格），默认 true',
        example: true,
        required: false,
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回估算成本（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Query)('countryCode')),
    __param(1, (0, common_1.Query)('originCity')),
    __param(2, (0, common_1.Query)('useConservative')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], FlightPricesController.prototype, "estimatePrice", null);
__decorate([
    (0, common_1.Get)('details'),
    (0, swagger_1.ApiOperation)({
        summary: '获取详细价格信息',
        description: '返回指定目的地和出发城市的详细价格信息，包括淡季、旺季、平均价格和签证费用。',
    }),
    (0, swagger_1.ApiQuery)({
        name: 'countryCode',
        description: '目的地国家代码（ISO 3166-1 alpha-2）',
        example: 'JP',
    }),
    (0, swagger_1.ApiQuery)({
        name: 'originCity',
        description: '出发城市代码（可选）',
        example: 'PEK',
        required: false,
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回详细价格信息（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '未找到价格参考数据（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Query)('countryCode')),
    __param(1, (0, common_1.Query)('originCity')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], FlightPricesController.prototype, "getPriceDetails", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({
        summary: '[Admin] 获取所有价格参考数据',
        description: '⚠️ 管理后台接口。返回所有已配置的机票价格参考数据列表。',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回价格参考数据列表（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], FlightPricesController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('domestic/estimate'),
    (0, swagger_1.ApiOperation)({
        summary: '估算国内航线价格（基于历史数据）',
        description: '根据2023-2024年历史数据估算国内航线价格。\n\n' +
            '**计算公式：**\n' +
            '预算价格 = 月度基准价 (P_month) × 周内因子 (F_day)\n\n' +
            '**数据来源：**\n' +
            '- 基于2023-2024年中国航空航班历史数据\n' +
            '- 自动计算周内因子（周一至周日的价格波动）\n' +
            '- 自动计算月度基准价（1-12月的季节性波动）',
    }),
    (0, swagger_1.ApiQuery)({
        name: 'originCity',
        description: '出发城市',
        example: '成都',
    }),
    (0, swagger_1.ApiQuery)({
        name: 'destinationCity',
        description: '到达城市',
        example: '深圳',
    }),
    (0, swagger_1.ApiQuery)({
        name: 'month',
        description: '月份（1-12）',
        example: 3,
        type: Number,
    }),
    (0, swagger_1.ApiQuery)({
        name: 'dayOfWeek',
        description: '星期几（0=周一, 6=周日，可选）',
        example: 4,
        type: Number,
        required: false,
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回估算价格（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '输入数据验证失败（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Query)('originCity')),
    __param(1, (0, common_1.Query)('destinationCity')),
    __param(2, (0, common_1.Query)('month', common_1.ParseIntPipe)),
    __param(3, (0, common_1.Query)('dayOfWeek')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number, String]),
    __metadata("design:returntype", Promise)
], FlightPricesController.prototype, "estimateDomesticPrice", null);
__decorate([
    (0, common_1.Get)('domestic/monthly-trend'),
    (0, swagger_1.ApiOperation)({
        summary: '获取航线的月度价格趋势',
        description: '返回指定航线在全年12个月的价格趋势数据。',
    }),
    (0, swagger_1.ApiQuery)({
        name: 'originCity',
        description: '出发城市',
        example: '成都',
    }),
    (0, swagger_1.ApiQuery)({
        name: 'destinationCity',
        description: '到达城市',
        example: '深圳',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回月度趋势（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Query)('originCity')),
    __param(1, (0, common_1.Query)('destinationCity')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], FlightPricesController.prototype, "getMonthlyTrend", null);
__decorate([
    (0, common_1.Get)('day-of-week-factors'),
    (0, swagger_1.ApiOperation)({
        summary: '[Admin] 获取所有周内因子',
        description: '⚠️ 管理/调试接口。返回周一至周日的周内因子（相对于总平均价的倍数）。',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回周内因子列表（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], FlightPricesController.prototype, "getDayOfWeekFactors", null);
__decorate([
    (0, common_1.Post)('predict'),
    (0, swagger_1.ApiOperation)({
        summary: '预测机票价格趋势',
        description: '使用 Prophet 模型（或历史同期均值法）预测未来30天的机票价格趋势，并提供买入信号。\n\n' +
            '**功能：**\n' +
            '- 显示价格趋势红绿灯（BUY/WAIT/NEUTRAL）\n' +
            '- 预测未来30天的价格走势（含置信区间）\n' +
            '- 提供历史价格统计（均值、最低、最高）\n' +
            '- 自然语言建议（如"当前价格处于低位，建议立即购买"）',
    }),
    (0, swagger_1.ApiBody)({ type: predict_price_dto_1.FlightPricePredictionDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回价格预测（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '输入数据验证失败（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [predict_price_dto_1.FlightPricePredictionDto]),
    __metadata("design:returntype", Promise)
], FlightPricesController.prototype, "predictPrice", null);
__decorate([
    (0, common_1.Get)('domestic/detailed-options'),
    (0, swagger_1.ApiOperation)({
        summary: '获取详细价格选项（按航空公司和起飞时间）',
        description: '返回指定航线的详细价格选项，包括不同航空公司和不同起飞时间段的价格。\n\n' +
            '**返回内容：**\n' +
            '- 按航空公司分组的价格统计（平均价、最低价、最高价、样本数）\n' +
            '- 每个航空公司不同起飞时间段的价格\n' +
            '- 按起飞时间段分组的价格统计（包含该时段的所有航空公司）',
    }),
    (0, swagger_1.ApiQuery)({
        name: 'originCity',
        description: '出发城市',
        example: '成都',
    }),
    (0, swagger_1.ApiQuery)({
        name: 'destinationCity',
        description: '到达城市',
        example: '深圳',
    }),
    (0, swagger_1.ApiQuery)({
        name: 'month',
        description: '月份（1-12）',
        example: 3,
        type: Number,
    }),
    (0, swagger_1.ApiQuery)({
        name: 'dayOfWeek',
        description: '星期几（0=周一, 6=周日，可选）',
        example: 4,
        type: Number,
        required: false,
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回详细价格选项（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '输入数据验证失败（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Query)('originCity')),
    __param(1, (0, common_1.Query)('destinationCity')),
    __param(2, (0, common_1.Query)('month', common_1.ParseIntPipe)),
    __param(3, (0, common_1.Query)('dayOfWeek')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number, String]),
    __metadata("design:returntype", Promise)
], FlightPricesController.prototype, "getDetailedPriceOptions", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({
        summary: '[Admin] 根据 ID 获取价格参考数据',
        description: '⚠️ 管理后台接口。返回指定 ID 的价格参考数据详情。',
    }),
    (0, swagger_1.ApiParam)({
        name: 'id',
        description: '价格参考数据 ID',
        example: 1,
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回价格参考数据（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '未找到指定 ID 的价格参考数据（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], FlightPricesController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({
        summary: '[Admin] 创建价格参考数据',
        description: '⚠️ 管理后台接口。创建新的机票价格参考数据。系统会自动计算平均价格。',
    }),
    (0, swagger_1.ApiBody)({ type: create_flight_price_dto_1.CreateFlightPriceDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功创建价格参考数据（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '输入数据验证失败（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_flight_price_dto_1.CreateFlightPriceDto]),
    __metadata("design:returntype", Promise)
], FlightPricesController.prototype, "create", null);
__decorate([
    (0, common_1.Put)(':id'),
    (0, swagger_1.ApiOperation)({
        summary: '[Admin] 更新价格参考数据',
        description: '⚠️ 管理后台接口。更新指定 ID 的价格参考数据。如果更新了价格，系统会自动重新计算平均价格。',
    }),
    (0, swagger_1.ApiParam)({
        name: 'id',
        description: '价格参考数据 ID',
        example: 1,
    }),
    (0, swagger_1.ApiBody)({ type: update_flight_price_dto_1.UpdateFlightPriceDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功更新价格参考数据（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '未找到指定 ID 的价格参考数据（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, update_flight_price_dto_1.UpdateFlightPriceDto]),
    __metadata("design:returntype", Promise)
], FlightPricesController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({
        summary: '[Admin] 删除价格参考数据',
        description: '⚠️ 管理后台接口。删除指定 ID 的价格参考数据。',
    }),
    (0, swagger_1.ApiParam)({
        name: 'id',
        description: '价格参考数据 ID',
        example: 1,
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功删除价格参考数据',
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '未找到指定 ID 的价格参考数据',
    }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], FlightPricesController.prototype, "remove", null);
exports.FlightPricesController = FlightPricesController = __decorate([
    (0, swagger_1.ApiTags)('flight-prices'),
    (0, common_1.Controller)('flight-prices'),
    __metadata("design:paramtypes", [flight_price_service_1.FlightPriceService,
        flight_price_detail_service_1.FlightPriceDetailService,
        flight_price_detail_enhanced_service_1.FlightPriceDetailEnhancedService,
        price_prediction_service_1.PricePredictionService])
], FlightPricesController);
//# sourceMappingURL=flight-prices.controller.js.map