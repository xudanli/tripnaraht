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
exports.PlanningAssistantController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const planning_assistant_service_1 = require("./services/planning-assistant.service");
const public_decorator_1 = require("../../../auth/decorators/public.decorator");
const planning_assistant_dto_1 = require("./dto/planning-assistant.dto");
let PlanningAssistantController = class PlanningAssistantController {
    constructor(planningAssistantService) {
        this.planningAssistantService = planningAssistantService;
    }
    async createSession(dto) {
        const sessionId = await this.planningAssistantService.createSession(dto.userId);
        return { sessionId };
    }
    async chat(dto) {
        return await this.planningAssistantService.chat({
            sessionId: dto.sessionId,
            userId: dto.userId,
            message: dto.message,
            language: dto.language,
            context: dto.context ? {
                currentLocation: dto.context.currentLocation ? {
                    lat: dto.context.currentLocation.lat,
                    lng: dto.context.currentLocation.lng,
                } : undefined,
                timezone: dto.context.timezone,
            } : undefined,
        });
    }
    async getSessionState(sessionId) {
        const state = await this.planningAssistantService.getSessionState(sessionId);
        if (!state) {
            return null;
        }
        return {
            sessionId: state.sessionId,
            userId: state.userId,
            phase: state.phase,
            preferences: state.preferences,
            recommendations: state.recommendations,
            selectedDestination: state.selectedDestination,
            planCandidates: state.planCandidates,
            selectedPlanId: state.selectedPlanId,
            confirmedTripId: state.confirmedTripId,
            messageCount: state.messageHistory.length,
            createdAt: state.createdAt,
            updatedAt: state.updatedAt,
        };
    }
    async quickRecommend(budget, travelersCount, preferredType, countryCode, durationDays, travelStyle, budgetLevel, language) {
        const sessionId = await this.planningAssistantService.createSession(countryCode);
        let message = '请给我推荐目的地';
        if (budget)
            message += `，预算大约${budget}`;
        if (budgetLevel)
            message += `，预算级别${budgetLevel}`;
        if (travelersCount)
            message += `，${travelersCount}人出行`;
        if (durationDays)
            message += `，${durationDays}天`;
        if (preferredType || travelStyle)
            message += `，偏好${preferredType || travelStyle}类型的旅行`;
        const response = await this.planningAssistantService.chat({
            sessionId,
            message,
            language: language || 'zh',
            countryCode,
        });
        return {
            sessionId,
            recommendations: response.recommendations,
            message: response.message,
            messageCN: response.messageCN,
        };
    }
    async getUserPreferences(userId) {
        return await this.planningAssistantService.getUserPreferenceSummary(userId);
    }
    async clearUserPreferences(userId) {
        await this.planningAssistantService.clearUserPreferences(userId);
        return { success: true };
    }
};
exports.PlanningAssistantController = PlanningAssistantController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('sessions'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, swagger_1.ApiOperation)({ summary: '创建新的规划会话', description: '开始一个新的旅行规划对话会话' }),
    (0, swagger_1.ApiResponse)({
        status: 201,
        description: '会话创建成功',
        type: planning_assistant_dto_1.CreateSessionResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [planning_assistant_dto_1.CreateSessionRequestDto]),
    __metadata("design:returntype", Promise)
], PlanningAssistantController.prototype, "createSession", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('chat'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '发送消息进行对话',
        description: '向规划助手发送消息，获取智能回复、推荐和行程方案'
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '对话成功',
        type: planning_assistant_dto_1.PlanningChatResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [planning_assistant_dto_1.PlanningChatRequestDto]),
    __metadata("design:returntype", Promise)
], PlanningAssistantController.prototype, "chat", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('sessions/:sessionId'),
    (0, swagger_1.ApiOperation)({
        summary: '获取会话状态',
        description: '获取指定会话的当前状态，包括偏好、推荐和方案'
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '获取成功',
        type: planning_assistant_dto_1.SessionStateResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '会话不存在',
    }),
    __param(0, (0, common_1.Param)('sessionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PlanningAssistantController.prototype, "getSessionState", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('quick-recommend'),
    (0, swagger_1.ApiOperation)({
        summary: '快速获取目的地推荐',
        description: '无需创建会话，直接根据简单条件获取目的地推荐'
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '推荐成功',
    }),
    __param(0, (0, common_1.Query)('budget')),
    __param(1, (0, common_1.Query)('travelersCount')),
    __param(2, (0, common_1.Query)('preferredType')),
    __param(3, (0, common_1.Query)('country_code')),
    __param(4, (0, common_1.Query)('duration_days')),
    __param(5, (0, common_1.Query)('travel_style')),
    __param(6, (0, common_1.Query)('budget_level')),
    __param(7, (0, common_1.Query)('language')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], PlanningAssistantController.prototype, "quickRecommend", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('users/:userId/preferences'),
    (0, swagger_1.ApiOperation)({
        summary: '获取用户偏好摘要',
        description: '获取系统学习到的用户旅行偏好，用于个性化推荐'
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '获取成功',
    }),
    __param(0, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PlanningAssistantController.prototype, "getUserPreferences", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('users/:userId/preferences/clear'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '清除用户偏好',
        description: '清除系统学习到的用户旅行偏好'
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '清除成功',
    }),
    __param(0, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PlanningAssistantController.prototype, "clearUserPreferences", null);
exports.PlanningAssistantController = PlanningAssistantController = __decorate([
    (0, swagger_1.ApiTags)('规划助手智能体'),
    (0, common_1.Controller)('agent/planning-assistant'),
    __metadata("design:paramtypes", [planning_assistant_service_1.PlanningAssistantService])
], PlanningAssistantController);
//# sourceMappingURL=planning-assistant.controller.js.map