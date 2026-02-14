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
exports.TransportController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const transport_plan_dto_1 = require("./dto/transport-plan.dto");
const transport_routing_service_1 = require("./transport-routing.service");
const standard_response_dto_1 = require("../common/dto/standard-response.dto");
const api_response_dto_1 = require("../common/dto/api-response.dto");
let TransportController = class TransportController {
    constructor(routingService) {
        this.routingService = routingService;
    }
    async planRoute(dto) {
        try {
            const context = {
                hasLuggage: dto.hasLuggage || false,
                hasElderly: dto.hasElderly || false,
                isRaining: dto.isRaining || false,
                budgetSensitivity: dto.budgetSensitivity || 'MEDIUM',
                timeSensitivity: dto.timeSensitivity || 'MEDIUM',
                hasLimitedMobility: dto.hasLimitedMobility || false,
                currentCity: dto.currentCity,
                targetCity: dto.targetCity,
                isMovingDay: dto.isMovingDay || (dto.currentCity !== dto.targetCity && !!dto.currentCity && !!dto.targetCity),
            };
            const result = await this.routingService.planRoute(dto.fromLat, dto.fromLng, dto.toLat, dto.toLng, context);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message);
            }
            throw error;
        }
    }
};
exports.TransportController = TransportController;
__decorate([
    (0, common_1.Post)('plan'),
    (0, swagger_1.ApiOperation)({
        summary: '规划交通路线（智能推荐）',
        description: '根据起点和终点，智能推荐最佳交通方式。\n\n' +
            '**核心特性：**\n' +
            '- 自动区分大交通（城市间）和小交通（市内）\n' +
            '- 根据用户画像（行李、老人、天气等）智能排序\n' +
            '- 计算"痛苦指数"，推荐最舒适的方案\n' +
            '- 提供推荐理由和警告信息\n\n' +
            '**推荐逻辑：**\n' +
            '- 大交通：默认推荐铁路/高铁，预算敏感推荐巴士，时间敏感推荐飞机\n' +
            '- 小交通：步行（<1.5km且天气好）、公共交通（>1.5km）、打车（有行李/老人/下雨）',
    }),
    (0, swagger_1.ApiBody)({
        type: transport_plan_dto_1.TransportPlanDto,
        description: '交通规划请求参数',
        examples: {
            intraCity: {
                summary: '市内交通示例',
                value: {
                    fromLat: 35.6762,
                    fromLng: 139.6503,
                    toLat: 35.6812,
                    toLng: 139.7671,
                    hasLuggage: false,
                    hasElderly: false,
                    isRaining: false,
                    budgetSensitivity: 'MEDIUM',
                },
            },
            interCity: {
                summary: '城市间交通示例',
                value: {
                    fromLat: 35.6762,
                    fromLng: 139.6503,
                    toLat: 34.6937,
                    toLng: 135.5023,
                    hasLuggage: true,
                    isMovingDay: true,
                    budgetSensitivity: 'HIGH',
                    timeSensitivity: 'MEDIUM',
                },
            },
            withElderly: {
                summary: '有老人同行示例',
                value: {
                    fromLat: 35.6762,
                    fromLng: 139.6503,
                    toLat: 35.6812,
                    toLng: 139.7671,
                    hasElderly: true,
                    isRaining: true,
                    budgetSensitivity: 'LOW',
                },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回交通推荐（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '输入数据验证失败（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [transport_plan_dto_1.TransportPlanDto]),
    __metadata("design:returntype", Promise)
], TransportController.prototype, "planRoute", null);
exports.TransportController = TransportController = __decorate([
    (0, swagger_1.ApiTags)('transport'),
    (0, common_1.Controller)('transport'),
    __metadata("design:paramtypes", [transport_routing_service_1.TransportRoutingService])
], TransportController);
//# sourceMappingURL=transport.controller.js.map