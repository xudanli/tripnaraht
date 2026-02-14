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
var ContextLearnSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextLearnSkill = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const context_learning_service_1 = require("../../agent/context-engine/services/context-learning.service");
let ContextLearnSkill = ContextLearnSkill_1 = class ContextLearnSkill {
    constructor(moduleRef) {
        this.moduleRef = moduleRef;
        this.logger = new common_1.Logger(ContextLearnSkill_1.name);
        this.metadata = {
            name: 'context.learn',
            description: '学习Context使用情况：输入学习事件（context_built, context_used, decision_made, user_feedback），输出学习结果（更新的Block优先级、推荐的Block组合、学习置信度）',
            version: '1.0.0',
            category: 'rag',
            toolGroup: 'CONTEXT',
        };
    }
    getContextLearningService() {
        if (!this.contextLearningService) {
            try {
                this.contextLearningService = this.moduleRef.get(context_learning_service_1.ContextLearningService, { strict: false });
            }
            catch (error) {
                this.logger.warn('无法获取 ContextLearningService，context.learn 功能将不可用');
                return null;
            }
        }
        return this.contextLearningService || null;
    }
    async execute(input) {
        this.logger.debug(`执行 context.learn: userId=${input.userId || 'none'}, eventType=${input.eventType}`);
        try {
            const contextLearningService = this.getContextLearningService();
            if (!contextLearningService) {
                throw new Error('ContextLearningService 未注入，context.learn 功能不可用');
            }
            const learningInput = {
                userId: input.userId,
                tripId: input.tripId,
                eventType: input.eventType,
                eventData: input.eventData,
                phase: input.phase,
                agent: input.agent,
                userQuery: input.userQuery,
            };
            const result = await contextLearningService.learn(learningInput);
            return {
                learningResult: result.learningResult,
            };
        }
        catch (error) {
            this.logger.error(`Context学习失败: ${error.message}`, error.stack);
            throw error;
        }
    }
};
exports.ContextLearnSkill = ContextLearnSkill;
exports.ContextLearnSkill = ContextLearnSkill = ContextLearnSkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.ModuleRef])
], ContextLearnSkill);
//# sourceMappingURL=context-learn.skill.js.map