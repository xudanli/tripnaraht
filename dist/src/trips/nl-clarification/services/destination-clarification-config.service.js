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
var DestinationClarificationConfigService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DestinationClarificationConfigService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
let DestinationClarificationConfigService = DestinationClarificationConfigService_1 = class DestinationClarificationConfigService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(DestinationClarificationConfigService_1.name);
        this.configCache = new Map();
        this.CACHE_TTL = 5 * 60 * 1000;
    }
    clearCache(destinationCode) {
        if (destinationCode) {
            this.configCache.delete(destinationCode.toUpperCase());
            this.logger.debug(`已清除 ${destinationCode} 的配置缓存`);
        }
        else {
            this.configCache.clear();
            this.logger.debug('已清除所有配置缓存');
        }
    }
    async getConfig(destinationCode) {
        const cacheKey = destinationCode.toUpperCase();
        const cached = this.configCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            return cached.config;
        }
        try {
            const configEntity = await this.prisma.destinationClarificationConfig.findUnique({
                where: { destinationCode: cacheKey },
            });
            if (!configEntity || !configEntity.enabled) {
                return null;
            }
            const config = configEntity.config;
            if (config.userPersonas && !config.userPersonas.ai_decision_logic) {
                this.logger.warn(`配置 ${cacheKey} 缺少 ai_decision_logic，但继续使用`);
            }
            this.configCache.set(cacheKey, {
                config,
                timestamp: Date.now(),
            });
            return config;
        }
        catch (error) {
            this.logger.error(`获取目的地配置失败: ${error.message}`, error.stack);
            return null;
        }
    }
    async getCurrentRoundQuestions(destinationCode, currentParams, conversationHistory) {
        const config = await this.getConfig(destinationCode);
        if (!config) {
            return null;
        }
        const currentRound = this.determineCurrentRound(config, currentParams, conversationHistory);
        if (!currentRound) {
            return null;
        }
        const askedQuestionIds = this.extractAskedQuestionIds(conversationHistory);
        this.logger.debug(`[${destinationCode}] 已问过的问题ID: ${askedQuestionIds.join(', ') || '无'}`);
        this.logger.debug(`[${destinationCode}] 当前轮次 ${currentRound.roundId} 共有 ${currentRound.questions.length} 个问题`);
        const questions = currentRound.questions.filter(q => !askedQuestionIds.includes(q.id));
        this.logger.debug(`[${destinationCode}] 过滤已问过的问题后: ${questions.length}/${currentRound.questions.length} 个问题`);
        if (questions.length > 0) {
            this.logger.debug(`[${destinationCode}] 剩余问题ID: ${questions.map(q => q.id).join(', ')}`);
        }
        const filteredQuestions = this.applyDependencies(questions, currentParams);
        this.logger.debug(`[${destinationCode}] 应用依赖规则后: ${filteredQuestions.length}/${questions.length} 个问题`);
        if (filteredQuestions.length === 0 && questions.length > 0) {
            this.logger.warn(`[${destinationCode}] 所有问题都被依赖规则过滤掉了，当前参数: ${JSON.stringify(currentParams)}`);
            this.logger.warn(`[${destinationCode}] 被过滤的问题: ${questions.map(q => { var _a; return `${q.id}(${((_a = q.dependencies) === null || _a === void 0 ? void 0 : _a.length) || 0}个依赖)`; }).join(', ')}`);
        }
        if (filteredQuestions.length === 0 && currentRound.questions.length > 0) {
            this.logger.warn(`[${destinationCode}] 当前轮次 ${currentRound.roundId} 没有可问的问题，可能所有问题都已问过或被过滤`);
        }
        if (filteredQuestions.length === 0 && currentRound.questions.length === 0) {
            const isCompleted = this.checkCompletionConditions(currentRound.completionConditions, currentParams, currentRound);
            if (!isCompleted) {
                this.logger.debug(`[${destinationCode}] 当前轮次 ${currentRound.roundId} 无问题但未完成，返回该轮次等待LLM解析更多字段`);
                return {
                    round: currentRound,
                    questions: [],
                    shouldTriggerGate: false,
                };
            }
        }
        return {
            round: currentRound,
            questions: filteredQuestions,
            shouldTriggerGate: currentRound.roundId === 'round_4_gate',
        };
    }
    determineCurrentRound(config, currentParams, conversationHistory) {
        const sortedRounds = [...config.clarificationRounds].sort((a, b) => a.priority - b.priority);
        for (const round of sortedRounds) {
            if (this.checkTriggerConditions(round.triggerConditions, currentParams, conversationHistory, config)) {
                const isCompleted = this.checkCompletionConditions(round.completionConditions, currentParams);
                if (!isCompleted) {
                    if (round.questions.length === 0) {
                        this.logger.debug(`[${config.destinationCode}] 轮次 ${round.roundId} 未完成但无问题，跳过继续检查下一轮`);
                        continue;
                    }
                    return round;
                }
            }
        }
        return null;
    }
    checkTriggerConditions(conditions, currentParams, conversationHistory, config) {
        if (conditions.requiredFields && conditions.requiredFields.length > 0) {
            for (const field of conditions.requiredFields) {
                if (!currentParams[field]) {
                    return false;
                }
            }
        }
        if (conditions.previousRoundCompleted && config) {
            const previousRound = this.findRoundById(conditions.previousRoundCompleted, config);
            if (previousRound) {
                const isCompleted = this.checkCompletionConditions(previousRound.completionConditions, currentParams, previousRound);
                if (!isCompleted) {
                    this.logger.debug(`上一轮次 ${conditions.previousRoundCompleted} 未完成，当前轮次无法触发`);
                    return false;
                }
                else {
                    this.logger.debug(`上一轮次 ${conditions.previousRoundCompleted} 已完成，当前轮次可以触发`);
                }
            }
            else {
                this.logger.warn(`找不到上一轮次: ${conditions.previousRoundCompleted}，但继续检查当前轮次条件`);
            }
        }
        return true;
    }
    checkCompletionConditions(conditions, currentParams, round) {
        var _a;
        for (const field of conditions.requiredFields) {
            if (!currentParams[field]) {
                this.logger.debug(`完成条件检查失败: 缺少必需字段 ${field}`);
                return false;
            }
        }
        if (conditions.allQuestionsAnswered && round) {
            for (const question of round.questions) {
                const fieldName = (_a = question.metadata) === null || _a === void 0 ? void 0 : _a.fieldName;
                if (fieldName && !currentParams[fieldName]) {
                    this.logger.debug(`完成条件检查失败: 问题 ${question.id} (字段 ${fieldName}) 未回答`);
                    return false;
                }
            }
        }
        return true;
    }
    findRoundById(roundId, config) {
        return config.clarificationRounds.find(r => r.roundId === roundId) || null;
    }
    applyDependencies(questions, currentParams) {
        return questions.filter(q => {
            if (!q.dependencies || q.dependencies.length === 0) {
                return true;
            }
            return q.dependencies.every(dep => {
                const fieldValue = currentParams[dep.fieldId];
                if (Array.isArray(fieldValue)) {
                    return fieldValue.includes(dep.value);
                }
                return fieldValue === dep.value;
            });
        });
    }
    extractAskedQuestionIds(conversationHistory) {
        var _a;
        const questionIds = [];
        for (const msg of conversationHistory) {
            if (msg.role === 'assistant' && ((_a = msg.metadata) === null || _a === void 0 ? void 0 : _a.clarificationQuestions)) {
                const questions = msg.metadata.clarificationQuestions;
                questions.forEach((q) => {
                    if (q.id) {
                        questionIds.push(q.id);
                    }
                });
            }
        }
        return questionIds;
    }
    async createOrUpdateConfig(destinationCode, config, userId) {
        const cacheKey = destinationCode.toUpperCase();
        await this.prisma.destinationClarificationConfig.upsert({
            where: { destinationCode: cacheKey },
            update: {
                destinationName: config.destinationName,
                enabled: config.enabled,
                config: config,
                metadata: config.metadata,
                updatedBy: userId || 'system',
                updatedAt: new Date(),
            },
            create: {
                destinationCode: cacheKey,
                destinationName: config.destinationName,
                enabled: config.enabled,
                config: config,
                metadata: config.metadata,
                createdBy: userId || 'system',
            },
        });
        this.configCache.delete(cacheKey);
    }
    async setEnabled(destinationCode, enabled, userId) {
        const cacheKey = destinationCode.toUpperCase();
        await this.prisma.destinationClarificationConfig.update({
            where: { destinationCode: cacheKey },
            data: {
                enabled,
                updatedBy: userId || 'system',
                updatedAt: new Date(),
            },
        });
        this.configCache.delete(cacheKey);
    }
    async getAllConfigs() {
        const configs = await this.prisma.destinationClarificationConfig.findMany({
            select: {
                destinationCode: true,
                destinationName: true,
                enabled: true,
                metadata: true,
                config: true,
            },
            orderBy: {
                destinationCode: 'asc',
            },
        });
        return configs.map(c => {
            var _a;
            const configData = c.config;
            return {
                destinationCode: c.destinationCode,
                destinationName: c.destinationName,
                enabled: c.enabled,
                metadata: c.metadata,
                userPersonas: configData.userPersonas ? {
                    user_personas: ((_a = configData.userPersonas.user_personas) === null || _a === void 0 ? void 0 : _a.map((p) => ({
                        persona_id: p.persona_id,
                        persona_name: p.persona_name,
                        persona_name_en: p.persona_name_en,
                        percentage_of_visitors: p.percentage_of_visitors || p.percentage_of_climbers,
                    }))) || [],
                } : undefined,
            };
        });
    }
    async getCriticalFields(destinationCode) {
        var _a, _b;
        const config = await this.getConfig(destinationCode);
        if (!config) {
            return [];
        }
        const criticalFields = [];
        for (const round of config.clarificationRounds) {
            for (const question of round.questions) {
                if (((_a = question.metadata) === null || _a === void 0 ? void 0 : _a.isCritical) && ((_b = question.metadata) === null || _b === void 0 ? void 0 : _b.fieldName)) {
                    criticalFields.push({
                        fieldName: question.metadata.fieldName,
                        questionId: question.id,
                        question: question.question,
                    });
                }
            }
        }
        return criticalFields;
    }
    async getQuestionsForFields(destinationCode, fieldNames) {
        var _a;
        const config = await this.getConfig(destinationCode);
        if (!config) {
            return [];
        }
        const questions = [];
        const fieldNameSet = new Set(fieldNames);
        for (const round of config.clarificationRounds) {
            for (const question of round.questions) {
                if (((_a = question.metadata) === null || _a === void 0 ? void 0 : _a.fieldName) && fieldNameSet.has(question.metadata.fieldName)) {
                    questions.push(question);
                }
            }
        }
        return questions;
    }
};
exports.DestinationClarificationConfigService = DestinationClarificationConfigService;
exports.DestinationClarificationConfigService = DestinationClarificationConfigService = DestinationClarificationConfigService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], DestinationClarificationConfigService);
//# sourceMappingURL=destination-clarification-config.service.js.map