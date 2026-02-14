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
var NarratorAgentService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NarratorAgentService = void 0;
const common_1 = require("@nestjs/common");
const llm_service_1 = require("../../../llm/services/llm.service");
const llm_request_dto_1 = require("../../../llm/dto/llm-request.dto");
const context_engineer_service_1 = require("../../../agent/context-engine/services/context-engineer.service");
const langgraph_context_integration_1 = require("../../../agent/context-engine/utils/langgraph-context-integration");
let NarratorAgentService = NarratorAgentService_1 = class NarratorAgentService {
    constructor(llmService, contextEngineer) {
        this.llmService = llmService;
        this.contextEngineer = contextEngineer;
        this.logger = new common_1.Logger(NarratorAgentService_1.name);
        const hasDeepSeekKey = !!process.env.DEEPSEEK_API_KEY;
        const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
        this.useLlm = !!llmService && (hasDeepSeekKey || hasOpenAIKey);
        if (this.useLlm) {
            this.logger.log('Narrator Agent: LLM 已启用');
        }
        else {
            this.logger.warn('Narrator Agent: 使用模板模式（LLM 未启用）');
        }
    }
    async generateExplanation(coreToolOutput, state, complianceResult) {
        var _a;
        this.logger.debug('生成可读解释');
        let contextPackage;
        if (this.contextEngineer && state) {
            try {
                const ctx = await (0, langgraph_context_integration_1.buildContextForNode)(state, this.contextEngineer, {
                    agent: 'NARRATOR',
                    phase: state.planningPhase || 'FINALIZING',
                    tokenBudget: 2400,
                    requiredTopics: ['DECISION_LOG', 'PLAN_SUMMARY'],
                });
                contextPackage = ctx.contextPackage;
                this.logger.debug(`Context Package 构建完成: ${contextPackage.blocks.length} 个块, ${contextPackage.totalTokens} tokens`);
            }
            catch (error) {
                this.logger.warn(`构建 Context Package 失败: ${error.message}，继续使用原始输出`);
            }
        }
        if (this.useLlm && this.llmService) {
            try {
                return await this.generateExplanationWithLlm(coreToolOutput, state, contextPackage, complianceResult);
            }
            catch (error) {
                this.logger.warn(`LLM 生成失败，回退到模板模式: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        if (!coreToolOutput.allowed) {
            return this.generateRejectionExplanation(coreToolOutput);
        }
        const explanation = this.generateSuccessExplanation(coreToolOutput, complianceResult);
        if (this.contextEngineer && state && ((_a = state.metadata) === null || _a === void 0 ? void 0 : _a.tripRunId)) {
            try {
                await (0, langgraph_context_integration_1.writeBackFromNode)(state, this.contextEngineer, {
                    tripRunId: state.metadata.tripRunId,
                    attemptNumber: state.metadata.attemptNumber || 1,
                    scratchpad: {
                        planOutline: `Narrator 生成解释完成: ${coreToolOutput.allowed ? 'ALLOWED' : 'REJECTED'}`,
                    },
                });
            }
            catch (error) {
                this.logger.warn(`写入回写失败: ${error.message}`);
            }
        }
        return explanation;
    }
    async generateExplanationWithLlm(coreToolOutput, state, contextPackage, complianceResult) {
        const decisionLogs = coreToolOutput.logs || [];
        const personaLogs = {
            abu: decisionLogs.filter(log => log.persona === 'ABU'),
            drDre: decisionLogs.filter(log => log.persona === 'DR_DRE'),
            neptune: decisionLogs.filter(log => log.persona === 'NEPTUNE'),
        };
        let contextPrompt = '';
        if (contextPackage) {
            contextPrompt = `\n\n上下文信息：\n${(0, langgraph_context_integration_1.buildPromptFromContextPackage)(contextPackage)}\n`;
        }
        const prompt = `你是一个旅行规划助手，负责将技术性的决策结果转化为友好、易懂的自然语言解释。

决策结果：
- 是否允许：${coreToolOutput.allowed ? '是' : '否'}
- 动作：${coreToolOutput.action}
- 解释：${coreToolOutput.explanation || '无'}

决策日志：
${JSON.stringify(personaLogs, null, 2)}

${complianceResult ? `合规检查结果：${JSON.stringify(complianceResult, null, 2)}` : ''}${contextPrompt}

请生成一段友好、易懂的中文解释，要求：
1. 如果路线被拒绝，要说明原因并给出建议
2. 如果路线通过，要总结决策过程（Abu（北极熊 🐻‍❄️）的安全检查、Dr.Dre（牧羊犬 🐕）的节奏调整、Neptune（海獭 🦦）的空间修复）
3. 语言要友好、专业，但不过于技术化
4. 如果有合规要求，要明确提示
5. 长度控制在 200 字以内
6. 如果上下文信息中有相关的决策历史或计划摘要，可以引用它们来增强解释的准确性

只返回解释文本，不要其他格式。`;
        try {
            const provider = process.env.DEEPSEEK_API_KEY
                ? llm_request_dto_1.LlmProvider.DEEPSEEK
                : (process.env.OPENAI_API_KEY ? llm_request_dto_1.LlmProvider.OPENAI : llm_request_dto_1.LlmProvider.DEEPSEEK);
            const response = await this.llmService.callLlmWithSchema(provider, prompt);
            return response.trim();
        }
        catch (error) {
            this.logger.error(`LLM 生成解释失败: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
    generateRejectionExplanation(output) {
        const rejectLog = output.logs.find(log => log.action === 'REJECT');
        if (rejectLog) {
            const personaName = this.getPersonaName(rejectLog.persona);
            return `很抱歉，${personaName} 拒绝了这条路线。\n\n原因：${rejectLog.explanation}\n\n建议：${this.generateSuggestion(rejectLog)}`;
        }
        return '很抱歉，路线被拒绝。请尝试调整您的需求或选择其他路线。';
    }
    generateSuccessExplanation(output, complianceResult) {
        const parts = [];
        if (output.explanation) {
            parts.push(output.explanation);
        }
        if (complianceResult) {
            if (complianceResult.requiresPermit) {
                parts.push('⚠️ 注意：此路线需要许可证，请提前申请。');
            }
            if (complianceResult.requiresGuide) {
                parts.push('⚠️ 注意：此路线需要向导陪同。');
            }
        }
        if (output.action === 'ADJUST') {
            parts.push('\n💡 Dr.Dre（牧羊犬 🐕）已为您调整了行程节奏，让每一天刚刚好，确保整体可持续。');
        }
        else if (output.action === 'REPLACE') {
            parts.push('\n💡 Neptune（海獭 🦦）已为您替换了不可用路段，提供了刚刚好的替代方案，保持了路线精神。');
        }
        return parts.join('\n\n');
    }
    getPersonaName(persona) {
        const nameMap = {
            'ABU': '安全守护者 Abu（北极熊 🐻‍❄️）',
            'DR_DRE': '节奏设计师 Dr.Dre（牧羊犬 🐕）',
            'NEPTUNE': '空间魔法师 Neptune（海獭 🦦）',
        };
        return nameMap[persona] || persona;
    }
    generateSuggestion(log) {
        if (log.decisionSource === 'PHYSICAL') {
            return '建议选择其他时间段或路线，避开物理限制。';
        }
        if (log.decisionSource === 'HUMAN') {
            return '建议调整行程节奏或选择更轻松的路线。';
        }
        if (log.decisionSource === 'PHILOSOPHY') {
            return '建议选择其他符合您需求的路线方向。';
        }
        return '建议调整您的需求或选择其他路线。';
    }
};
exports.NarratorAgentService = NarratorAgentService;
exports.NarratorAgentService = NarratorAgentService = NarratorAgentService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [llm_service_1.LlmService,
        context_engineer_service_1.ContextEngineerService])
], NarratorAgentService);
//# sourceMappingURL=narrator-agent.service.js.map