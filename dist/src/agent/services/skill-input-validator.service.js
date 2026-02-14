"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var SkillInputValidatorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkillInputValidatorService = void 0;
const common_1 = require("@nestjs/common");
const skill_validation_rules_config_1 = require("./skill-validation-rules.config");
let SkillInputValidatorService = SkillInputValidatorService_1 = class SkillInputValidatorService {
    constructor() {
        this.logger = new common_1.Logger(SkillInputValidatorService_1.name);
    }
    validate(skillName, input, metadata, validationContext) {
        const context = (validationContext === null || validationContext === void 0 ? void 0 : validationContext.context) || (validationContext === null || validationContext === void 0 ? void 0 : validationContext.context);
        const request = (validationContext === null || validationContext === void 0 ? void 0 : validationContext.request) || (validationContext === null || validationContext === void 0 ? void 0 : validationContext.request);
        const stepResults = validationContext === null || validationContext === void 0 ? void 0 : validationContext.stepResults;
        const planSteps = validationContext === null || validationContext === void 0 ? void 0 : validationContext.planSteps;
        if (metadata === null || metadata === void 0 ? void 0 : metadata.inputSchema) {
            return this.validateWithSchema(skillName, input, metadata.inputSchema, { context, request, stepResults, planSteps });
        }
        const configRule = skill_validation_rules_config_1.SKILL_VALIDATION_RULES[skillName];
        if (configRule) {
            return this.validateWithRule(skillName, input, configRule, { context, request, stepResults, planSteps });
        }
        return { valid: true, missingParams: [] };
    }
    validateWithSchema(skillName, input, schema, validationContext) {
        var _a;
        const missingParams = [];
        const typeErrors = [];
        const processedInput = { ...input };
        const { context, request, stepResults, planSteps } = validationContext;
        if (schema.extractors) {
            for (const [param, extractor] of Object.entries(schema.extractors)) {
                if (!this.hasValue(processedInput[param])) {
                    const extracted = this.extractParameterWithConfig(extractor, validationContext);
                    if (extracted !== undefined) {
                        processedInput[param] = extracted;
                    }
                }
            }
        }
        if (schema.required) {
            for (const param of schema.required) {
                if (!this.hasValue(processedInput[param])) {
                    missingParams.push(param);
                }
            }
        }
        if (schema.dependencies) {
            for (const dep of schema.dependencies) {
                const hasParam = this.hasValue(processedInput[dep.param]);
                const hasAlternatives = (_a = dep.alternatives) === null || _a === void 0 ? void 0 : _a.some(alt => {
                    if (this.hasValue(processedInput[alt])) {
                        return true;
                    }
                    if (alt === 'tripId' && context && request) {
                        return !!(context.tripId || request.trip_id);
                    }
                    return false;
                });
                if (!hasParam && !hasAlternatives) {
                    if (dep.alternatives && dep.alternatives.length > 0) {
                        missingParams.push(`${dep.param} 或 ${dep.alternatives.join('、')}`);
                    }
                    else {
                        missingParams.push(dep.param);
                    }
                }
            }
        }
        if (schema.typeChecks) {
            for (const [param, typeCheck] of Object.entries(schema.typeChecks)) {
                const value = processedInput[param];
                if (!this.hasValue(value)) {
                    continue;
                }
                const typeError = this.validateTypeAndRange(param, value, typeCheck);
                if (typeError) {
                    typeErrors.push(typeError);
                }
            }
        }
        if (missingParams.length > 0 || typeErrors.length > 0) {
            const uniqueMissingParams = [...new Set(missingParams)];
            const errorMessages = [
                ...uniqueMissingParams.map(p => `缺少参数: ${p}`),
                ...typeErrors.map(e => e.message),
            ];
            return {
                valid: false,
                missingParams: uniqueMissingParams,
                typeErrors,
                clarificationMessage: this.buildClarificationMessage(skillName, uniqueMissingParams, typeErrors),
                solutions: this.extractSolutions(skillName, uniqueMissingParams, typeErrors),
            };
        }
        return { valid: true, missingParams: [] };
    }
    validateWithRule(skillName, input, rule, validationContext) {
        var _a;
        const { context, request } = validationContext;
        const missingParams = [];
        const processedInput = { ...input };
        if (rule.extractors && context && request) {
            for (const [param, extractor] of Object.entries(rule.extractors)) {
                if (!this.hasValue(processedInput[param])) {
                    if (param === 'countryCode') {
                        const countryCode = this.extractCountryCodeFromMessage(request.message);
                        if (countryCode) {
                            processedInput[param] = countryCode;
                        }
                        else {
                            const extracted = extractor(context, request);
                            if (extracted) {
                                processedInput[param] = extracted;
                            }
                        }
                    }
                    else {
                        const extracted = extractor(context, request);
                        if (extracted) {
                            processedInput[param] = extracted;
                        }
                    }
                }
            }
        }
        if (rule.dependencies) {
            for (const dep of rule.dependencies) {
                const hasParam = this.hasValue(processedInput[dep.param]);
                const hasAlternatives = (_a = dep.alternatives) === null || _a === void 0 ? void 0 : _a.some(alt => {
                    if (this.hasValue(processedInput[alt])) {
                        return true;
                    }
                    if (alt === 'tripId' && context && request) {
                        return !!(context.tripId || request.trip_id);
                    }
                    return false;
                });
                if (!hasParam && !hasAlternatives) {
                    if (dep.alternatives && dep.alternatives.length > 0) {
                        missingParams.push(`${dep.param} 或 ${dep.alternatives.join('、')}`);
                    }
                    else {
                        missingParams.push(dep.param);
                    }
                }
            }
        }
        if (missingParams.length > 0) {
            const uniqueMissingParams = [...new Set(missingParams)];
            return {
                valid: false,
                missingParams: uniqueMissingParams,
                clarificationMessage: this.buildClarificationMessage(skillName, uniqueMissingParams),
                solutions: this.extractSolutions(skillName, uniqueMissingParams),
            };
        }
        return { valid: true, missingParams: [] };
    }
    extractParameterWithConfig(extractor, validationContext) {
        var _a, _b, _c;
        const { context, request, stepResults, planSteps } = validationContext;
        if (typeof extractor === 'string') {
            return this.extractParameter(extractor, context, request);
        }
        const config = extractor;
        switch (config.type) {
            case 'context':
                if (!context)
                    return config.defaultValue;
                return (_a = this.extractFromContext(config.name || '', context)) !== null && _a !== void 0 ? _a : config.defaultValue;
            case 'request':
                if (!request)
                    return config.defaultValue;
                return (_b = this.extractFromRequest(config.name || '', request)) !== null && _b !== void 0 ? _b : config.defaultValue;
            case 'step':
                if (!stepResults || !config.stepId)
                    return config.defaultValue;
                return (_c = this.extractFromStepResult(config.stepId, config.path, stepResults, planSteps)) !== null && _c !== void 0 ? _c : config.defaultValue;
            default:
                return config.defaultValue;
        }
    }
    extractFromContext(name, context) {
        switch (name) {
            case 'tripId':
                return context.tripId;
            case 'userId':
                return context.userId;
            case 'requestId':
                return context.requestId;
            default:
                return context[name];
        }
    }
    extractFromRequest(name, request) {
        switch (name) {
            case 'tripId':
            case 'trip_id':
                return request.trip_id;
            case 'userId':
            case 'user_id':
                return request.user_id;
            case 'requestId':
            case 'request_id':
                return request.request_id;
            case 'countryCode':
                return this.extractCountryCodeFromMessage(request.message);
            default:
                return request[name];
        }
    }
    extractFromStepResult(stepId, path, stepResults, planSteps) {
        let result = stepResults[stepId];
        if (!result && planSteps) {
            const step = planSteps.find(s => s.id === stepId || s.skillName === stepId);
            if (step) {
                result = stepResults[step.id];
            }
        }
        if (!result) {
            return undefined;
        }
        if (path) {
            return this.getNestedValue(result, path);
        }
        return result;
    }
    getNestedValue(obj, path) {
        const keys = path.split('.');
        let current = obj;
        for (const key of keys) {
            if (current === null || current === undefined) {
                return undefined;
            }
            current = current[key];
        }
        return current;
    }
    extractParameter(extractorName, context, request) {
        if (!context || !request) {
            return undefined;
        }
        switch (extractorName) {
            case 'tripId':
                return context.tripId || request.trip_id;
            case 'countryCode':
                return this.extractCountryCodeFromMessage(request.message);
            default:
                return undefined;
        }
    }
    extractCountryCodeFromMessage(message) {
        const countryMap = {
            '冰岛': 'IS',
            'iceland': 'IS',
            'island': 'IS',
        };
        const lowerMessage = message.toLowerCase();
        for (const [key, code] of Object.entries(countryMap)) {
            if (lowerMessage.includes(key.toLowerCase())) {
                return code;
            }
        }
        return undefined;
    }
    hasValue(value) {
        if (value === undefined || value === null) {
            return false;
        }
        if (typeof value === 'string' && value.trim() === '') {
            return false;
        }
        if (Array.isArray(value) && value.length === 0) {
            return false;
        }
        return true;
    }
    validateTypeAndRange(param, value, typeCheck) {
        const actualType = this.getType(value);
        if (typeCheck.type !== actualType) {
            return {
                param,
                message: `参数 ${param} 类型错误：期望 ${typeCheck.type}，实际 ${actualType}`,
            };
        }
        if (typeCheck.type === 'number' && typeof value === 'number') {
            if (typeCheck.min !== undefined && value < typeCheck.min) {
                return {
                    param,
                    message: `参数 ${param} 值过小：期望 >= ${typeCheck.min}，实际 ${value}`,
                };
            }
            if (typeCheck.max !== undefined && value > typeCheck.max) {
                return {
                    param,
                    message: `参数 ${param} 值过大：期望 <= ${typeCheck.max}，实际 ${value}`,
                };
            }
        }
        if ((typeCheck.type === 'string' || typeCheck.type === 'array') && Array.isArray(value) || typeof value === 'string') {
            const length = typeof value === 'string' ? value.length : value.length;
            if (typeCheck.minLength !== undefined && length < typeCheck.minLength) {
                return {
                    param,
                    message: `参数 ${param} 长度过短：期望 >= ${typeCheck.minLength}，实际 ${length}`,
                };
            }
            if (typeCheck.maxLength !== undefined && length > typeCheck.maxLength) {
                return {
                    param,
                    message: `参数 ${param} 长度过长：期望 <= ${typeCheck.maxLength}，实际 ${length}`,
                };
            }
        }
        if (typeCheck.type === 'string' && typeof value === 'string' && typeCheck.format) {
            const formatError = this.validateFormat(value, typeCheck.format);
            if (formatError) {
                return {
                    param,
                    message: `参数 ${param} 格式错误：${formatError}`,
                };
            }
        }
        if (typeCheck.enum && !typeCheck.enum.includes(value)) {
            return {
                param,
                message: `参数 ${param} 值不在允许的枚举值中：期望 [${typeCheck.enum.join(', ')}]，实际 ${value}`,
            };
        }
        return null;
    }
    getType(value) {
        if (value === null) {
            return 'object';
        }
        if (Array.isArray(value)) {
            return 'array';
        }
        const jsType = typeof value;
        switch (jsType) {
            case 'string':
                return 'string';
            case 'number':
                return 'number';
            case 'boolean':
                return 'boolean';
            case 'object':
                return 'object';
            default:
                return 'string';
        }
    }
    validateFormat(value, format) {
        switch (format) {
            case 'email':
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(value)) {
                    return '不是有效的邮箱地址';
                }
                break;
            case 'url':
                try {
                    new URL(value);
                }
                catch {
                    return '不是有效的 URL';
                }
                break;
            case 'date':
                const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                if (!dateRegex.test(value)) {
                    return '不是有效的日期格式 (YYYY-MM-DD)';
                }
                break;
            case 'date-time':
                const dateTimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
                if (!dateTimeRegex.test(value)) {
                    return '不是有效的日期时间格式 (ISO 8601)';
                }
                break;
            case 'uuid':
                const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                if (!uuidRegex.test(value)) {
                    return '不是有效的 UUID';
                }
                break;
        }
        return null;
    }
    buildClarificationMessage(skillName, missingParams, typeErrors = []) {
        const messages = [];
        if (missingParams.length > 0) {
            messages.push(`缺少必需参数: ${missingParams.join('、')}`);
        }
        if (typeErrors.length > 0) {
            messages.push(...typeErrors.map(e => e.message));
        }
        return `无法完成行程规划，因为输入参数验证失败。\n\n问题：\n${messages.map(m => `- ${m}`).join('\n')}\n\n影响：\n- 无法构建世界模型上下文\n- 无法进行路线方向选择\n- 无法生成可执行的行程规划\n\n请提供更多信息，或联系系统管理员获取帮助。`;
    }
    extractSolutions(skillName, missingParams, typeErrors = []) {
        const solutions = [];
        if (missingParams.some(p => p.includes('tripId') || p.includes('world'))) {
            solutions.push('提供行程 ID (tripId) 或世界模型上下文 (world)');
        }
        if (missingParams.some(p => p.includes('countryCode'))) {
            solutions.push('在消息中明确指定国家或地区（如：冰岛、Iceland）');
        }
        if (missingParams.some(p => p.includes('planState'))) {
            solutions.push('确保前面的步骤已生成 PlanState');
        }
        if (typeErrors.length > 0) {
            solutions.push('检查参数类型和格式是否正确');
            solutions.push('确保参数值在允许的范围内');
        }
        if (solutions.length === 0) {
            solutions.push('检查输入参数是否完整');
            solutions.push('联系系统管理员获取帮助');
        }
        return solutions;
    }
};
exports.SkillInputValidatorService = SkillInputValidatorService;
exports.SkillInputValidatorService = SkillInputValidatorService = SkillInputValidatorService_1 = __decorate([
    (0, common_1.Injectable)()
], SkillInputValidatorService);
//# sourceMappingURL=skill-input-validator.service.js.map