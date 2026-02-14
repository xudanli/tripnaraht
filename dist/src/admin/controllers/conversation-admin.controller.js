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
var ConversationAdminController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConversationAdminController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const public_decorator_1 = require("../../auth/decorators/public.decorator");
const nl_conversation_context_service_1 = require("../../trips/services/nl-conversation-context.service");
const standard_response_dto_1 = require("../../common/dto/standard-response.dto");
let ConversationAdminController = ConversationAdminController_1 = class ConversationAdminController {
    constructor(nlConversationContextService) {
        this.nlConversationContextService = nlConversationContextService;
        this.logger = new common_1.Logger(ConversationAdminController_1.name);
    }
    async clearAllSessions() {
        try {
            this.logger.warn('⚠️  管理员请求清空所有会话上下文数据');
            const deletedCount = await this.nlConversationContextService.clearAllSessions();
            this.logger.log(`✅ 已清空所有会话，共删除 ${deletedCount} 个会话`);
            return (0, standard_response_dto_1.successResponse)({
                deletedCount,
                message: `已清空所有会话，共删除 ${deletedCount} 个会话`,
            });
        }
        catch (error) {
            this.logger.error(`清空所有会话失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, `清空失败: ${error.message}`);
        }
    }
    async getStats() {
        try {
            const allSessions = await this.nlConversationContextService.getAllSessions();
            const sessionsByUser = new Map();
            for (const session of allSessions) {
                sessionsByUser.set(session.userId, (sessionsByUser.get(session.userId) || 0) + 1);
            }
            return (0, standard_response_dto_1.successResponse)({
                totalSessions: allSessions.length,
                totalUsers: sessionsByUser.size,
                sessionsByUser: Object.fromEntries(sessionsByUser),
            });
        }
        catch (error) {
            this.logger.error(`获取会话统计失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, `获取统计失败: ${error.message}`);
        }
    }
};
exports.ConversationAdminController = ConversationAdminController;
__decorate([
    (0, common_1.Post)('clear-all'),
    (0, swagger_1.ApiOperation)({
        summary: '清空所有会话上下文数据',
        description: '清空内存缓存和 Redis 中的所有会话数据（用于数据清理）',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功清空所有会话',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ConversationAdminController.prototype, "clearAllSessions", null);
__decorate([
    (0, common_1.Get)('stats'),
    (0, swagger_1.ApiOperation)({
        summary: '获取会话统计信息',
        description: '获取当前会话数量统计',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回统计信息',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ConversationAdminController.prototype, "getStats", null);
exports.ConversationAdminController = ConversationAdminController = ConversationAdminController_1 = __decorate([
    (0, swagger_1.ApiTags)('admin'),
    (0, public_decorator_1.Public)(),
    (0, common_1.Controller)('admin/conversation'),
    __metadata("design:paramtypes", [nl_conversation_context_service_1.NLConversationContextService])
], ConversationAdminController);
//# sourceMappingURL=conversation-admin.controller.js.map