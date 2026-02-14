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
exports.DecisionStatsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const decision_stats_service_1 = require("./services/decision-stats.service");
const heuristic_diet_service_1 = require("./services/heuristic-diet.service");
const decision_log_clustering_service_1 = require("./evaluation/decision-log-clustering.service");
const api_response_dto_1 = require("../../common/dto/api-response.dto");
const public_decorator_1 = require("../../auth/decorators/public.decorator");
let DecisionStatsController = class DecisionStatsController {
    constructor(decisionStats, heuristicDiet, clusteringService) {
        this.decisionStats = decisionStats;
        this.heuristicDiet = heuristicDiet;
        this.clusteringService = clusteringService;
    }
    async getStatsByCountry(countryCode, startDate, endDate) {
        const start = startDate ? new Date(startDate) : undefined;
        const end = endDate ? new Date(endDate) : undefined;
        return this.decisionStats.getStatsByCountry(countryCode, start, end);
    }
    async getStatsByRouteDirection(routeDirectionId, startDate, endDate) {
        const start = startDate ? new Date(startDate) : undefined;
        const end = endDate ? new Date(endDate) : undefined;
        return this.decisionStats.getStatsByRouteDirection(routeDirectionId, start, end);
    }
    async getPersonaTriggerStats(startDate, endDate) {
        const start = startDate ? new Date(startDate) : undefined;
        const end = endDate ? new Date(endDate) : undefined;
        return this.decisionStats.getPersonaTriggerStats(start, end);
    }
    async getRealityDrivenRatio(countryCode, routeDirectionId, startDate, endDate) {
        const start = startDate ? new Date(startDate) : undefined;
        const end = endDate ? new Date(endDate) : undefined;
        const ratio = await this.decisionStats.getRealityDrivenRatio(countryCode, routeDirectionId, start, end);
        return {
            ratio,
            percentage: (ratio * 100).toFixed(1) + '%',
            message: `我们 ${(ratio * 100).toFixed(1)}% 的关键决策来自物理现实建模，而不是启发式。`,
        };
    }
    async getHeuristicHotspots(limit) {
        const limitNum = limit ? parseInt(limit, 10) : 10;
        return this.decisionStats.getHeuristicHotspots(limitNum);
    }
    async getHeuristicDietPlan() {
        return this.heuristicDiet.generateDietPlan();
    }
    async getRejectionReasons(countryCode, routeDirectionId, startDate, endDate, limit) {
        const start = startDate ? new Date(startDate) : undefined;
        const end = endDate ? new Date(endDate) : undefined;
        const limitNum = limit ? parseInt(limit, 10) : 10;
        return this.clusteringService.analyzeRejectionReasons({
            countryCode,
            routeDirectionId,
            startDate: start,
            endDate: end,
            limit: limitNum,
        });
    }
    async getReplacementReasons(countryCode, routeDirectionId, startDate, endDate, limit) {
        const start = startDate ? new Date(startDate) : undefined;
        const end = endDate ? new Date(endDate) : undefined;
        const limitNum = limit ? parseInt(limit, 10) : 10;
        return this.clusteringService.analyzeReplacementReasons({
            countryCode,
            routeDirectionId,
            startDate: start,
            endDate: end,
            limit: limitNum,
        });
    }
    async getQualityReport(countryCode, routeDirectionId, startDate, endDate) {
        const start = startDate ? new Date(startDate) : undefined;
        const end = endDate ? new Date(endDate) : undefined;
        return this.clusteringService.generateQualityReport({
            countryCode,
            routeDirectionId,
            startDate: start,
            endDate: end,
        });
    }
};
exports.DecisionStatsController = DecisionStatsController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('by-country'),
    (0, swagger_1.ApiOperation)({
        summary: '按国家统计决策分布',
        description: '获取指定国家在指定时间范围内的决策统计分布数据',
    }),
    (0, swagger_1.ApiQuery)({ name: 'countryCode', required: false, description: '国家代码（如 IS）' }),
    (0, swagger_1.ApiQuery)({ name: 'startDate', required: false, description: '开始日期（YYYY-MM-DD）' }),
    (0, swagger_1.ApiQuery)({ name: 'endDate', required: false, description: '结束日期（YYYY-MM-DD）' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '成功返回统计结果', type: api_response_dto_1.ApiSuccessResponseDto }),
    __param(0, (0, common_1.Query)('countryCode')),
    __param(1, (0, common_1.Query)('startDate')),
    __param(2, (0, common_1.Query)('endDate')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], DecisionStatsController.prototype, "getStatsByCountry", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('by-route'),
    (0, swagger_1.ApiOperation)({
        summary: '按路线方向统计决策分布',
        description: '获取指定路线方向在指定时间范围内的决策统计分布数据',
    }),
    (0, swagger_1.ApiQuery)({ name: 'routeDirectionId', required: false, description: '路线方向 ID' }),
    (0, swagger_1.ApiQuery)({ name: 'startDate', required: false, description: '开始日期（YYYY-MM-DD）' }),
    (0, swagger_1.ApiQuery)({ name: 'endDate', required: false, description: '结束日期（YYYY-MM-DD）' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '成功返回统计结果', type: api_response_dto_1.ApiSuccessResponseDto }),
    __param(0, (0, common_1.Query)('routeDirectionId')),
    __param(1, (0, common_1.Query)('startDate')),
    __param(2, (0, common_1.Query)('endDate')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], DecisionStatsController.prototype, "getStatsByRouteDirection", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('by-persona'),
    (0, swagger_1.ApiOperation)({
        summary: '按 Persona 统计触发频次',
        description: '获取三人格（Abu/Dr.Dre/Neptune）在指定时间范围内的触发频次统计',
    }),
    (0, swagger_1.ApiQuery)({ name: 'startDate', required: false, description: '开始日期（YYYY-MM-DD）' }),
    (0, swagger_1.ApiQuery)({ name: 'endDate', required: false, description: '结束日期（YYYY-MM-DD）' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '成功返回统计结果', type: api_response_dto_1.ApiSuccessResponseDto }),
    __param(0, (0, common_1.Query)('startDate')),
    __param(1, (0, common_1.Query)('endDate')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], DecisionStatsController.prototype, "getPersonaTriggerStats", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('reality-driven-ratio'),
    (0, swagger_1.ApiOperation)({
        summary: '获取硬现实驱动比例',
        description: '计算基于物理现实建模的决策比例（而非启发式）',
    }),
    (0, swagger_1.ApiQuery)({ name: 'countryCode', required: false, description: '国家代码' }),
    (0, swagger_1.ApiQuery)({ name: 'routeDirectionId', required: false, description: '路线方向 ID' }),
    (0, swagger_1.ApiQuery)({ name: 'startDate', required: false, description: '开始日期（YYYY-MM-DD）' }),
    (0, swagger_1.ApiQuery)({ name: 'endDate', required: false, description: '结束日期（YYYY-MM-DD）' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '成功返回比例数据', type: api_response_dto_1.ApiSuccessResponseDto }),
    __param(0, (0, common_1.Query)('countryCode')),
    __param(1, (0, common_1.Query)('routeDirectionId')),
    __param(2, (0, common_1.Query)('startDate')),
    __param(3, (0, common_1.Query)('endDate')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], DecisionStatsController.prototype, "getRealityDrivenRatio", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('heuristic-hotspots'),
    (0, swagger_1.ApiOperation)({
        summary: '获取 HEURISTIC 决策热点',
        description: '获取启发式决策的热点区域（需要优化的地方）',
    }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, description: '返回数量限制', type: Number }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '成功返回热点数据', type: api_response_dto_1.ApiSuccessResponseDto }),
    __param(0, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DecisionStatsController.prototype, "getHeuristicHotspots", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('heuristic-diet-plan'),
    (0, swagger_1.ApiOperation)({
        summary: '生成 HEURISTIC 减肥计划',
        description: '生成减少启发式决策的优化计划',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '成功返回减肥计划', type: api_response_dto_1.ApiSuccessResponseDto }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], DecisionStatsController.prototype, "getHeuristicDietPlan", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('rejection-reasons'),
    (0, swagger_1.ApiOperation)({
        summary: '分析最常见的拒绝原因',
        description: '使用聚类分析最常见的行程拒绝原因',
    }),
    (0, swagger_1.ApiQuery)({ name: 'countryCode', required: false, description: '国家代码' }),
    (0, swagger_1.ApiQuery)({ name: 'routeDirectionId', required: false, description: '路线方向 ID' }),
    (0, swagger_1.ApiQuery)({ name: 'startDate', required: false, description: '开始日期（YYYY-MM-DD）' }),
    (0, swagger_1.ApiQuery)({ name: 'endDate', required: false, description: '结束日期（YYYY-MM-DD）' }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, description: '返回数量限制', type: Number }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '成功返回拒绝原因分析', type: api_response_dto_1.ApiSuccessResponseDto }),
    __param(0, (0, common_1.Query)('countryCode')),
    __param(1, (0, common_1.Query)('routeDirectionId')),
    __param(2, (0, common_1.Query)('startDate')),
    __param(3, (0, common_1.Query)('endDate')),
    __param(4, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], DecisionStatsController.prototype, "getRejectionReasons", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('replacement-reasons'),
    (0, swagger_1.ApiOperation)({
        summary: '分析最常见的替换原因',
        description: '使用聚类分析最常见的行程替换原因',
    }),
    (0, swagger_1.ApiQuery)({ name: 'countryCode', required: false, description: '国家代码' }),
    (0, swagger_1.ApiQuery)({ name: 'routeDirectionId', required: false, description: '路线方向 ID' }),
    (0, swagger_1.ApiQuery)({ name: 'startDate', required: false, description: '开始日期（YYYY-MM-DD）' }),
    (0, swagger_1.ApiQuery)({ name: 'endDate', required: false, description: '结束日期（YYYY-MM-DD）' }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, description: '返回数量限制', type: Number }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '成功返回替换原因分析', type: api_response_dto_1.ApiSuccessResponseDto }),
    __param(0, (0, common_1.Query)('countryCode')),
    __param(1, (0, common_1.Query)('routeDirectionId')),
    __param(2, (0, common_1.Query)('startDate')),
    __param(3, (0, common_1.Query)('endDate')),
    __param(4, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], DecisionStatsController.prototype, "getReplacementReasons", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('quality-report'),
    (0, swagger_1.ApiOperation)({
        summary: '生成决策质量报告',
        description: '生成综合的决策质量分析报告，包含拒绝率、替换率、现实驱动比例等指标',
    }),
    (0, swagger_1.ApiQuery)({ name: 'countryCode', required: false, description: '国家代码' }),
    (0, swagger_1.ApiQuery)({ name: 'routeDirectionId', required: false, description: '路线方向 ID' }),
    (0, swagger_1.ApiQuery)({ name: 'startDate', required: false, description: '开始日期（YYYY-MM-DD）' }),
    (0, swagger_1.ApiQuery)({ name: 'endDate', required: false, description: '结束日期（YYYY-MM-DD）' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '成功返回质量报告', type: api_response_dto_1.ApiSuccessResponseDto }),
    __param(0, (0, common_1.Query)('countryCode')),
    __param(1, (0, common_1.Query)('routeDirectionId')),
    __param(2, (0, common_1.Query)('startDate')),
    __param(3, (0, common_1.Query)('endDate')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], DecisionStatsController.prototype, "getQualityReport", null);
exports.DecisionStatsController = DecisionStatsController = __decorate([
    (0, swagger_1.ApiTags)('decision'),
    (0, common_1.Controller)('decision-stats'),
    __metadata("design:paramtypes", [decision_stats_service_1.DecisionStatsService,
        heuristic_diet_service_1.HeuristicDietService,
        decision_log_clustering_service_1.DecisionLogClusteringService])
], DecisionStatsController);
//# sourceMappingURL=decision-stats.controller.js.map