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
var NLConversationContextService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NLConversationContextService = void 0;
const common_1 = require("@nestjs/common");
const redis_service_1 = require("../../redis/redis.service");
const crypto_1 = require("crypto");
let NLConversationContextService = NLConversationContextService_1 = class NLConversationContextService {
    constructor(redisService) {
        this.redisService = redisService;
        this.logger = new common_1.Logger(NLConversationContextService_1.name);
        this.cachePrefix = 'nl_conversation:';
        this.defaultTtl = 30 * 60;
        this.memoryCache = new Map();
        this.userClearedFlags = new Set();
        if (this.redisService) {
            this.logger.log('自然语言对话上下文已启用（Redis + 内存，30分钟非活动超时）');
        }
        else {
            this.logger.log('自然语言对话上下文已启用（仅内存，30分钟非活动超时）');
        }
    }
    async getOrCreateSession(sessionId, userId) {
        if (sessionId) {
            if (this.userClearedFlags.has(userId)) {
                this.logger.debug(`用户 ${userId} 已清空所有会话，忽略旧 sessionId ${sessionId}，创建新会话`);
                this.userClearedFlags.delete(userId);
                sessionId = undefined;
            }
            else {
                const exists = await this.sessionExists(sessionId, userId);
                if (exists) {
                    return sessionId;
                }
                this.logger.warn(`会话 ${sessionId} 不存在或已过期，创建新会话`);
            }
        }
        const newSessionId = `nl_${userId}_${(0, crypto_1.randomUUID)().substring(0, 8)}`;
        const context = {
            sessionId: newSessionId,
            userId,
            messages: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + this.defaultTtl * 1000).toISOString(),
        };
        this.userClearedFlags.delete(userId);
        await this.saveContext(context);
        return newSessionId;
    }
    async getContext(sessionId, userId) {
        const cacheKey = this.buildCacheKey(sessionId, userId);
        const memoryEntry = this.memoryCache.get(cacheKey);
        if (memoryEntry && memoryEntry.expires > Date.now()) {
            if (memoryEntry.context.userId !== userId) {
                this.logger.warn(`用户 ${userId} 尝试访问其他用户的会话 ${sessionId}`);
                return null;
            }
            return memoryEntry.context;
        }
        if (this.userClearedFlags.has(userId)) {
            this.logger.debug(`用户 ${userId} 已清空所有会话，不从未知 sessionId ${sessionId} 的 Redis 读取数据`);
            return null;
        }
        if (this.redisService) {
            try {
                const context = await this.redisService.get(cacheKey);
                if (context) {
                    if (context.userId !== userId) {
                        this.logger.warn(`用户 ${userId} 尝试访问其他用户的会话 ${sessionId}`);
                        return null;
                    }
                    this.memoryCache.set(cacheKey, {
                        context,
                        expires: Date.now() + this.defaultTtl * 1000,
                    });
                    return context;
                }
            }
            catch (error) {
                this.logger.warn(`从 Redis 获取上下文失败: ${error.message}`);
            }
        }
        return null;
    }
    async saveContext(context) {
        const cacheKey = this.buildCacheKey(context.sessionId, context.userId);
        context.updatedAt = new Date().toISOString();
        context.expiresAt = new Date(Date.now() + this.defaultTtl * 1000).toISOString();
        if (this.redisService) {
            try {
                await this.redisService.set(cacheKey, context, this.defaultTtl);
                this.logger.debug(`对话上下文已保存: ${context.sessionId}, TTL=${this.defaultTtl}秒`);
            }
            catch (error) {
                this.logger.warn(`保存到 Redis 失败: ${error.message}`);
            }
        }
        this.memoryCache.set(cacheKey, {
            context,
            expires: Date.now() + this.defaultTtl * 1000,
        });
        this.cleanExpiredMemoryCache();
    }
    async addMessage(sessionId, userId, role, content, metadata) {
        const context = await this.getContext(sessionId, userId);
        if (!context) {
            throw new Error(`会话 ${sessionId} 不存在或已过期`);
        }
        const message = {
            id: (0, crypto_1.randomUUID)(),
            role,
            content,
            timestamp: new Date().toISOString(),
            metadata,
        };
        context.messages.push(message);
        context.updatedAt = new Date().toISOString();
        await this.saveContext(context);
        return context;
    }
    async updateContext(sessionId, userId, updates) {
        const context = await this.getContext(sessionId, userId);
        if (!context) {
            throw new Error(`会话 ${sessionId} 不存在或已过期`);
        }
        if (updates.conversationContext) {
            context.conversationContext = {
                ...context.conversationContext,
                ...updates.conversationContext,
            };
        }
        if (updates.partialParams) {
            context.partialParams = {
                ...context.partialParams,
                ...updates.partialParams,
            };
        }
        context.updatedAt = new Date().toISOString();
        await this.saveContext(context);
        return context;
    }
    async deleteSession(sessionId, userId) {
        const cacheKey = this.buildCacheKey(sessionId, userId);
        if (this.redisService) {
            try {
                await this.redisService.del(cacheKey);
            }
            catch (error) {
                this.logger.warn(`从 Redis 删除失败: ${error.message}`);
            }
        }
        this.memoryCache.delete(cacheKey);
        this.logger.log(`会话已清空: ${sessionId}`);
    }
    async deleteAllUserSessions(userId) {
        let deletedCount = 0;
        const memorySessions = [];
        const keysToDelete = [];
        for (const [key, entry] of this.memoryCache.entries()) {
            if (entry.context.userId === userId) {
                memorySessions.push(entry.context.sessionId);
                keysToDelete.push(key);
            }
        }
        this.logger.debug(`删除用户 ${userId} 的所有会话，内存缓存中找到 ${memorySessions.length} 个`);
        for (const sessionId of memorySessions) {
            try {
                await this.deleteSession(sessionId, userId);
                deletedCount++;
            }
            catch (error) {
                this.logger.warn(`删除会话 ${sessionId} 失败: ${error.message}`);
            }
        }
        for (const key of keysToDelete) {
            this.memoryCache.delete(key);
        }
        this.userClearedFlags.add(userId);
        this.logger.debug(`已设置用户 ${userId} 的清空标记，防止从 Redis 读取旧数据`);
        if (this.redisService && memorySessions.length > 0) {
            this.logger.debug(`尝试从 Redis 删除 ${memorySessions.length} 个已知会话`);
        }
        this.logger.debug(`已删除用户 ${userId} 的 ${deletedCount} 个会话（内存缓存），并设置清空标记`);
        return deletedCount;
    }
    async getAllSessions() {
        const sessions = [];
        for (const [key, entry] of this.memoryCache.entries()) {
            if (entry.expires > Date.now() && entry.context.userId) {
                sessions.push({
                    userId: entry.context.userId,
                    sessionId: entry.context.sessionId,
                });
            }
        }
        return sessions;
    }
    async clearAllSessions() {
        let deletedCount = 0;
        const allSessions = await this.getAllSessions();
        const sessionsByUser = new Map();
        for (const session of allSessions) {
            if (!sessionsByUser.has(session.userId)) {
                sessionsByUser.set(session.userId, []);
            }
            sessionsByUser.get(session.userId).push(session.sessionId);
        }
        this.logger.debug(`清空所有会话，共 ${sessionsByUser.size} 个用户，${allSessions.length} 个会话`);
        for (const [userId, sessionIds] of sessionsByUser.entries()) {
            const deleted = await this.deleteAllUserSessions(userId);
            deletedCount += deleted;
        }
        this.memoryCache.clear();
        this.userClearedFlags.clear();
        this.logger.debug(`已清空所有会话，共删除 ${deletedCount} 个会话`);
        return deletedCount;
    }
    async getUserSessions(userId) {
        const sessions = [];
        for (const [key, entry] of this.memoryCache.entries()) {
            if (entry.expires > Date.now() && entry.context.userId === userId) {
                const lastMessage = entry.context.messages.length > 0
                    ? [entry.context.messages[entry.context.messages.length - 1]]
                    : [];
                sessions.push({
                    sessionId: entry.context.sessionId,
                    userId: entry.context.userId,
                    messages: lastMessage,
                    conversationContext: entry.context.conversationContext,
                    partialParams: entry.context.partialParams,
                    createdAt: entry.context.createdAt,
                    updatedAt: entry.context.updatedAt,
                    expiresAt: entry.context.expiresAt,
                });
            }
        }
        return sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }
    async updateMessageQuestionAnswers(sessionId, userId, messageId, questionAnswers) {
        var _a;
        const context = await this.getContext(sessionId, userId);
        if (!context) {
            throw new Error(`会话 ${sessionId} 不存在或已过期`);
        }
        let message = context.messages.find(m => m.id === messageId);
        if (!message) {
            const lastAssistantMessage = context.messages
                .filter(m => m.role === 'assistant')
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
            if (lastAssistantMessage) {
                this.logger.warn(`消息 ${messageId} 不存在，使用最后一条 assistant 消息 ${lastAssistantMessage.id} 代替`);
                message = lastAssistantMessage;
            }
        }
        if (!message) {
            throw new Error(`消息 ${messageId} 不存在，且会话中没有可用的 assistant 消息`);
        }
        if (!message.metadata) {
            message.metadata = {};
        }
        message.metadata.questionAnswers = {
            ...message.metadata.questionAnswers,
            ...questionAnswers,
        };
        const clarificationQuestions = message.metadata.clarificationQuestions;
        const questionToParamMap = {};
        if (clarificationQuestions && Array.isArray(clarificationQuestions)) {
            for (const question of clarificationQuestions) {
                if (question.id && ((_a = question.metadata) === null || _a === void 0 ? void 0 : _a.fieldName)) {
                    questionToParamMap[question.id] = question.metadata.fieldName;
                }
            }
        }
        const paramsToUpdate = {};
        for (const [questionId, answer] of Object.entries(questionAnswers)) {
            const paramName = questionToParamMap[questionId] || this.questionIdToParamName(questionId);
            paramsToUpdate[paramName] = answer;
        }
        if (!context.partialParams) {
            context.partialParams = {};
        }
        context.partialParams = {
            ...context.partialParams,
            ...paramsToUpdate,
        };
        this.logger.debug(`同步问题答案到参数: ${JSON.stringify(questionAnswers)} -> ${JSON.stringify(paramsToUpdate)}`);
        context.updatedAt = new Date().toISOString();
        await this.saveContext(context);
        return message;
    }
    questionIdToParamName(questionId) {
        let paramName = questionId.replace(/^(gl_|lft_|sj_|al_|k2_|tibet_)/, '');
        paramName = paramName.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        return paramName;
    }
    async sessionExists(sessionId, userId) {
        const context = await this.getContext(sessionId, userId);
        return context !== null;
    }
    buildCacheKey(sessionId, userId) {
        return `${this.cachePrefix}${userId}:${sessionId}`;
    }
    cleanExpiredMemoryCache() {
        const now = Date.now();
        for (const [key, entry] of this.memoryCache.entries()) {
            if (entry.expires <= now) {
                this.memoryCache.delete(key);
            }
        }
    }
};
exports.NLConversationContextService = NLConversationContextService;
exports.NLConversationContextService = NLConversationContextService = NLConversationContextService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [redis_service_1.RedisService])
], NLConversationContextService);
//# sourceMappingURL=nl-conversation-context.service.js.map