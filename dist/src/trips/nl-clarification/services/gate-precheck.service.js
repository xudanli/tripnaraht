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
var GatePrecheckService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GatePrecheckService = void 0;
const common_1 = require("@nestjs/common");
const llm_service_1 = require("../../../llm/services/llm.service");
const llm_request_dto_1 = require("../../../llm/dto/llm-request.dto");
let GatePrecheckService = GatePrecheckService_1 = class GatePrecheckService {
    constructor(llmService) {
        this.llmService = llmService;
        this.logger = new common_1.Logger(GatePrecheckService_1.name);
    }
    async executePrechecks(prechecks, currentParams, destinationCode) {
        this.logger.debug(`执行 Gate 预检查: destinationCode=${destinationCode}, params=${JSON.stringify(currentParams)}`);
        const normalizedParams = this.normalizeSeasonFromDate(currentParams, destinationCode);
        for (const precheck of prechecks) {
            const shouldTrigger = this.checkTriggerConditions(precheck.triggerConditions, normalizedParams);
            this.logger.debug(`Gate 预检查 ${precheck.checkId}: 触发条件检查结果=${shouldTrigger}`);
            if (!shouldTrigger) {
                continue;
            }
            this.logger.debug(`执行 Gate 预检查: ${precheck.checkId}`);
            const checkResult = await this.executeCheck(precheck, normalizedParams, destinationCode);
            this.logger.debug(`Gate 预检查 ${precheck.checkId} 结果: passed=${checkResult.passed}, reason=${checkResult.reason}`);
            if (!checkResult.passed) {
                this.logger.warn(`Gate 预检查 ${precheck.checkId} 阻止: ${checkResult.reason}`);
                return {
                    blocked: true,
                    checkId: precheck.checkId,
                    warningMessage: precheck.failureResponse.warningMessage,
                    alternatives: precheck.failureResponse.alternatives,
                    additionalQuestions: precheck.failureResponse.additionalQuestions,
                };
            }
        }
        this.logger.debug('所有 Gate 预检查通过');
        return { blocked: false };
    }
    normalizeSeasonFromDate(params, destinationCode) {
        const normalized = { ...params };
        const startDate = params.startDate || params.start_date;
        if (startDate) {
            const calculatedSeason = this.calculateSeasonFromDate(startDate, destinationCode);
            let mappedSeason = calculatedSeason;
            if (destinationCode === 'IS' && calculatedSeason === 'shoulder') {
                mappedSeason = 'spring_autumn';
            }
            if (params.travelSeason && params.travelSeason !== mappedSeason) {
                this.logger.warn(`季节推断不一致: travelSeason=${params.travelSeason}, 日期=${startDate}, 计算的季节=${mappedSeason}。使用基于日期的季节。`);
                normalized.travelSeason = mappedSeason;
                normalized.seasonSource = 'date_calculated';
            }
            else if (!params.travelSeason) {
                normalized.travelSeason = mappedSeason;
                normalized.seasonSource = 'date_calculated';
            }
        }
        return normalized;
    }
    calculateSeasonFromDate(dateStr, destinationCode) {
        try {
            const date = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00Z');
            const month = date.getUTCMonth() + 1;
            if (month >= 12 || month <= 2) {
                return 'winter';
            }
            else if (month >= 6 && month <= 8) {
                return 'summer';
            }
            else {
                return destinationCode === 'IS' ? 'spring_autumn' : 'shoulder';
            }
        }
        catch (error) {
            this.logger.warn(`日期解析失败: ${dateStr}, 使用默认季节`);
            return 'shoulder';
        }
    }
    checkTriggerConditions(conditions, currentParams) {
        for (const field of conditions.requiredFields) {
            const fieldValue = currentParams[field];
            if (!fieldValue) {
                this.logger.debug(`Gate 触发条件检查失败: 缺少必需字段 ${field}`);
                return false;
            }
            if (Array.isArray(fieldValue) && fieldValue.length === 0) {
                this.logger.debug(`Gate 触发条件检查失败: 数组字段 ${field} 为空`);
                return false;
            }
        }
        if (conditions.fieldConditions && conditions.fieldConditions.length > 0) {
            for (const condition of conditions.fieldConditions) {
                const fieldValue = currentParams[condition.fieldId];
                if (!this.evaluateFieldCondition(fieldValue, condition.operator, condition.value)) {
                    return false;
                }
            }
        }
        return true;
    }
    evaluateFieldCondition(fieldValue, operator, expectedValue) {
        switch (operator) {
            case 'equals':
                return fieldValue === expectedValue;
            case 'not_equals':
                return fieldValue !== expectedValue;
            case 'greater_than':
                return Number(fieldValue) > Number(expectedValue);
            case 'less_than':
                return Number(fieldValue) < Number(expectedValue);
            case 'in':
                return Array.isArray(expectedValue) && expectedValue.includes(fieldValue);
            case 'not_in':
                return Array.isArray(expectedValue) && !expectedValue.includes(fieldValue);
            default:
                return false;
        }
    }
    async executeCheck(precheck, currentParams, destinationCode) {
        if (precheck.checkLogic.useLLM && this.llmService) {
            return await this.executeLLMCheck(precheck, currentParams, destinationCode);
        }
        else if (precheck.checkLogic.useRuleEngine && precheck.checkLogic.ruleExpression) {
            return this.evaluateRuleExpression(precheck.checkLogic.ruleExpression, currentParams);
        }
        return { passed: true };
    }
    async executeLLMCheck(precheck, currentParams, destinationCode) {
        if (!this.llmService || !precheck.checkLogic.llmPrompt) {
            return { passed: true };
        }
        try {
            const prompt = this.buildLLMPrompt(precheck, currentParams);
            const response = await this.llmService.callLlmWithSchema(llm_request_dto_1.LlmProvider.ANTHROPIC, prompt, {
                type: 'object',
                properties: {
                    passed: { type: 'boolean', description: '检查是否通过' },
                    reason: { type: 'string', description: '通过或失败的原因' },
                },
                required: ['passed'],
            });
            const result = JSON.parse(response);
            return {
                passed: result.passed === true,
                reason: result.reason,
            };
        }
        catch (error) {
            this.logger.error(`LLM 检查失败: ${error.message}`, error.stack);
            return { passed: true, reason: `LLM检查失败: ${error.message}` };
        }
    }
    buildLLMPrompt(precheck, currentParams) {
        let prompt = precheck.checkLogic.llmPrompt || '';
        prompt = prompt.replace(/\{\{(\w+)\}\}/g, (match, key) => {
            return currentParams[key] !== undefined ? String(currentParams[key]) : match;
        });
        prompt = `你是一个旅行安全专家。请检查以下情况：

当前参数：
${JSON.stringify(currentParams, null, 2)}

检查规则：
${prompt}

请返回 JSON 格式：
{
  "passed": true/false,
  "reason": "通过或失败的原因"
}`;
        return prompt;
    }
    evaluateRuleExpression(ruleExpression, currentParams) {
        try {
            let expression = ruleExpression;
            for (const [key, value] of Object.entries(currentParams)) {
                const regex = new RegExp(`\\b${key}\\b`, 'g');
                if (typeof value === 'string') {
                    expression = expression.replace(regex, `"${value}"`);
                }
                else {
                    expression = expression.replace(regex, String(value));
                }
            }
            const result = eval(expression);
            return {
                passed: Boolean(result),
                reason: result ? '规则检查通过' : '规则检查失败',
            };
        }
        catch (error) {
            this.logger.error(`规则表达式评估失败: ${error.message}`, error.stack);
            return { passed: true, reason: `规则评估失败: ${error.message}` };
        }
    }
};
exports.GatePrecheckService = GatePrecheckService;
exports.GatePrecheckService = GatePrecheckService = GatePrecheckService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [llm_service_1.LlmService])
], GatePrecheckService);
//# sourceMappingURL=gate-precheck.service.js.map