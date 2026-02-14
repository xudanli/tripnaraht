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
exports.PlanningAssistantV2Controller = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const throttler_1 = require("@nestjs/throttler");
const public_decorator_1 = require("../../../../auth/decorators/public.decorator");
const jwt_auth_guard_1 = require("../../../../auth/guards/jwt-auth.guard");
const current_user_decorator_1 = require("../../../../auth/decorators/current-user.decorator");
const planning_assistant_v2_service_1 = require("../services/planning-assistant-v2.service");
const create_session_request_dto_1 = require("../dto/v2/create-session-request.dto");
const recommendations_request_dto_1 = require("../dto/v2/recommendations-request.dto");
const generate_plan_request_dto_1 = require("../dto/v2/generate-plan-request.dto");
const optimize_plan_request_dto_1 = require("../dto/v2/optimize-plan-request.dto");
const confirm_plan_request_dto_1 = require("../dto/v2/confirm-plan-request.dto");
const optimize_trip_request_dto_1 = require("../dto/v2/optimize-trip-request.dto");
const refine_trip_request_dto_1 = require("../dto/v2/refine-trip-request.dto");
const chat_request_dto_1 = require("../dto/v2/chat-request.dto");
let PlanningAssistantV2Controller = class PlanningAssistantV2Controller {
    constructor(planningAssistantV2Service) {
        this.planningAssistantV2Service = planningAssistantV2Service;
    }
    async createSession(dto) {
        return await this.planningAssistantV2Service.createSession(dto);
    }
    async getSessionState(sessionId, user) {
        return await this.planningAssistantV2Service.getSessionState(sessionId, user === null || user === void 0 ? void 0 : user.userId);
    }
    async deleteSession(sessionId, user) {
        await this.planningAssistantV2Service.deleteSession(sessionId, user === null || user === void 0 ? void 0 : user.userId);
        return { success: true, sessionId };
    }
    async getMessageHistory(sessionId, limit, offset, user) {
        return await this.planningAssistantV2Service.getMessageHistory(sessionId, limit, offset, user === null || user === void 0 ? void 0 : user.userId);
    }
    async chat(dto) {
        return await this.planningAssistantV2Service.chat(dto);
    }
    async getRecommendations(naturalLanguage, structuredParams) {
        return await this.planningAssistantV2Service.getRecommendations({
            naturalLanguageDescription: naturalLanguage,
            ...structuredParams,
        });
    }
    async generatePlan(dto, user) {
        if (!dto.userId && (user === null || user === void 0 ? void 0 : user.userId)) {
            dto.userId = user.userId;
        }
        return await this.planningAssistantV2Service.generatePlan(dto);
    }
    async generatePlanAsync(dto, user) {
        if (!dto.userId && (user === null || user === void 0 ? void 0 : user.userId)) {
            dto.userId = user.userId;
        }
        return await this.planningAssistantV2Service.generatePlanAsync(dto);
    }
    async getGenerateTaskStatus(taskId, user) {
        return await this.planningAssistantV2Service.getGenerateTaskStatus(taskId, user === null || user === void 0 ? void 0 : user.userId);
    }
    async comparePlans(planIds, compareFields, sessionId, language, user) {
        const dto = {
            planIds: planIds.split(','),
            compareFields: compareFields === null || compareFields === void 0 ? void 0 : compareFields.split(','),
            sessionId,
            language,
        };
        return await this.planningAssistantV2Service.comparePlans(dto, user === null || user === void 0 ? void 0 : user.userId);
    }
    async optimizePlan(planId, dto, user) {
        const fullDto = {
            ...dto,
            planId,
        };
        return await this.planningAssistantV2Service.optimizePlan(fullDto, user === null || user === void 0 ? void 0 : user.userId);
    }
    async confirmPlan(planId, dto, user) {
        const fullDto = {
            ...dto,
            planId,
            userId: (user === null || user === void 0 ? void 0 : user.userId) || dto.userId,
        };
        return await this.planningAssistantV2Service.confirmPlan(fullDto);
    }
    async optimizeTrip(tripId, dto, user) {
        const fullDto = {
            ...dto,
            tripId,
        };
        return await this.planningAssistantV2Service.optimizeTrip(fullDto, user === null || user === void 0 ? void 0 : user.userId);
    }
    async refineTrip(tripId, dto, user) {
        const fullDto = {
            ...dto,
            tripId,
        };
        return await this.planningAssistantV2Service.refineTrip(fullDto, user === null || user === void 0 ? void 0 : user.userId);
    }
    async getTripSuggestions(tripId, user) {
        return await this.planningAssistantV2Service.getTripSuggestions(tripId, user === null || user === void 0 ? void 0 : user.userId);
    }
};
exports.PlanningAssistantV2Controller = PlanningAssistantV2Controller;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60000 } }),
    (0, common_1.Post)('sessions'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, swagger_1.ApiOperation)({ summary: '创建新的规划会话' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: '会话创建成功' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: '请求参数错误' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_session_request_dto_1.CreateSessionRequestDto]),
    __metadata("design:returntype", Promise)
], PlanningAssistantV2Controller.prototype, "createSession", null);
__decorate([
    (0, throttler_1.Throttle)({ default: { limit: 100, ttl: 60000 } }),
    (0, common_1.Get)('sessions/:sessionId'),
    (0, swagger_1.ApiOperation)({ summary: '获取会话状态' }),
    (0, swagger_1.ApiParam)({ name: 'sessionId', description: '会话ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '获取成功' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: '未认证' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: '无权限访问此会话' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '会话不存在' }),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], PlanningAssistantV2Controller.prototype, "getSessionState", null);
__decorate([
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60000 } }),
    (0, common_1.Delete)('sessions/:sessionId'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '删除会话' }),
    (0, swagger_1.ApiParam)({ name: 'sessionId', description: '会话ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '删除成功' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: '未认证' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: '无权限删除此会话' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '会话不存在' }),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], PlanningAssistantV2Controller.prototype, "deleteSession", null);
__decorate([
    (0, throttler_1.Throttle)({ default: { limit: 60, ttl: 60000 } }),
    (0, common_1.Get)('sessions/:sessionId/history'),
    (0, swagger_1.ApiOperation)({ summary: '获取对话历史' }),
    (0, swagger_1.ApiParam)({ name: 'sessionId', description: '会话ID' }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'offset', required: false, type: Number }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '获取成功' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: '未认证' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: '无权限访问此会话' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '会话不存在' }),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('offset')),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, Number, Object]),
    __metadata("design:returntype", Promise)
], PlanningAssistantV2Controller.prototype, "getMessageHistory", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, throttler_1.Throttle)({
        default: {
            limit: process.env.NODE_ENV === 'production' ? 30 : 300,
            ttl: 60000
        }
    }),
    (0, common_1.Post)('chat'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '智能对话',
        description: '主要入口，支持自然语言理解、多轮对话、上下文感知和智能路由'
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '对话成功' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: '请求参数错误' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [chat_request_dto_1.ChatRequestDto]),
    __metadata("design:returntype", Promise)
], PlanningAssistantV2Controller.prototype, "chat", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, throttler_1.Throttle)({ default: { limit: 20, ttl: 60000 } }),
    (0, common_1.Get)('recommendations'),
    (0, swagger_1.ApiOperation)({
        summary: '获取目的地推荐',
        description: '支持自然语言参数（?q=...）和结构化参数'
    }),
    (0, swagger_1.ApiQuery)({ name: 'q', required: false, description: '自然语言描述' }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'language', required: false, enum: ['en', 'zh'] }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '推荐成功' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: '请求参数错误' }),
    __param(0, (0, common_1.Query)('q')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, recommendations_request_dto_1.RecommendationsRequestDto]),
    __metadata("design:returntype", Promise)
], PlanningAssistantV2Controller.prototype, "getRecommendations", null);
__decorate([
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60000 } }),
    (0, common_1.Post)('plans/generate'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '生成方案（同步）' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '生成成功' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: '未认证' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: '请求参数错误' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [generate_plan_request_dto_1.GeneratePlanRequestDto, Object]),
    __metadata("design:returntype", Promise)
], PlanningAssistantV2Controller.prototype, "generatePlan", null);
__decorate([
    (0, throttler_1.Throttle)({ default: { limit: 20, ttl: 60000 } }),
    (0, common_1.Post)('plans/generate-async'),
    (0, common_1.HttpCode)(common_1.HttpStatus.ACCEPTED),
    (0, swagger_1.ApiOperation)({ summary: '生成方案（异步）' }),
    (0, swagger_1.ApiResponse)({ status: 202, description: '任务已创建' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: '未认证' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [generate_plan_request_dto_1.GeneratePlanRequestDto, Object]),
    __metadata("design:returntype", Promise)
], PlanningAssistantV2Controller.prototype, "generatePlanAsync", null);
__decorate([
    (0, throttler_1.Throttle)({ default: { limit: 60, ttl: 60000 } }),
    (0, common_1.Get)('plans/generate/:taskId'),
    (0, swagger_1.ApiOperation)({ summary: '查询生成任务状态' }),
    (0, swagger_1.ApiParam)({ name: 'taskId', description: '任务ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '查询成功' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: '未认证' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: '无权限访问此任务' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '任务不存在' }),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], PlanningAssistantV2Controller.prototype, "getGenerateTaskStatus", null);
__decorate([
    (0, throttler_1.Throttle)({ default: { limit: 20, ttl: 60000 } }),
    (0, common_1.Get)('plans/compare'),
    (0, swagger_1.ApiOperation)({ summary: '对比方案' }),
    (0, swagger_1.ApiQuery)({ name: 'planIds', required: true, description: '方案ID列表，逗号分隔' }),
    (0, swagger_1.ApiQuery)({ name: 'compareFields', required: false, description: '对比维度，逗号分隔' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '对比成功' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: '未认证' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: '请求参数错误' }),
    __param(0, (0, common_1.Query)('planIds')),
    __param(1, (0, common_1.Query)('compareFields')),
    __param(2, (0, common_1.Query)('sessionId')),
    __param(3, (0, common_1.Query)('language')),
    __param(4, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, Object]),
    __metadata("design:returntype", Promise)
], PlanningAssistantV2Controller.prototype, "comparePlans", null);
__decorate([
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60000 } }),
    (0, common_1.Post)('plans/:planId/optimize'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '优化方案' }),
    (0, swagger_1.ApiParam)({ name: 'planId', description: '方案ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '优化成功' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: '未认证' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: '无权限优化此方案' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '方案不存在' }),
    __param(0, (0, common_1.Param)('planId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, optimize_plan_request_dto_1.OptimizePlanRequestDto, Object]),
    __metadata("design:returntype", Promise)
], PlanningAssistantV2Controller.prototype, "optimizePlan", null);
__decorate([
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60000 } }),
    (0, common_1.Post)('plans/:planId/confirm'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '确认方案' }),
    (0, swagger_1.ApiParam)({ name: 'planId', description: '方案ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '确认成功' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: '未认证' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: '无权限确认此方案' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '方案不存在' }),
    __param(0, (0, common_1.Param)('planId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, confirm_plan_request_dto_1.ConfirmPlanRequestDto, Object]),
    __metadata("design:returntype", Promise)
], PlanningAssistantV2Controller.prototype, "confirmPlan", null);
__decorate([
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60000 } }),
    (0, common_1.Post)('trips/:tripId/optimize'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '优化已创建行程' }),
    (0, swagger_1.ApiParam)({ name: 'tripId', description: '行程ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '优化成功' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: '未认证' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: '无权限优化此行程' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '行程不存在' }),
    __param(0, (0, common_1.Param)('tripId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, optimize_trip_request_dto_1.OptimizeTripRequestDto, Object]),
    __metadata("design:returntype", Promise)
], PlanningAssistantV2Controller.prototype, "optimizeTrip", null);
__decorate([
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60000 } }),
    (0, common_1.Post)('trips/:tripId/refine'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '细化行程' }),
    (0, swagger_1.ApiParam)({ name: 'tripId', description: '行程ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '细化成功' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: '未认证' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: '无权限细化此行程' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '行程不存在' }),
    __param(0, (0, common_1.Param)('tripId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, refine_trip_request_dto_1.RefineTripRequestDto, Object]),
    __metadata("design:returntype", Promise)
], PlanningAssistantV2Controller.prototype, "refineTrip", null);
__decorate([
    (0, throttler_1.Throttle)({ default: { limit: 30, ttl: 60000 } }),
    (0, common_1.Get)('trips/:tripId/suggestions'),
    (0, swagger_1.ApiOperation)({ summary: '获取优化建议' }),
    (0, swagger_1.ApiParam)({ name: 'tripId', description: '行程ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '获取成功' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: '未认证' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: '无权限访问此行程' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '行程不存在' }),
    __param(0, (0, common_1.Param)('tripId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], PlanningAssistantV2Controller.prototype, "getTripSuggestions", null);
exports.PlanningAssistantV2Controller = PlanningAssistantV2Controller = __decorate([
    (0, swagger_1.ApiTags)('规划助手智能体 V2'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('agent/planning-assistant/v2'),
    __metadata("design:paramtypes", [planning_assistant_v2_service_1.PlanningAssistantV2Service])
], PlanningAssistantV2Controller);
//# sourceMappingURL=planning-assistant-v2.controller.js.map