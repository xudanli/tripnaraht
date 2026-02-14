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
var ExecutorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecutorService = void 0;
const common_1 = require("@nestjs/common");
const action_registry_service_1 = require("../services/action-registry.service");
let ExecutorService = ExecutorService_1 = class ExecutorService {
    constructor(actionRegistry) {
        this.actionRegistry = actionRegistry;
        this.logger = new common_1.Logger(ExecutorService_1.name);
    }
    async executeStep(step, memory, context) {
        this.logger.debug(`执行步骤: ${step.id} - ${step.description}`);
        try {
            const { toolName, input } = this.parseStepDescription(step.description, memory, context);
            if (!this.actionRegistry) {
                throw new Error('ActionRegistryService 未可用');
            }
            const action = this.actionRegistry.get(toolName);
            if (!action) {
                throw new Error(`工具未找到: ${toolName}`);
            }
            const result = await action.execute(input, context);
            if ((result === null || result === void 0 ? void 0 : result._system_status) === 'SUSPENDED') {
                this.logger.warn(`步骤 ${step.id} 需要审批，挂起执行`);
                return {
                    summary: `需要用户审批: ${result.message || step.description}`,
                    fullData: result,
                    success: false,
                    shouldReplan: false,
                };
            }
            if (result && typeof result === 'object' && 'success' in result && result.success === false) {
                throw new Error(result.error || result.message || '执行失败');
            }
            const summary = this.generateSummary(step, result);
            return {
                summary,
                fullData: result,
                success: true,
                shouldReplan: this.shouldTriggerReplan(step, result),
            };
        }
        catch (error) {
            this.logger.error(`步骤 ${step.id} 执行失败: ${error.message}`, error.stack);
            return {
                summary: `执行失败: ${error.message}`,
                fullData: null,
                success: false,
                error: error.message,
                shouldReplan: true,
            };
        }
    }
    parseStepDescription(description, memory, context) {
        const toolName = this.extractToolName(description);
        const input = this.extractInput(description, memory, context);
        return { toolName, input };
    }
    extractToolName(description) {
        const backtickMatch = description.match(/`([a-z_]+\.[a-z_]+)`/);
        if (backtickMatch && backtickMatch[1]) {
            const toolName = backtickMatch[1];
            if (this.actionRegistry && this.actionRegistry.has(toolName)) {
                return toolName;
            }
            this.logger.warn(`描述中提到的工具 ${toolName} 不存在，尝试其他方法`);
        }
        if (this.actionRegistry) {
            const availableActions = this.actionRegistry.list();
            const keywords = description.toLowerCase();
            const matchedActions = availableActions
                .map(action => {
                const actionNameLower = action.name.toLowerCase();
                const descriptionLower = action.description.toLowerCase();
                let score = 0;
                if (keywords.includes('天气') || keywords.includes('weather')) {
                    if (actionNameLower.includes('weather') || descriptionLower.includes('天气')) {
                        score += 10;
                    }
                }
                if (keywords.includes('汇率') || keywords.includes('exchange') || keywords.includes('currency')) {
                    if (actionNameLower.includes('currency') || descriptionLower.includes('汇率')) {
                        score += 10;
                    }
                }
                if (keywords.includes('地点') || keywords.includes('place') || keywords.includes('poi')) {
                    if (actionNameLower.includes('place') || descriptionLower.includes('地点')) {
                        score += 10;
                    }
                }
                if (keywords.includes('浏览') || keywords.includes('browse') || keywords.includes('网页')) {
                    if (actionNameLower.includes('browse') || descriptionLower.includes('浏览')) {
                        score += 10;
                    }
                }
                if (keywords.includes('行程') || keywords.includes('trip')) {
                    if (actionNameLower.includes('trip') || descriptionLower.includes('行程')) {
                        score += 5;
                    }
                }
                return { action, score };
            })
                .filter(item => item.score > 0)
                .sort((a, b) => b.score - a.score);
            if (matchedActions.length > 0) {
                const bestMatch = matchedActions[0].action;
                this.logger.debug(`从描述中匹配到工具: ${bestMatch.name} (分数: ${matchedActions[0].score})`);
                return bestMatch.name;
            }
        }
        const patterns = {
            '查询.*天气': 'webbrowse.browse',
            '预订.*酒店': 'webbrowse.browse',
            '搜索.*地点': 'places.resolve_entities',
            '获取.*信息': 'webbrowse.browse',
            '查询.*汇率': 'webbrowse.browse',
        };
        for (const [pattern, toolName] of Object.entries(patterns)) {
            if (new RegExp(pattern).test(description)) {
                if (this.actionRegistry && this.actionRegistry.has(toolName)) {
                    return toolName;
                }
            }
        }
        if (this.actionRegistry) {
            const availableActions = this.actionRegistry.list();
            if (availableActions.length > 0) {
                this.logger.warn(`无法从描述中提取工具名，使用降级方案: ${availableActions[0].name}`);
                return availableActions[0].name;
            }
        }
        throw new Error(`无法从描述中提取工具名: "${description}"。请确保描述中包含工具名称（如 "使用 \`webbrowse.browse\` ..."）`);
    }
    extractInput(description, memory, context) {
        var _a;
        const tripId = (context === null || context === void 0 ? void 0 : context.tripId) || ((_a = context === null || context === void 0 ? void 0 : context.trip) === null || _a === void 0 ? void 0 : _a.trip_id) || (context === null || context === void 0 ? void 0 : context.trip_id);
        const input = {
            description,
            context: {
                memory,
                ...context,
            },
        };
        if (tripId) {
            input.trip_id = tripId;
            input.tripId = tripId;
        }
        return input;
    }
    generateSummary(step, result) {
        if (typeof result === 'string') {
            return result;
        }
        if (result === null || result === void 0 ? void 0 : result.summary) {
            return result.summary;
        }
        if (result === null || result === void 0 ? void 0 : result.message) {
            return result.message;
        }
        return `步骤 ${step.id} 执行完成`;
    }
    shouldTriggerReplan(step, result) {
        if ((result === null || result === void 0 ? void 0 : result.shouldReplan) === true) {
            return true;
        }
        if (result === null || result === void 0 ? void 0 : result.newInformation) {
            return true;
        }
        return false;
    }
};
exports.ExecutorService = ExecutorService;
exports.ExecutorService = ExecutorService = ExecutorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [action_registry_service_1.ActionRegistryService])
], ExecutorService);
//# sourceMappingURL=executor.service.js.map