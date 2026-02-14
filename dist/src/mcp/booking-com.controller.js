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
var BookingComController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingComController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const booking_com_service_1 = require("./booking-com.service");
const booking_com_monitoring_service_1 = require("./booking-com-monitoring.service");
const booking_com_dto_1 = require("./dto/booking-com.dto");
const standard_response_dto_1 = require("../common/dto/standard-response.dto");
const api_response_dto_1 = require("../common/dto/api-response.dto");
const public_decorator_1 = require("../auth/decorators/public.decorator");
let BookingComController = BookingComController_1 = class BookingComController {
    constructor(bookingComService, monitoringService) {
        this.bookingComService = bookingComService;
        this.monitoringService = monitoringService;
        this.logger = new common_1.Logger(BookingComController_1.name);
    }
    async searchCarRentals(dto) {
        try {
            if (!this.bookingComService.isAvailable()) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'Booking.com service is not available. Please check RAPIDAPI_BOOKING_COM_API_KEY configuration.');
            }
            const result = await this.bookingComService.searchCarRentals(dto);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Search car rentals failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '搜索租车失败');
        }
    }
    async health() {
        return (0, standard_response_dto_1.successResponse)({
            available: this.bookingComService.isAvailable(),
            service: 'booking-com',
        });
    }
    async getMonitoringStats(days) {
        const daysNum = days ? parseInt(days, 10) : 7;
        if (isNaN(daysNum) || daysNum < 1 || daysNum > 30) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.BAD_REQUEST, 'days 必须是 1-30 之间的数字');
        }
        try {
            const performance = await this.monitoringService.getPerformanceSummary(daysNum);
            const totalCost = await this.monitoringService.getTotalCostEstimate(daysNum);
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - daysNum);
            const dailyStats = await this.monitoringService.getStatsForDateRange(startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]);
            return (0, standard_response_dto_1.successResponse)({
                dailyStats,
                performance,
                totalCostEstimate: totalCost,
            });
        }
        catch (error) {
            this.logger.error(`Failed to get monitoring stats: ${error.message}`);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, `获取监控统计失败: ${error.message}`);
        }
    }
    async checkCostLimit(limit, days) {
        const limitNum = parseFloat(limit);
        if (isNaN(limitNum) || limitNum < 0) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.BAD_REQUEST, 'limit 必须是有效的正数');
        }
        const daysNum = days ? parseInt(days, 10) : 7;
        if (isNaN(daysNum) || daysNum < 1 || daysNum > 30) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.BAD_REQUEST, 'days 必须是 1-30 之间的数字');
        }
        try {
            const result = await this.monitoringService.checkCostLimit(limitNum, daysNum);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error(`Failed to check cost limit: ${error.message}`);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, `检查成本限制失败: ${error.message}`);
        }
    }
};
exports.BookingComController = BookingComController;
__decorate([
    (0, common_1.Post)('search'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '搜索租车',
        description: '根据取车/还车地点和时间搜索可用租车',
    }),
    (0, swagger_1.ApiBody)({ type: booking_com_dto_1.SearchCarRentalsDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '搜索成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: '请求参数错误',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [booking_com_dto_1.SearchCarRentalsDto]),
    __metadata("design:returntype", Promise)
], BookingComController.prototype, "searchCarRentals", null);
__decorate([
    (0, common_1.Get)('health'),
    (0, swagger_1.ApiOperation)({
        summary: '检查服务状态',
        description: '检查 Booking.com 服务是否可用',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '服务状态',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], BookingComController.prototype, "health", null);
__decorate([
    (0, common_1.Get)('monitoring/stats'),
    (0, swagger_1.ApiOperation)({ summary: '获取 Booking.com API 监控统计' }),
    (0, swagger_1.ApiQuery)({ name: 'days', required: false, type: Number, description: '统计天数（默认 7 天）' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '成功返回监控统计' }),
    __param(0, (0, common_1.Query)('days')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], BookingComController.prototype, "getMonitoringStats", null);
__decorate([
    (0, common_1.Get)('monitoring/cost-check'),
    (0, swagger_1.ApiOperation)({ summary: '检查是否超过成本限制' }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: true, type: Number, description: '成本限制（USD）' }),
    (0, swagger_1.ApiQuery)({ name: 'days', required: false, type: Number, description: '统计天数（默认 7 天）' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '成功返回成本检查结果' }),
    __param(0, (0, common_1.Query)('limit')),
    __param(1, (0, common_1.Query)('days')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], BookingComController.prototype, "checkCostLimit", null);
exports.BookingComController = BookingComController = BookingComController_1 = __decorate([
    (0, swagger_1.ApiTags)('booking-com'),
    (0, common_1.Controller)('booking-com'),
    (0, public_decorator_1.Public)(),
    __metadata("design:paramtypes", [booking_com_service_1.BookingComService,
        booking_com_monitoring_service_1.BookingComMonitoringService])
], BookingComController);
//# sourceMappingURL=booking-com.controller.js.map