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
var RailPassController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RailPassController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const railpass_service_1 = require("./railpass.service");
const railpass_dto_1 = require("./dto/railpass.dto");
const pass_profile_wizard_dto_1 = require("./dto/pass-profile-wizard.dto");
const executability_check_dto_1 = require("./dto/executability-check.dto");
const coverage_check_dto_1 = require("./dto/coverage-check.dto");
const reservation_channels_dto_1 = require("./dto/reservation-channels.dto");
const rules_evaluate_dto_1 = require("./dto/rules-evaluate.dto");
const standard_response_dto_1 = require("../common/dto/standard-response.dto");
let RailPassController = RailPassController_1 = class RailPassController {
    constructor(railPassService) {
        this.railPassService = railPassService;
        this.logger = new common_1.Logger(RailPassController_1.name);
    }
    async checkEligibility(dto) {
        try {
            const result = await this.railPassService.checkEligibility(dto);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Failed to check eligibility:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async recommendPass(dto) {
        try {
            const result = await this.railPassService.recommendPass(dto);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Failed to recommend pass:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async checkReservation(dto) {
        try {
            const result = await this.railPassService.checkReservation(dto.segment);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Failed to check reservation:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async planReservations(dto) {
        try {
            const result = await this.railPassService.planReservations(dto);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Failed to plan reservations:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async simulateTravelDays(dto) {
        try {
            const result = await this.railPassService.simulateTravelDays(dto);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Failed to simulate travel days:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async validateCompliance(dto) {
        try {
            const result = await this.railPassService.validateCompliance(dto);
            const explanation = this.railPassService.generateUserExplanation(result);
            return (0, standard_response_dto_1.successResponse)({
                ...result,
                explanation,
            });
        }
        catch (error) {
            this.logger.error('Failed to validate compliance:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async updateReservationTask(taskId, dto) {
        try {
            return (0, standard_response_dto_1.successResponse)({
                taskId,
                status: dto.status,
                message: '任务状态已更新',
            });
        }
        catch (error) {
            this.logger.error('Failed to update reservation task:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async generateCheckout(body) {
        try {
            return (0, standard_response_dto_1.successResponse)({
                checkoutLinks: body.taskIds.map(taskId => ({
                    taskId,
                    bookingUrl: `https://example.com/book/${taskId}`,
                    instructions: '请在此链接完成订座',
                })),
            });
        }
        catch (error) {
            this.logger.error('Failed to generate checkout:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async checkExecutability(dto) {
        try {
            const result = await this.railPassService.checkExecutability(dto);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Failed to check executability:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async generateHighRiskAlerts(dto) {
        try {
            const result = await this.railPassService.generateHighRiskAlerts(dto);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Failed to generate high risk alerts:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async completePassProfile(dto) {
        try {
            const result = await this.railPassService.completePassProfile(dto);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Failed to complete pass profile:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async regeneratePlan(body) {
        try {
            const result = await this.railPassService.regeneratePlanWithData({
                passProfile: body.passProfile,
                segments: body.segments,
                reservationTasks: body.reservationTasks,
                strategy: body.strategy,
                customParams: body.customParams,
            });
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Failed to regenerate plan:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async checkCoverage(body) {
        try {
            const result = await this.railPassService.checkCoverage(body.segment, body.passProfile);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Failed to check coverage:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getReservationChannels(body) {
        try {
            const result = await this.railPassService.getReservationChannels(body.segments);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Failed to get reservation channels:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async evaluateRules(body) {
        try {
            const result = await this.railPassService.evaluateRules(body);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Failed to evaluate rules:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
};
exports.RailPassController = RailPassController;
__decorate([
    (0, common_1.Post)('eligibility'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '合规检查',
        description: '检查用户居住国、旅行国家集合是否符合 Eurail/Interrail 规则',
    }),
    (0, swagger_1.ApiBody)({ type: railpass_dto_1.CheckEligibilityDto }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '合规检查完成' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [railpass_dto_1.CheckEligibilityDto]),
    __metadata("design:returntype", Promise)
], RailPassController.prototype, "checkEligibility", null);
__decorate([
    (0, common_1.Post)('recommendation'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '推荐 Pass',
        description: '根据行程特征推荐合适的 Pass 配置（Global/OneCountry, Flexi/Continuous, class, mobile/paper）',
    }),
    (0, swagger_1.ApiBody)({ type: railpass_dto_1.RecommendPassDto }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Pass 推荐完成' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [railpass_dto_1.RecommendPassDto]),
    __metadata("design:returntype", Promise)
], RailPassController.prototype, "recommendPass", null);
__decorate([
    (0, common_1.Post)('reservation/check'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '检查订座需求',
        description: '检查单个 rail segment 是否需要订座，评估费用、风险、订座渠道',
    }),
    (0, swagger_1.ApiBody)({ type: railpass_dto_1.CheckReservationDto }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '订座需求检查完成' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [railpass_dto_1.CheckReservationDto]),
    __metadata("design:returntype", Promise)
], RailPassController.prototype, "checkReservation", null);
__decorate([
    (0, common_1.Post)('reservation/plan'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '规划订座任务',
        description: '为所有 rail segments 生成订座任务列表，评估违规，提供备用方案',
    }),
    (0, swagger_1.ApiBody)({ type: railpass_dto_1.PlanReservationsDto }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '订座规划完成' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [railpass_dto_1.PlanReservationsDto]),
    __metadata("design:returntype", Promise)
], RailPassController.prototype, "planReservations", null);
__decorate([
    (0, common_1.Post)('travel-days/simulate'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '模拟 Travel Day 消耗',
        description: '计算 Flexi Pass 的 Travel Day 消耗（考虑跨午夜规则）',
    }),
    (0, swagger_1.ApiBody)({ type: railpass_dto_1.SimulateTravelDaysDto }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Travel Day 模拟完成' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [railpass_dto_1.SimulateTravelDaysDto]),
    __metadata("design:returntype", Promise)
], RailPassController.prototype, "simulateTravelDays", null);
__decorate([
    (0, common_1.Post)('compliance/validate'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '验证合规性',
        description: '验证行程计划是否符合 RailPass 规则（居住国使用、Travel Day 预算、订座要求等）',
    }),
    (0, swagger_1.ApiBody)({ type: railpass_dto_1.ValidateComplianceDto }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '合规验证完成' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [railpass_dto_1.ValidateComplianceDto]),
    __metadata("design:returntype", Promise)
], RailPassController.prototype, "validateCompliance", null);
__decorate([
    (0, common_1.Patch)('reservation/task/:taskId'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '更新订座任务状态',
        description: '用户完成订座后回填状态（BOOKED/FAILED/FALLBACK_APPLIED）',
    }),
    (0, swagger_1.ApiBody)({ type: railpass_dto_1.UpdateReservationTaskDto }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '任务状态更新完成' }),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, railpass_dto_1.UpdateReservationTaskDto]),
    __metadata("design:returntype", Promise)
], RailPassController.prototype, "updateReservationTask", null);
__decorate([
    (0, common_1.Post)('reservation/checkout'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '生成订座清单',
        description: '生成外跳链接/或聚合指引，方便用户完成订座',
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                taskIds: { type: 'array', items: { type: 'string' } },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '订座清单生成完成' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RailPassController.prototype, "generateCheckout", null);
__decorate([
    (0, common_1.Post)('executability/check'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '可执行性检查（总览卡片）',
        description: '生成可执行性检查总览，用于 UI 卡片展示（B2）',
    }),
    (0, swagger_1.ApiBody)({ type: executability_check_dto_1.CheckExecutabilityDto }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '可执行性检查完成' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [executability_check_dto_1.CheckExecutabilityDto]),
    __metadata("design:returntype", Promise)
], RailPassController.prototype, "checkExecutability", null);
__decorate([
    (0, common_1.Post)('executability/high-risk-alerts'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '生成高风险提示',
        description: '生成高风险提示及替代方案（B4）',
    }),
    (0, swagger_1.ApiBody)({ type: executability_check_dto_1.CheckExecutabilityDto }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '高风险提示生成完成' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [executability_check_dto_1.CheckExecutabilityDto]),
    __metadata("design:returntype", Promise)
], RailPassController.prototype, "generateHighRiskAlerts", null);
__decorate([
    (0, common_1.Post)('wizard/complete-profile'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '完成 PassProfile 向导',
        description: '通过最短 3 问完成 PassProfile 配置（B1）',
    }),
    (0, swagger_1.ApiBody)({ type: pass_profile_wizard_dto_1.PassProfileWizardDto }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'PassProfile 配置完成' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [pass_profile_wizard_dto_1.PassProfileWizardDto]),
    __metadata("design:returntype", Promise)
], RailPassController.prototype, "completePassProfile", null);
__decorate([
    (0, common_1.Post)('plan/regenerate'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '改方案',
        description: '根据策略重新生成方案（更稳/更省/更便宜）（B6）',
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                tripId: { type: 'string' },
                strategy: {
                    type: 'string',
                    enum: ['MORE_STABLE', 'MORE_ECONOMICAL', 'MORE_AFFORDABLE', 'CUSTOM']
                },
                customParams: { type: 'object' },
                passProfile: { type: 'object' },
                segments: { type: 'array' },
                reservationTasks: { type: 'array' },
            },
            required: ['tripId', 'strategy', 'passProfile', 'segments', 'reservationTasks'],
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '方案重新生成完成' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RailPassController.prototype, "regeneratePlan", null);
__decorate([
    (0, common_1.Post)('coverage/check'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '检查 Pass 覆盖',
        description: '检查 rail segment 是否在 Pass 覆盖范围内。Global Pass 不是 100% 覆盖所有线路，需要校验运营商/线路是否被覆盖。城市地铁/公交/有轨电车通常不包含。One Country Pass 不能用于跨境段。',
    }),
    (0, swagger_1.ApiBody)({ type: coverage_check_dto_1.CoverageCheckRequestDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '覆盖检查完成',
        schema: {
            type: 'object',
            properties: {
                success: { type: 'boolean' },
                data: {
                    type: 'object',
                    properties: {
                        covered: { type: 'boolean', description: '是否覆盖' },
                        status: { type: 'string', enum: ['COVERED', 'NOT_COVERED', 'PARTIAL', 'UNKNOWN'] },
                        explanation: { type: 'string', description: '说明' },
                        includesCityTransport: { type: 'boolean' },
                        alternatives: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    type: { type: 'string', enum: ['METRO', 'BUS', 'TAXI', 'WALK'] },
                                    description: { type: 'string' },
                                    estimatedCost: { type: 'number' },
                                    estimatedTimeMinutes: { type: 'number' },
                                },
                            },
                        },
                    },
                },
            },
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [coverage_check_dto_1.CoverageCheckRequestDto]),
    __metadata("design:returntype", Promise)
], RailPassController.prototype, "checkCoverage", null);
__decorate([
    (0, common_1.Post)('reservation/channels'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '获取订座渠道策略',
        description: '根据国家/运营商获取订座渠道策略和订座清单。不同国家/运营商有不同的订座渠道（官方平台/运营商官网/车站/第三方）。Eurostar 等热门线路建议提前订座（如 Eurostar 建议提前 60 天）。',
    }),
    (0, swagger_1.ApiBody)({ type: reservation_channels_dto_1.ReservationChannelsRequestDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '订座渠道策略获取完成',
        schema: {
            type: 'object',
            properties: {
                success: { type: 'boolean' },
                data: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            segmentId: { type: 'string' },
                            from: { type: 'string' },
                            to: { type: 'string' },
                            policy: {
                                type: 'object',
                                properties: {
                                    countryCode: { type: 'string' },
                                    operator: { type: 'string' },
                                    preferredChannels: { type: 'array', items: { type: 'string' } },
                                    supportsApiBooking: { type: 'boolean' },
                                    supportsOnlineBooking: { type: 'boolean' },
                                    requiresOfflineBooking: { type: 'boolean' },
                                    bookingUrl: { type: 'string' },
                                    instructions: { type: 'string' },
                                    recommendedAdvanceDays: { type: 'number' },
                                },
                            },
                            urgency: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
                            bookingDeadline: { type: 'string', format: 'date' },
                        },
                    },
                },
            },
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [reservation_channels_dto_1.ReservationChannelsRequestDto]),
    __metadata("design:returntype", Promise)
], RailPassController.prototype, "getReservationChannels", null);
__decorate([
    (0, common_1.Post)('rules/evaluate'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '评估规则',
        description: '使用规则引擎评估所有 RailPass 规则。统一的规则引擎结构，支持扩展不同 Pass 类型（Eurail/Interrail/未来 JR Pass 等）。每条规则都有 Condition、Effect、Severity、Evidence 结构。',
    }),
    (0, swagger_1.ApiBody)({ type: rules_evaluate_dto_1.RulesEvaluateRequestDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '规则评估完成',
        schema: {
            type: 'object',
            properties: {
                success: { type: 'boolean' },
                data: {
                    type: 'object',
                    properties: {
                        triggeredRules: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    rule: {
                                        type: 'object',
                                        properties: {
                                            id: { type: 'string' },
                                            name: { type: 'string' },
                                            description: { type: 'string' },
                                        },
                                    },
                                    segmentId: { type: 'string' },
                                    effect: {
                                        type: 'object',
                                        properties: {
                                            type: { type: 'string' },
                                            value: { type: 'number' },
                                            riskLevel: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
                                            fallbackOptions: { type: 'array', items: { type: 'string' } },
                                            errorMessage: { type: 'string' },
                                        },
                                    },
                                    message: { type: 'string' },
                                },
                            },
                        },
                        hasErrors: { type: 'boolean', description: '是否有 error 级别的违规' },
                        overallRisk: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'], description: '综合风险等级' },
                    },
                },
            },
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [rules_evaluate_dto_1.RulesEvaluateRequestDto]),
    __metadata("design:returntype", Promise)
], RailPassController.prototype, "evaluateRules", null);
exports.RailPassController = RailPassController = RailPassController_1 = __decorate([
    (0, swagger_1.ApiTags)('railpass'),
    (0, swagger_1.ApiExtraModels)(coverage_check_dto_1.CoverageCheckRequestDto, reservation_channels_dto_1.ReservationChannelsRequestDto, rules_evaluate_dto_1.RulesEvaluateRequestDto),
    (0, common_1.Controller)('railpass'),
    __metadata("design:paramtypes", [railpass_service_1.RailPassService])
], RailPassController);
//# sourceMappingURL=railpass.controller.js.map