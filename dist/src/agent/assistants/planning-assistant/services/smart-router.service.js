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
var SmartRouterService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SmartRouterService = void 0;
const common_1 = require("@nestjs/common");
const llm_service_1 = require("../../../../llm/services/llm.service");
const llm_request_dto_1 = require("../../../../llm/dto/llm-request.dto");
const mcp_tool_registry_service_1 = require("./mcp-tool-registry.service");
const llm_tool_selector_service_1 = require("./llm-tool-selector.service");
let SmartRouterService = SmartRouterService_1 = class SmartRouterService {
    constructor(llmService, toolRegistry, toolSelector) {
        this.llmService = llmService;
        this.toolRegistry = toolRegistry;
        this.toolSelector = toolSelector;
        this.logger = new common_1.Logger(SmartRouterService_1.name);
        this.logger.log('🚀 智能路由服务已初始化');
        this.logger.log(`工具融合能力: Registry=${!!toolRegistry}, Selector=${!!toolSelector}`);
        if (!toolRegistry) {
            this.logger.warn('⚠️ McpToolRegistryService 未注入！');
        }
        if (!toolSelector) {
            this.logger.warn('⚠️ LlmToolSelectorService 未注入！');
        }
    }
    async routeWithTools(message, sessionState) {
        const routingResult = await this.route(message, sessionState);
        const specificServiceTargets = [
            'hotel', 'airbnb', 'accommodation', 'restaurant',
            'flight', 'rail', 'carRental', 'weather', 'search',
            'translate', 'currency', 'image'
        ];
        this.logger.log(`[工具选择] 检查: target=${routingResult.target}, hasRegistry=${!!this.toolRegistry}, hasSelector=${!!this.toolSelector}`);
        if (routingResult.target !== 'chat' &&
            routingResult.target !== 'recommendations' &&
            routingResult.target !== 'generate' &&
            routingResult.target !== 'compare' &&
            this.toolRegistry &&
            this.toolSelector) {
            try {
                const serviceName = this.mapTargetToServiceName(routingResult.target);
                this.logger.log(`[工具选择] 路由目标 ${routingResult.target} 映射到服务: ${serviceName}`);
                if (serviceName) {
                    const availableTools = this.toolRegistry.getServiceTools(serviceName);
                    this.logger.log(`[工具选择] 服务 ${serviceName} 可用工具数: ${availableTools.length}, 工具列表: ${availableTools.map(t => t.toolName).join(', ')}`);
                    if (availableTools.length > 0) {
                        this.logger.log(`[工具选择] 开始工具选择，可用工具: ${availableTools.map(t => t.toolName).join(', ')}`);
                        const toolSelection = await this.toolSelector.selectTool(message, {
                            phase: sessionState === null || sessionState === void 0 ? void 0 : sessionState.phase,
                            preferences: sessionState === null || sessionState === void 0 ? void 0 : sessionState.preferences,
                            selectedDestination: sessionState === null || sessionState === void 0 ? void 0 : sessionState.selectedDestination,
                        }, availableTools);
                        this.logger.log(`[工具选择] 结果: ${toolSelection.tool.toolName}, confidence=${toolSelection.confidence}`);
                        if (toolSelection.confidence >= 0.6) {
                            this.logger.log(`[工具选择] ✅ 成功: ${toolSelection.tool.toolName}, confidence=${toolSelection.confidence}`);
                            const mergedParams = {
                                ...routingResult.extractedParams,
                                ...toolSelection.extractedParams,
                            };
                            return {
                                ...routingResult,
                                extractedParams: mergedParams,
                                selectedTool: toolSelection.tool,
                                toolSelection,
                            };
                        }
                        else {
                            this.logger.log(`[工具选择] ⚠️ 置信度较低(${toolSelection.confidence})，使用默认路由`);
                        }
                    }
                    else {
                        this.logger.warn(`[工具选择] ⚠️ 服务 ${serviceName} 没有可用工具`);
                    }
                }
                else {
                    this.logger.log(`[工具选择] ⚠️ 路由目标 ${routingResult.target} 无法映射到服务名称`);
                }
            }
            catch (error) {
                this.logger.error(`[工具选择] ❌ 失败: ${error.message}，使用默认路由`, error.stack);
            }
        }
        else {
            this.logger.log(`[工具选择] ⏭️ 跳过: target=${routingResult.target}, hasRegistry=${!!this.toolRegistry}, hasSelector=${!!this.toolSelector}`);
        }
        return routingResult;
    }
    async route(message, sessionState) {
        var _a;
        this.logger.debug(`智能路由分析: message="${message.substring(0, 50)}...", selectedDestination=${(sessionState === null || sessionState === void 0 ? void 0 : sessionState.selectedDestination) || 'none'}`);
        try {
            const keywordResult = this.routeByKeywords(message, sessionState);
            if ((sessionState === null || sessionState === void 0 ? void 0 : sessionState.selectedDestination) && keywordResult.extractedParams && !keywordResult.extractedParams.destination) {
                keywordResult.extractedParams.destination = sessionState.selectedDestination;
                this.logger.debug(`关键词路由：使用会话中的目的地 ${sessionState.selectedDestination}`);
            }
            const specificServiceTargets = [
                'hotel', 'airbnb', 'accommodation', 'restaurant',
                'flight', 'rail', 'carRental', 'weather', 'search',
                'translate', 'currency', 'image'
            ];
            const confidenceThreshold = keywordResult.target === 'hotel' ? 0.75 : 0.8;
            if (keywordResult.confidence >= confidenceThreshold &&
                specificServiceTargets.includes(keywordResult.target)) {
                this.logger.debug(`[智能路由] 关键词路由匹配到具体服务: ${keywordResult.target} ` +
                    `(confidence=${keywordResult.confidence.toFixed(2)}), ` +
                    `destination=${((_a = keywordResult.extractedParams) === null || _a === void 0 ? void 0 : _a.destination) || 'none'}, ` +
                    `message="${message.substring(0, 30)}..."`);
                return keywordResult;
            }
            if (this.llmService) {
                const llmResult = await this.routeWithLLM(message, sessionState);
                if (llmResult && llmResult.confidence > 0.6) {
                    if (specificServiceTargets.includes(keywordResult.target) &&
                        keywordResult.confidence >= 0.8) {
                        if (specificServiceTargets.includes(llmResult.target) &&
                            llmResult.target === keywordResult.target) {
                            this.logger.debug(`关键词路由与LLM路由一致，使用关键词结果: ${keywordResult.target}`);
                            return keywordResult;
                        }
                        if (!specificServiceTargets.includes(llmResult.target) ||
                            llmResult.target === 'recommendations') {
                            this.logger.debug(`关键词路由优先级更高（${keywordResult.target}, confidence=${keywordResult.confidence}），` +
                                `覆盖LLM路由（${llmResult.target}, confidence=${llmResult.confidence}）`);
                            return keywordResult;
                        }
                    }
                    if (specificServiceTargets.includes(llmResult.target) &&
                        specificServiceTargets.includes(keywordResult.target) &&
                        keywordResult.confidence >= 0.8) {
                        this.logger.debug(`关键词路由优先级更高，使用关键词结果: ${keywordResult.target}`);
                        return keywordResult;
                    }
                    return llmResult;
                }
                this.logger.debug(`LLM路由置信度较低(${llmResult === null || llmResult === void 0 ? void 0 : llmResult.confidence})，使用关键词路由`);
            }
            return keywordResult;
        }
        catch (error) {
            this.logger.warn(`智能路由失败: ${error.message}，使用默认路由`);
            return {
                target: 'chat',
                confidence: 0.5,
                reason: 'Routing failed, fallback to chat',
                reasonCN: '路由失败，回退到对话',
            };
        }
    }
    async routeWithLLM(message, sessionState) {
        var _a;
        const contextInfo = sessionState
            ? `当前阶段: ${sessionState.phase || 'UNKNOWN'}
已有偏好: ${JSON.stringify(sessionState.preferences || {})}
已有方案数: ${((_a = sessionState.planCandidates) === null || _a === void 0 ? void 0 : _a.length) || 0}
已选定的目的地: ${sessionState.selectedDestination || '无'}`
            : '新会话';
        const prompt = `分析用户消息，判断应该路由到哪个接口。

用户消息: "${message}"

会话上下文:
${contextInfo}

**重要规则**：
1. 如果消息包含"酒店"、"hotel"、"推荐酒店"、"找酒店"等关键词，**必须**路由到 hotel，不要路由到 recommendations
2. 如果会话中已选定目的地（selectedDestination不为空），且用户请求具体服务（如酒店、餐厅），应该路由到具体服务，而不是 recommendations
3. 只有在用户明确要求推荐新目的地（如"推荐一些目的地"、"我想去日本"）时，才路由到 recommendations

可选接口（按优先级排序，具体服务优先于通用推荐）:
- hotel: 用户想要搜索酒店（例如："推荐冰岛的酒店"、"找酒店"、"搜索酒店"、"冰岛酒店"、"推荐酒店"）- **如果消息包含"酒店"或"hotel"，必须路由到这里，不要路由到 recommendations**
- airbnb: 用户想要搜索 Airbnb/民宿（例如："推荐 Airbnb"、"找民宿"、"短租"、"Airbnb 房源"）- 如果消息包含"airbnb"、"民宿"、"bnb"，优先路由到这里
- accommodation: 用户想要搜索住宿（包括酒店和 Airbnb）（例如："推荐住宿"、"找住处"、"住宿推荐"）- 如果消息只包含"住宿"且不包含"酒店"或"airbnb"，路由到这里
- restaurant: 用户想要搜索餐厅（例如："推荐餐厅"、"找餐厅"、"附近有什么好吃的"、"餐厅推荐"）- 如果消息包含"餐厅"、"restaurant"、"美食"，优先路由到这里
- flight: 用户想要搜索航班（例如："搜索从北京到上海的航班"、"查机票"、"航班查询"、"找航班"）- 如果消息包含"航班"、"flight"、"机票"，优先路由到这里
- rail: 用户想要查询铁路（例如："查询从巴黎到伦敦的火车"、"火车票"、"铁路查询"、"查火车"、"高铁"）- 如果消息包含"火车"、"rail"、"高铁"，优先路由到这里
- carRental: 用户想要搜索租车（例如："冰岛租车推荐"、"租车"、"car rental"）- 如果消息包含"租车"、"car rental"、"car hire"，优先路由到这里
- weather: 用户想要查询天气（例如："冰岛天气怎么样"、"查天气"、"天气预报"、"天气查询"）- 如果消息包含"天气"、"weather"，优先路由到这里
- search: 用户想要搜索信息（例如："搜索冰岛旅游攻略"、"查一下"、"网上搜索"、"Web搜索"）- 如果消息包含"搜索"且包含"信息"、"资料"、"攻略"等，优先路由到这里
- translate: 用户想要翻译（例如："翻译一下"、"这是什么意思"、"翻译成中文"）- 如果消息包含"翻译"、"translate"，优先路由到这里
- currency: 用户想要货币转换（例如："汇率"、"货币转换"、"换算"、"美元换人民币"）- 如果消息包含"汇率"、"货币"、"换算"，优先路由到这里
- image: 用户想要搜索图片（例如："找图片"、"图片搜索"、"看看图片"）- 如果消息包含"图片"、"image"，优先路由到这里
- recommendations: 用户想要推荐目的地（例如："推荐一些目的地"、"我想去日本"、"有什么好玩的地方"）- **重要：如果会话中已选定目的地（selectedDestination不为空），绝对不应该路由到这里！应该路由到具体服务（如hotel、restaurant、carRental等）或chat。只有在用户明确要求推荐新目的地时才路由到这里。**
- generate: 用户想要生成方案（例如："帮我规划行程"、"生成一个5天的方案"、"做个计划"）
- compare: 用户想要对比方案（例如："对比这两个方案"、"哪个更好"、"比较一下"）
- chat: 其他对话、问答、闲聊（例如："你好"、"这是什么"、"谢谢"）

返回JSON格式:
{
  "target": "recommendations" | "generate" | "compare" | "hotel" | "airbnb" | "accommodation" | "restaurant" | "flight" | "rail" | "carRental" | "weather" | "search" | "translate" | "currency" | "image" | "chat",
  "confidence": 0.0-1.0,
  "reason": "路由原因（英文）",
  "reasonCN": "路由原因（中文）",
  "extractedParams": {
    "destination": "目的地（如果有）",
    "location": { "lat": 纬度, "lng": 经度 },
    "preferences": { "预算、人数等偏好（如果有）" },
    "planIds": ["方案ID列表（如果对比）"],
    "naturalLanguage": "原始消息",
    "excludeAirbnb": true,
    "query": "搜索查询（如果有）",
    "sourceLanguage": "源语言（翻译）",
    "targetLanguage": "目标语言（翻译）",
    "fromCurrency": "源货币（货币转换）",
    "toCurrency": "目标货币（货币转换）",
    "amount": "金额（货币转换）",
    "origin": "出发地（铁路查询）",
    "destination": "目的地（铁路查询）",
    "date": "日期（铁路查询，格式：YYYY-MM-DD）"
  }
}`;
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
            const validTargets = [
                'recommendations', 'generate', 'compare',
                'hotel', 'airbnb', 'accommodation',
                'restaurant', 'flight', 'rail',
                'weather', 'search', 'translate', 'currency', 'image',
                'chat'
            ];
            const target = validTargets.includes(parsed.target) ? parsed.target : 'chat';
            const confidence = Math.max(0, Math.min(1, parsed.confidence || 0.5));
            this.logger.debug(`LLM路由结果: message="${message.substring(0, 30)}..." -> ${target} (confidence=${confidence})`);
            const extractedParams = parsed.extractedParams || {};
            if ((sessionState === null || sessionState === void 0 ? void 0 : sessionState.selectedDestination) && !extractedParams.destination) {
                extractedParams.destination = sessionState.selectedDestination;
                this.logger.debug(`LLM路由：使用会话中的目的地 ${sessionState.selectedDestination}`);
            }
            return {
                target,
                confidence,
                extractedParams,
                reason: parsed.reason,
                reasonCN: parsed.reasonCN,
            };
        }
        catch (error) {
            this.logger.warn(`LLM路由解析失败: ${error.message}`);
            throw error;
        }
    }
    routeByKeywords(message, sessionState) {
        var _a;
        const lowerMessage = message.toLowerCase();
        const contextDestination = sessionState === null || sessionState === void 0 ? void 0 : sessionState.selectedDestination;
        if (lowerMessage.includes('airbnb') ||
            lowerMessage.includes('民宿') ||
            lowerMessage.includes('短租') ||
            (lowerMessage.includes('bnb') && !lowerMessage.includes('hotel')) ||
            (lowerMessage.includes('推荐') && (lowerMessage.includes('airbnb') || lowerMessage.includes('民宿')))) {
            return {
                target: 'airbnb',
                confidence: 0.95,
                reason: 'User wants Airbnb listings',
                reasonCN: '用户想要搜索 Airbnb/民宿',
                extractedParams: {
                    naturalLanguage: message,
                    excludeAirbnb: false,
                },
            };
        }
        if (lowerMessage.includes('住宿') &&
            !lowerMessage.includes('酒店') &&
            !lowerMessage.includes('airbnb') &&
            !lowerMessage.includes('民宿')) {
            return {
                target: 'accommodation',
                confidence: 0.85,
                reason: 'User wants accommodation (hotels + Airbnb)',
                reasonCN: '用户想要搜索住宿（包括酒店和 Airbnb）',
                extractedParams: {
                    naturalLanguage: message,
                    excludeAirbnb: false,
                },
            };
        }
        const hotelKeywords = [
            '酒店', 'hotel', '找酒店', '搜索酒店', '推荐酒店',
            '酒店推荐', '酒店搜索', '找住宿', '住宿推荐'
        ];
        const hasHotelKeyword = hotelKeywords.some(keyword => lowerMessage.includes(keyword));
        const isRecommendHotel = lowerMessage.includes('推荐') && lowerMessage.includes('酒店');
        if (hasHotelKeyword || isRecommendHotel) {
            this.logger.debug(`[关键词路由] 酒店关键词匹配: message="${message}", ` +
                `hasHotelKeyword=${hasHotelKeyword}, isRecommendHotel=${isRecommendHotel}, ` +
                `lowerMessage="${lowerMessage}"`);
            let destination = contextDestination;
            if (!destination) {
                destination = message;
                destination = destination.replace(/推荐|酒店|hotel|找|搜索|住宿|推荐|的/gi, '').trim();
                if (destination && destination.length > 0) {
                    destination = destination.trim();
                }
                else {
                    destination = undefined;
                }
            }
            this.logger.debug(`[关键词路由] 酒店搜索匹配: message="${message}", ` +
                `contextDestination=${contextDestination || 'none'}, ` +
                `extractedDestination=${destination || 'none'}`);
            return {
                target: 'hotel',
                confidence: 0.95,
                reason: destination ? `User wants to search for hotels in ${destination}` : 'User wants to search for hotels',
                reasonCN: destination ? `用户想要搜索${destination}的酒店` : '用户想要搜索酒店',
                extractedParams: {
                    naturalLanguage: message,
                    ...(destination && { destination: destination }),
                    excludeAirbnb: false,
                },
            };
        }
        if (lowerMessage.includes('餐厅') || lowerMessage.includes('restaurant') ||
            lowerMessage.includes('餐馆') || lowerMessage.includes('饭店') ||
            lowerMessage.includes('美食') || lowerMessage.includes('好吃的') ||
            lowerMessage.includes('吃饭') || lowerMessage.includes('用餐') ||
            (lowerMessage.includes('推荐') && (lowerMessage.includes('餐厅') || lowerMessage.includes('美食')))) {
            return {
                target: 'restaurant',
                confidence: 0.9,
                reason: 'User wants to search for restaurants',
                reasonCN: '用户想要搜索餐厅',
                extractedParams: {
                    naturalLanguage: message,
                },
            };
        }
        if (lowerMessage.includes('航班') || lowerMessage.includes('flight') ||
            lowerMessage.includes('机票') || lowerMessage.includes('飞机') ||
            lowerMessage.includes('查机票') || lowerMessage.includes('找航班') ||
            (lowerMessage.includes('搜索') && (lowerMessage.includes('航班') || lowerMessage.includes('机票')))) {
            return {
                target: 'flight',
                confidence: 0.9,
                reason: 'User wants to search for flights',
                reasonCN: '用户想要搜索航班',
                extractedParams: {
                    naturalLanguage: message,
                },
            };
        }
        if (lowerMessage.includes('火车') || lowerMessage.includes('rail') ||
            lowerMessage.includes('高铁') || lowerMessage.includes('动车') ||
            lowerMessage.includes('铁路') || lowerMessage.includes('train') ||
            (lowerMessage.includes('查询') && (lowerMessage.includes('火车') || lowerMessage.includes('铁路')))) {
            return {
                target: 'rail',
                confidence: 0.9,
                reason: 'User wants to search for rail routes',
                reasonCN: '用户想要查询铁路',
                extractedParams: {
                    naturalLanguage: message,
                },
            };
        }
        if (lowerMessage.includes('租车') || lowerMessage.includes('car rental') ||
            lowerMessage.includes('car hire') || lowerMessage.includes('租车推荐') ||
            lowerMessage.includes('推荐') && (lowerMessage.includes('租车') || lowerMessage.includes('租车公司'))) {
            let destination = contextDestination;
            if (!destination) {
                destination = message.replace(/租车|car.*rental|car.*hire|推荐/gi, '').trim();
                if (!destination || destination.length === 0) {
                    destination = message;
                }
            }
            return {
                target: 'carRental',
                confidence: 0.95,
                reason: contextDestination ? `User wants to search for car rentals in ${contextDestination}` : 'User wants to search for car rentals',
                reasonCN: contextDestination ? `用户想要搜索${contextDestination}的租车` : '用户想要搜索租车',
                extractedParams: {
                    naturalLanguage: message,
                    destination: destination,
                },
            };
        }
        if (lowerMessage.includes('天气') || lowerMessage.includes('weather') ||
            lowerMessage.includes('天气预报') || lowerMessage.includes('查天气') ||
            lowerMessage.includes('天气怎么样') || lowerMessage.includes('天气如何') ||
            lowerMessage.includes('天气情况') || lowerMessage.includes('气温') ||
            lowerMessage.includes('温度') || lowerMessage.includes('下雨') ||
            lowerMessage.includes('晴天') || lowerMessage.includes('多云')) {
            let destination = contextDestination;
            if (!destination && lowerMessage.includes('天气')) {
                destination = message.replace(/天气|weather|预报|怎么样|如何|情况|查询|查/gi, '').trim();
                if (!destination || destination.length === 0) {
                    destination = message;
                }
            }
            return {
                target: 'weather',
                confidence: 0.95,
                reason: destination ? `User wants weather information for ${destination}` : 'User wants weather information',
                reasonCN: destination ? `用户想要查询${destination}的天气` : '用户想要查询天气',
                extractedParams: {
                    naturalLanguage: message,
                    destination: destination,
                    location: destination,
                },
            };
        }
        if (lowerMessage.includes('搜索') || lowerMessage.includes('search') ||
            lowerMessage.includes('查一下') || lowerMessage.includes('网上搜索') ||
            lowerMessage.includes('web') || lowerMessage.includes('网上') ||
            lowerMessage.includes('攻略') || lowerMessage.includes('指南') ||
            lowerMessage.includes('信息') || lowerMessage.includes('资料') ||
            lowerMessage.includes('深度搜索') || lowerMessage.includes('深度研究') ||
            lowerMessage.includes('web搜索') || lowerMessage.includes('web search')) {
            let query = message;
            if (lowerMessage.includes('搜索')) {
                const searchMatch = message.match(/搜索[：:：]?(.+)/i) || message.match(/搜索(.+)/i);
                if (searchMatch && searchMatch[1]) {
                    query = searchMatch[1].trim();
                }
            }
            return {
                target: 'search',
                confidence: 0.85,
                reason: 'User wants web search',
                reasonCN: '用户想要搜索信息',
                extractedParams: {
                    naturalLanguage: message,
                    query: query,
                },
            };
        }
        if (lowerMessage.includes('翻译') || lowerMessage.includes('translate') ||
            lowerMessage.includes('什么意思') || lowerMessage.includes('是什么意思')) {
            return {
                target: 'translate',
                confidence: 0.85,
                reason: 'User wants translation',
                reasonCN: '用户想要翻译',
                extractedParams: {
                    naturalLanguage: message,
                },
            };
        }
        if (lowerMessage.includes('汇率') || lowerMessage.includes('exchange rate') ||
            lowerMessage.includes('货币转换') || lowerMessage.includes('换算') ||
            lowerMessage.includes('换') && (lowerMessage.includes('元') || lowerMessage.includes('美元') || lowerMessage.includes('人民币'))) {
            return {
                target: 'currency',
                confidence: 0.85,
                reason: 'User wants currency conversion',
                reasonCN: '用户想要货币转换',
                extractedParams: {
                    naturalLanguage: message,
                },
            };
        }
        if (lowerMessage.includes('图片') || lowerMessage.includes('image') ||
            lowerMessage.includes('照片') || lowerMessage.includes('picture') ||
            lowerMessage.includes('找图片') || lowerMessage.includes('图片搜索')) {
            return {
                target: 'image',
                confidence: 0.8,
                reason: 'User wants image search',
                reasonCN: '用户想要搜索图片',
                extractedParams: {
                    naturalLanguage: message,
                },
            };
        }
        const recommendKeywords = [
            '推荐', 'recommend', '推荐一些', '推荐几个', '有什么', '哪里', 'where',
            '目的地', 'destination', '好玩', '值得去', '适合', 'suitable'
        ];
        const hasSpecificServiceKeyword = lowerMessage.includes('酒店') || lowerMessage.includes('hotel') ||
            lowerMessage.includes('airbnb') || lowerMessage.includes('民宿') ||
            lowerMessage.includes('餐厅') || lowerMessage.includes('restaurant') ||
            lowerMessage.includes('航班') || lowerMessage.includes('flight') ||
            lowerMessage.includes('火车') || lowerMessage.includes('rail') ||
            lowerMessage.includes('租车') || lowerMessage.includes('car rental') ||
            lowerMessage.includes('天气') || lowerMessage.includes('weather') ||
            lowerMessage.includes('翻译') || lowerMessage.includes('translate') ||
            lowerMessage.includes('汇率') || lowerMessage.includes('货币') ||
            lowerMessage.includes('图片') || lowerMessage.includes('image');
        if (contextDestination && !hasSpecificServiceKeyword && recommendKeywords.some(keyword => lowerMessage.includes(keyword))) {
            this.logger.debug(`用户已选定目的地 ${contextDestination}，但消息包含推荐关键词，路由到chat而不是recommendations`);
            return {
                target: 'chat',
                confidence: 0.7,
                reason: `User has selected destination ${contextDestination}, route to chat for context-aware response`,
                reasonCN: `用户已选定目的地${contextDestination}，路由到对话以提供上下文感知的回复`,
                extractedParams: {
                    naturalLanguage: message,
                    destination: contextDestination,
                },
            };
        }
        if (!hasSpecificServiceKeyword && recommendKeywords.some(keyword => lowerMessage.includes(keyword))) {
            return {
                target: 'recommendations',
                confidence: 0.8,
                reason: 'Contains recommendation keywords',
                reasonCN: '包含推荐关键词',
                extractedParams: {
                    naturalLanguage: message,
                },
            };
        }
        const generateKeywords = [
            '规划', 'plan', '生成', 'generate', '安排', 'arrange', '行程', 'itinerary',
            '方案', '计划', '做个', '帮我', '帮我规划', '帮我安排'
        ];
        if (generateKeywords.some(keyword => lowerMessage.includes(keyword))) {
            return {
                target: 'generate',
                confidence: 0.8,
                reason: 'Contains plan generation keywords',
                reasonCN: '包含方案生成关键词',
                extractedParams: {
                    naturalLanguage: message,
                },
            };
        }
        const compareKeywords = [
            '对比', 'compare', '比较', '哪个', '哪个好', '哪个更好', '区别', 'difference',
            '差异', '对比一下', '比较一下'
        ];
        if (compareKeywords.some(keyword => lowerMessage.includes(keyword))) {
            const planIds = ((_a = sessionState === null || sessionState === void 0 ? void 0 : sessionState.planCandidates) === null || _a === void 0 ? void 0 : _a.map(p => p.id)) || [];
            return {
                target: 'compare',
                confidence: planIds.length >= 2 ? 0.9 : 0.6,
                reason: 'Contains comparison keywords',
                reasonCN: '包含对比关键词',
                extractedParams: {
                    planIds: planIds.length >= 2 ? planIds.slice(0, 2) : [],
                    naturalLanguage: message,
                },
            };
        }
        return {
            target: 'chat',
            confidence: 0.6,
            reason: 'No specific intent detected, route to chat',
            reasonCN: '未检测到特定意图，路由到对话',
            extractedParams: {
                naturalLanguage: message,
            },
        };
    }
    async extractParams(naturalLanguage, targetType) {
        this.logger.debug(`提取参数: type=${targetType}, message="${naturalLanguage.substring(0, 50)}..."`);
        if (!this.llmService) {
            this.logger.warn('LLM服务不可用，无法提取参数');
            return {};
        }
        const prompt = this.buildExtractionPrompt(naturalLanguage, targetType);
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
            this.logger.debug(`参数提取成功: ${JSON.stringify(parsed).substring(0, 100)}...`);
            return parsed;
        }
        catch (error) {
            this.logger.warn(`参数提取失败: ${error.message}`);
            return {};
        }
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
    buildExtractionPrompt(naturalLanguage, targetType) {
        const basePrompt = `从用户消息中提取结构化参数。

用户消息: "${naturalLanguage}"`;
        switch (targetType) {
            case 'recommendations':
                return `${basePrompt}

提取以下参数（如果存在）:
- destination: 目的地（国家、城市）
- preferences.budget: 预算信息 { total: 金额, currency: "CNY"|"USD" }
- preferences.travelers: 出行人数 { adults: 人数, children: 可选 }
- preferences.activities: 活动偏好（数组）
- preferences.travelStyle: 旅行风格
- filters.countryCode: 国家代码（ISO 3166-1 alpha-2）
- filters.region: 地区

返回JSON格式:
{
  "destination": "目的地",
  "preferences": { ... },
  "filters": { ... }
}`;
            case 'generate':
                return `${basePrompt}

提取以下参数（如果存在）:
- destination: 目的地（必需）
- preferences.budget: 预算信息
- preferences.travelers: 出行人数
- preferences.activities: 活动偏好
- constraints.days: 天数
- constraints.startDate: 开始日期（ISO格式）
- constraints.endDate: 结束日期（ISO格式）

返回JSON格式:
{
  "destination": "目的地",
  "preferences": { ... },
  "constraints": { ... }
}`;
            case 'compare':
                return `${basePrompt}

提取以下参数（如果存在）:
- planIds: 方案ID列表（如果消息中提到了方案编号或名称）

返回JSON格式:
{
  "planIds": ["plan_id_1", "plan_id_2"]
}`;
            default:
                return basePrompt;
        }
    }
    mapTargetToServiceName(target) {
        const mapping = {
            'airbnb': 'airbnb',
            'weather': 'weather',
            'search': 'exa',
            'hotel': 'hotel',
            'accommodation': 'hotel',
            'restaurant': 'restaurant',
            'flight': 'amadeus',
            'rail': 'rail',
            'carRental': 'booking-com',
            'translate': 'translation',
            'currency': 'currency',
            'image': 'image',
            'calendar': 'google-calendar',
        };
        return mapping[target] || null;
    }
};
exports.SmartRouterService = SmartRouterService;
exports.SmartRouterService = SmartRouterService = SmartRouterService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [llm_service_1.LlmService,
        mcp_tool_registry_service_1.McpToolRegistryService,
        llm_tool_selector_service_1.LlmToolSelectorService])
], SmartRouterService);
//# sourceMappingURL=smart-router.service.js.map