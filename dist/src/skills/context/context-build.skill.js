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
var ContextBuildSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextBuildSkill = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const context_engineer_service_1 = require("../../agent/context-engine/services/context-engineer.service");
const context_learn_skill_1 = require("./context-learn.skill");
const skills_tokens_1 = require("../skills.tokens");
let ContextBuildSkill = ContextBuildSkill_1 = class ContextBuildSkill {
    constructor(moduleRef, contextLearn) {
        this.moduleRef = moduleRef;
        this.logger = new common_1.Logger(ContextBuildSkill_1.name);
        this.metadata = {
            name: 'context.build',
            description: '构建 Context Package：输入 tripId + phase + agent + 用户请求，输出分块、带优先级、带来源、可裁剪的上下文包',
            version: '1.0.0',
            category: 'rag',
            toolGroup: 'CONTEXT',
        };
        this.contextLearn = contextLearn;
    }
    getContextEngineer() {
        if (!this.contextEngineer) {
            try {
                this.contextEngineer = this.moduleRef.get(context_engineer_service_1.ContextEngineerService, { strict: false });
            }
            catch (error) {
                this.logger.warn('无法获取 ContextEngineerService，context.build 功能将不可用');
                return null;
            }
        }
        return this.contextEngineer || null;
    }
    async execute(input) {
        this.logger.debug(`执行 context.build: tripId=${input.tripId || 'none'}, phase=${input.phase}, agent=${input.agent}`);
        try {
            const options = {
                tripId: input.tripId,
                phase: input.phase,
                agent: input.agent,
                userQuery: input.userQuery,
                tokenBudget: input.tokenBudget,
                includePrivate: input.includePrivate,
                requiredTopics: input.requiredTopics,
                excludeTopics: input.excludeTopics,
            };
            const contextEngineer = this.getContextEngineer();
            if (!contextEngineer) {
                throw new Error('ContextEngineerService 未注入，context.build 功能不可用');
            }
            const contextPackage = await contextEngineer.build(options);
            if (this.contextLearn) {
                this.recordContextBuiltEvent(contextPackage, input).catch((error) => {
                    this.logger.warn(`记录Context构建事件失败: ${error.message}`, error.stack);
                });
            }
            return {
                contextPackage,
            };
        }
        catch (error) {
            this.logger.error(`构建 Context Package 失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    async recordContextBuiltEvent(contextPackage, input) {
        if (!this.contextLearn) {
            return;
        }
        try {
            const userId = input.userId;
            await this.contextLearn.execute({
                userId,
                tripId: input.tripId,
                eventType: 'context_built',
                eventData: {
                    contextPackage,
                },
                phase: input.phase,
                agent: input.agent,
                userQuery: input.userQuery,
            });
            this.logger.debug(`已记录Context构建事件: tripId=${input.tripId || 'none'}, phase=${input.phase}, agent=${input.agent}, blocks=${contextPackage.blocks.length}`);
        }
        catch (error) {
            this.logger.warn(`记录Context构建事件失败: ${error.message}`);
        }
    }
};
exports.ContextBuildSkill = ContextBuildSkill;
exports.ContextBuildSkill = ContextBuildSkill = ContextBuildSkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __param(1, (0, common_1.Inject)(skills_tokens_1.SKILL_CONTEXT_LEARN)),
    __metadata("design:paramtypes", [core_1.ModuleRef,
        context_learn_skill_1.ContextLearnSkill])
], ContextBuildSkill);
//# sourceMappingURL=context-build.skill.js.map