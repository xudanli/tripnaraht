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
var LlmToolSelectorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LlmToolSelectorService = void 0;
const common_1 = require("@nestjs/common");
const llm_service_1 = require("../../../../llm/services/llm.service");
const llm_request_dto_1 = require("../../../../llm/dto/llm-request.dto");
let LlmToolSelectorService = LlmToolSelectorService_1 = class LlmToolSelectorService {
    constructor(llmService) {
        this.llmService = llmService;
        this.logger = new common_1.Logger(LlmToolSelectorService_1.name);
        this.selectionCache = new Map();
        this.CACHE_TTL = 5 * 60 * 1000;
        this.logger.log('🚀 LLM Tool Selector Service 初始化');
    }
    async selectTool(userMessage, context, availableTools) {
        if (!this.llmService) {
            throw new Error('LlmService 不可用，无法进行智能工具选择');
        }
        if (availableTools.length === 0) {
            throw new Error('没有可用的工具');
        }
        if (availableTools.length === 1) {
            return {
                tool: availableTools[0],
                confidence: 0.9,
                extractedParams: {},
                reason: 'Only one tool available',
                reasonCN: '只有一个可用工具',
            };
        }
        const cacheKey = this.buildCacheKey(userMessage, context, availableTools);
        const cached = this.selectionCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            this.logger.debug(`使用缓存的工具选择结果: ${cached.selection.tool.toolName}`);
            return cached.selection;
        }
        this.logger.debug(`从 ${availableTools.length} 个工具中选择，用户消息: "${userMessage.substring(0, 50)}..."`);
        const prompt = this.buildToolSelectionPrompt(userMessage, context, availableTools);
        try {
            const result = await this.llmService.callLlmWithSchema(llm_request_dto_1.LlmProvider.DEEPSEEK, prompt);
            let parsed;
            if (typeof result === 'string') {
                const cleaned = this.cleanJsonString(result);
                parsed = JSON.parse(cleaned);
            }
            else {
                parsed = result;
            }
            const selectedTool = availableTools.find(t => t.toolName === parsed.toolName ||
                t.toolName.endsWith(`.${parsed.toolName}`));
            if (!selectedTool) {
                this.logger.warn(`LLM 选择了未知工具: ${parsed.toolName}，使用第一个可用工具`);
                return {
                    tool: availableTools[0],
                    confidence: 0.5,
                    extractedParams: parsed.extractedParams || {},
                    reason: 'Tool not found, using first available',
                    reasonCN: '工具未找到，使用第一个可用工具',
                };
            }
            const confidence = Math.max(0, Math.min(1, parsed.confidence || 0.5));
            this.logger.debug(`工具选择结果: ${selectedTool.toolName}, confidence=${confidence}`);
            const selection = {
                tool: selectedTool,
                confidence,
                extractedParams: parsed.extractedParams || {},
                reason: parsed.reason,
                reasonCN: parsed.reasonCN,
            };
            this.selectionCache.set(cacheKey, {
                selection,
                timestamp: Date.now(),
            });
            this.cleanExpiredCache();
            return selection;
        }
        catch (error) {
            this.logger.error(`工具选择失败: ${error.message}`, error.stack);
            return {
                tool: availableTools[0],
                confidence: 0.5,
                extractedParams: {},
                reason: 'Selection failed, using first tool',
                reasonCN: '选择失败，使用第一个工具',
            };
        }
    }
    buildToolSelectionPrompt(userMessage, context, availableTools) {
        const contextInfo = context.selectedDestination
            ? `已选定的目的地: ${context.selectedDestination}\n当前阶段: ${context.phase || 'UNKNOWN'}`
            : '新会话';
        const toolsDescription = availableTools.map(tool => `
- ${tool.toolName} (${tool.displayName})
  描述: ${tool.description}
  参数:
${tool.parameters.map(p => `    - ${p.name} (${p.type})${p.required ? ' [必需]' : ' [可选]'}: ${p.description}`).join('\n')}
  示例: ${tool.examples.join(', ')}
`).join('\n');
        return `分析用户消息，从可用工具中选择最合适的工具，并提取参数。

用户消息: "${userMessage}"

会话上下文:
${contextInfo}

可用工具:
${toolsDescription}

请选择最合适的工具，并提取参数。

返回 JSON 格式:
{
  "toolName": "工具名称（完整名称，如 'airbnb.listingDetails'）",
  "confidence": 0.0-1.0,
  "reason": "选择原因（英文）",
  "reasonCN": "选择原因（中文）",
  "extractedParams": {
    "参数名": "参数值"
  }
}

注意：
1. 如果用户询问房源详情、设施、价格等，选择 listingDetails 工具
2. 如果用户询问天气预报、未来天气，选择 getWeatherByDatetimeRange 工具
3. 如果用户询问当前天气，选择 getCurrentWeather 工具
4. 如果用户只是搜索房源，选择 search 工具
5. 参数值应该从用户消息中提取，如果消息中没有，使用会话上下文中的值（如 selectedDestination）`;
    }
    cleanJsonString(jsonString) {
        if (!jsonString || typeof jsonString !== 'string') {
            return jsonString;
        }
        let cleaned = jsonString.trim();
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
        cleaned = cleaned.replace(/\s*```$/g, '');
        cleaned = cleaned.trim();
        return cleaned;
    }
    buildCacheKey(userMessage, context, availableTools) {
        const toolNames = availableTools.map(t => t.toolName).sort().join(',');
        const contextKey = `${context.selectedDestination || ''}_${context.phase || ''}`;
        return `${userMessage.substring(0, 100)}_${contextKey}_${toolNames}`;
    }
    cleanExpiredCache() {
        const now = Date.now();
        for (const [key, value] of this.selectionCache.entries()) {
            if (now - value.timestamp > this.CACHE_TTL) {
                this.selectionCache.delete(key);
            }
        }
    }
    clearCache() {
        this.selectionCache.clear();
        this.logger.debug('工具选择缓存已清除');
    }
};
exports.LlmToolSelectorService = LlmToolSelectorService;
exports.LlmToolSelectorService = LlmToolSelectorService = LlmToolSelectorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [llm_service_1.LlmService])
], LlmToolSelectorService);
//# sourceMappingURL=llm-tool-selector.service.js.map