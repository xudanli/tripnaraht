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
exports.TripDetailController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const trip_detail_agent_service_1 = require("./services/trip-detail-agent.service");
const standard_response_dto_1 = require("../common/dto/standard-response.dto");
const public_decorator_1 = require("../auth/decorators/public.decorator");
let TripDetailController = class TripDetailController {
    constructor(tripDetailAgent) {
        this.tripDetailAgent = tripDetailAgent;
    }
    async execute(request) {
        try {
            const result = await this.tripDetailAgent.execute(request);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getStatus(tripId) {
        try {
            const result = await this.tripDetailAgent.execute({
                tripId,
                action: 'get_status',
            });
            return (0, standard_response_dto_1.successResponse)(result.uiOutput.status);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getMetricExplanation(tripId, dimension) {
        try {
            const result = await this.tripDetailAgent.execute({
                tripId,
                action: 'get_health',
            });
            const health = result.uiOutput.health;
            if (!health) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, '健康度数据不存在');
            }
            const dimensionData = health.dimensions[dimension];
            if (!dimensionData) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, `无效的维度: ${dimension}`);
            }
            const defaultWeights = {
                schedule: 0.30,
                budget: 0.25,
                pace: 0.25,
                feasibility: 0.20
            };
            const dimensionWeight = dimensionData.weight || defaultWeights[dimension] || 0.25;
            const contribution = dimensionData.score * dimensionWeight;
            const explanation = this.generateMetricExplanation(dimension, dimensionData, health.overall, dimensionWeight, contribution);
            return (0, standard_response_dto_1.successResponse)(explanation);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getHealth(tripId) {
        try {
            const result = await this.tripDetailAgent.execute({
                tripId,
                action: 'get_health',
            });
            return (0, standard_response_dto_1.successResponse)(result.uiOutput.health);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    generateMetricExplanation(dimension, dimensionData, overallStatus, weight = 0.25, contribution = 0) {
        const dimensionNames = {
            schedule: '时间安排',
            budget: '预算',
            pace: '节奏',
            feasibility: '行程可行性',
        };
        const displayNames = {
            schedule: '时间灵活性',
            budget: '预算控制',
            pace: '节奏合理性',
            feasibility: '可达性',
        };
        const dimensionDescriptions = {
            schedule: '评估行程的时间安排是否合理，包括时间冲突、可用时间窗等',
            budget: '评估行程预算是否充足，是否存在超支风险',
            pace: '评估行程节奏是否合适，包括疲劳度、活动密度等',
            feasibility: '评估行程是否可行，包括交通可达性、路线合理性等',
        };
        const calculationMethods = {
            schedule: '基础分100分，时间窗不足每天扣10分',
            budget: '基础分100分，超支>20%扣50分，>10%扣30分',
            pace: '基础分100分，疲劳分>85扣40分，>70扣20分',
            feasibility: '基础分100分，每段不可达扣30分',
        };
        const idealRanges = {
            schedule: '70-100分（健康），50-69分（警告），0-49分（严重）',
            budget: '70-100分（健康），50-69分（警告），0-49分（严重）',
            pace: '70-100分（健康），50-69分（警告），0-49分（严重）',
            feasibility: '70-100分（健康），50-69分（警告），0-49分（严重）',
        };
        const suggestions = [];
        if (dimensionData.status === 'critical' || dimensionData.status === 'warning') {
            if (dimension === 'schedule') {
                suggestions.push('增加可用时间窗');
                suggestions.push('减少每日活动数量');
                suggestions.push('调整活动时间安排');
            }
            else if (dimension === 'budget') {
                suggestions.push('调整预算分配');
                suggestions.push('选择更经济的选项');
                suggestions.push('减少非必要支出');
            }
            else if (dimension === 'pace') {
                suggestions.push('增加休息时间');
                suggestions.push('减少高强度活动');
                suggestions.push('调整活动顺序');
            }
            else if (dimension === 'feasibility') {
                suggestions.push('检查交通路线');
                suggestions.push('调整目的地顺序');
                suggestions.push('增加替代方案');
            }
        }
        return {
            metricName: dimension,
            displayName: displayNames[dimension],
            dimension,
            dimensionName: dimensionNames[dimension],
            description: dimensionDescriptions[dimension],
            definition: dimensionDescriptions[dimension],
            currentScore: dimensionData.score,
            currentStatus: dimensionData.status,
            overallStatus,
            calculationMethod: calculationMethods[dimension],
            calculation: {
                method: calculationMethods[dimension],
                score: dimensionData.score,
            },
            idealRange: idealRanges[dimension],
            currentState: {
                score: dimensionData.score,
                status: dimensionData.status,
                issues: dimensionData.issues,
            },
            issues: dimensionData.issues,
            suggestions,
            impact: dimensionData.status === 'critical' ? 'high' : dimensionData.status === 'warning' ? 'medium' : 'low',
            weight: weight,
            contribution: contribution,
            lastUpdated: new Date().toISOString(),
        };
    }
};
exports.TripDetailController = TripDetailController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('execute'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '执行行程详情页流程',
        description: `
行程详情页的 Agent，负责"理解与掌控旅行现状"。

支持的操作：
- get_status: 理解当前状态
- get_health: 分析健康度
- explain_decisions: 解释决策
- show_evidence: 展示证据
- get_full: 获取完整信息
    `.trim(),
    }),
    (0, swagger_1.ApiBody)({
        description: '行程详情页请求',
        schema: {
            type: 'object',
            properties: {
                tripId: { type: 'string' },
                action: {
                    type: 'string',
                    enum: ['get_status', 'get_health', 'explain_decisions', 'show_evidence', 'get_full'],
                },
                decisionId: { type: 'string' },
                evidenceRefs: { type: 'array', items: { type: 'string' } },
            },
            required: ['tripId', 'action'],
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '执行成功',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TripDetailController.prototype, "execute", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(':tripId/status'),
    (0, swagger_1.ApiOperation)({
        summary: '获取行程状态',
        description: '理解当前行程状态（规划中/进行中/已完成）',
    }),
    (0, swagger_1.ApiParam)({ name: 'tripId', description: '行程 ID' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '获取成功',
    }),
    __param(0, (0, common_1.Param)('tripId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TripDetailController.prototype, "getStatus", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(':tripId/metrics/:dimension/explanation'),
    (0, swagger_1.ApiOperation)({
        summary: '获取健康度指标的详细解释',
        description: '获取指定健康度维度（schedule/budget/pace/feasibility）的详细解释，包括计算方法、理想范围、改进建议等',
    }),
    (0, swagger_1.ApiParam)({
        name: 'tripId',
        description: '行程 ID',
        example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1'
    }),
    (0, swagger_1.ApiParam)({
        name: 'dimension',
        description: '健康度维度',
        enum: ['schedule', 'budget', 'pace', 'feasibility'],
        example: 'pace'
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '获取成功',
    }),
    __param(0, (0, common_1.Param)('tripId')),
    __param(1, (0, common_1.Param)('dimension')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TripDetailController.prototype, "getMetricExplanation", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(':tripId/health'),
    (0, swagger_1.ApiOperation)({
        summary: '获取行程健康度',
        description: '分析行程健康度（时间、预算、节奏、可达性）',
    }),
    (0, swagger_1.ApiParam)({ name: 'tripId', description: '行程 ID' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '获取成功',
    }),
    __param(0, (0, common_1.Param)('tripId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TripDetailController.prototype, "getHealth", null);
exports.TripDetailController = TripDetailController = __decorate([
    (0, swagger_1.ApiTags)('trip-detail'),
    (0, common_1.Controller)('trip-detail'),
    __metadata("design:paramtypes", [trip_detail_agent_service_1.TripDetailAgentService])
], TripDetailController);
//# sourceMappingURL=trip-detail.controller.js.map