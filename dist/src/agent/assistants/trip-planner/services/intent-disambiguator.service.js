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
var IntentDisambiguatorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntentDisambiguatorService = void 0;
const common_1 = require("@nestjs/common");
const intent_uncertainty_interface_1 = require("../interfaces/intent-uncertainty.interface");
const context_analyzer_service_1 = require("./context-analyzer.service");
let IntentDisambiguatorService = IntentDisambiguatorService_1 = class IntentDisambiguatorService {
    constructor(contextAnalyzer) {
        this.contextAnalyzer = contextAnalyzer;
        this.logger = new common_1.Logger(IntentDisambiguatorService_1.name);
    }
    async disambiguate(message, intent, state) {
        this.logger.debug(`[意图消歧] 分析: "${message.substring(0, 50)}...", intent=${intent}`);
        const diagnostics = {
            detectedKeywords: [],
            explicitAction: null,
            relatedGaps: [],
            analysisPath: [],
        };
        const gaps = this.contextAnalyzer.detectGaps(state.tripContext);
        diagnostics.relatedGaps = gaps;
        diagnostics.analysisPath.push(`检测到 ${gaps.length} 个缺口`);
        const explicitAction = this.detectExplicitAction(message);
        diagnostics.explicitAction = explicitAction;
        diagnostics.analysisPath.push(`明确动作: ${explicitAction || '无'}`);
        const gapAnalysis = this.contextAnalyzer.analyzeRequestGapRelation(message, intent, gaps);
        diagnostics.analysisPath.push(`缺口关联: ${gapAnalysis.related ? '是' : '否'}`);
        const result = this.resolveUncertainty(message, intent, state, gaps, gapAnalysis, explicitAction);
        result.diagnostics = diagnostics;
        result.originalIntent = intent;
        this.logger.debug(`[意图消歧] 结果: uncertainty=${result.uncertainty}, confidence=${result.confidence}`);
        return result;
    }
    detectExplicitAction(message) {
        if (intent_uncertainty_interface_1.ADD_KEYWORDS.some(k => message.includes(k))) {
            return 'ADD';
        }
        if (intent_uncertainty_interface_1.QUERY_KEYWORDS.some(k => message.includes(k))) {
            return 'QUERY';
        }
        return null;
    }
    resolveUncertainty(message, intent, state, gaps, gapAnalysis, explicitAction) {
        var _a;
        const clearIntents = [
            'OPTIMIZE_ROUTE',
            'ADJUST_PACE',
            'REBALANCE_DAYS',
            'REPLACE_POI',
            'CHECK_FEASIBILITY',
            'CREATE_CHECKLIST',
            'EXPORT_ITINERARY',
            'SHARE_TRIP',
            'SHOW_OVERVIEW',
            'UNDO_CHANGE',
            'PLAN_TRANSPORT',
            'COMPARE_OPTIONS',
        ];
        if (clearIntents.includes(intent)) {
            this.logger.debug(`[意图消歧] 明确意图，直接执行: ${intent}`);
            return {
                uncertainty: intent_uncertainty_interface_1.IntentUncertainty.CLEAR,
                confidence: 0.95,
                originalIntent: intent,
                resolvedIntent: { action: 'EXECUTE', intent },
            };
        }
        if (explicitAction === 'ADD') {
            return this.handleExplicitAdd(message, state, gaps, gapAnalysis);
        }
        if (explicitAction === 'QUERY') {
            if (gapAnalysis.related && gapAnalysis.bestMatch) {
                return this.handleQueryWithGapDiscovery(message, intent, gapAnalysis);
            }
            return {
                uncertainty: intent_uncertainty_interface_1.IntentUncertainty.CLEAR,
                confidence: 0.95,
                originalIntent: intent,
                resolvedIntent: { action: 'QUERY' },
            };
        }
        if (intent === 'ASK_QUESTION' || intent === 'GET_SUGGESTION') {
            if (gapAnalysis.related && gapAnalysis.bestMatch) {
                return this.handleQueryWithGapDiscovery(message, intent, gapAnalysis);
            }
            return {
                uncertainty: intent_uncertainty_interface_1.IntentUncertainty.CLEAR,
                confidence: 0.85,
                originalIntent: intent,
                resolvedIntent: { action: 'QUERY' },
            };
        }
        if (gapAnalysis.related && ((_a = gapAnalysis.bestMatch) === null || _a === void 0 ? void 0 : _a.severity) === 'CRITICAL') {
            return this.handleCriticalGapDiscovery(message, intent, gapAnalysis);
        }
        if (gapAnalysis.related && gapAnalysis.bestMatch) {
            return this.handleSuggestedGapDiscovery(message, intent, gapAnalysis);
        }
        if (['ADD_ACTIVITY', 'ARRANGE_MEALS', 'FILL_FREE_TIME', 'ADD_HOTEL'].includes(intent)) {
            return this.handleAmbiguousAction(message, intent, state);
        }
        return {
            uncertainty: intent_uncertainty_interface_1.IntentUncertainty.CLEAR,
            confidence: 0.7,
            originalIntent: intent,
            resolvedIntent: { action: 'EXECUTE', intent },
        };
    }
    handleExplicitAdd(message, state, gaps, gapAnalysis) {
        if (gapAnalysis.related && gapAnalysis.bestMatch) {
            const gap = gapAnalysis.bestMatch;
            return {
                uncertainty: intent_uncertainty_interface_1.IntentUncertainty.CLEAR,
                confidence: 0.9,
                originalIntent: 'ADD_ACTIVITY',
                resolvedIntent: {
                    action: 'ADD_TO_ITINERARY',
                    target: {
                        dayNumber: gap.dayNumber,
                        timeSlot: gap.timeSlot,
                    },
                },
                contextDiscovery: {
                    foundGap: true,
                    gap,
                    confidence: gapAnalysis.confidence,
                    suggestion: `将添加到${this.contextAnalyzer.formatGapDescription(gap)}`,
                    shouldPrompt: false,
                },
            };
        }
        return {
            uncertainty: intent_uncertainty_interface_1.IntentUncertainty.AMBIGUOUS_TARGET,
            confidence: 0.7,
            originalIntent: 'ADD_ACTIVITY',
            clarificationNeeded: this.generateTargetClarification(message, state, gaps),
        };
    }
    handleQueryWithGapDiscovery(message, intent, gapAnalysis) {
        const gap = gapAnalysis.bestMatch;
        return {
            uncertainty: intent_uncertainty_interface_1.IntentUncertainty.CLEAR,
            confidence: 0.85,
            originalIntent: intent,
            resolvedIntent: { action: 'QUERY' },
            contextDiscovery: {
                foundGap: true,
                gap,
                confidence: gapAnalysis.confidence,
                suggestion: `我注意到${this.contextAnalyzer.formatGapDescription(gap)}`,
                shouldPrompt: gap.severity === 'CRITICAL',
            },
        };
    }
    handleCriticalGapDiscovery(message, intent, gapAnalysis) {
        const gap = gapAnalysis.bestMatch;
        const gapDesc = this.contextAnalyzer.formatGapDescription(gap);
        return {
            uncertainty: intent_uncertainty_interface_1.IntentUncertainty.AMBIGUOUS_NEED,
            confidence: 0.8,
            originalIntent: intent,
            contextDiscovery: {
                foundGap: true,
                gap,
                confidence: gapAnalysis.confidence,
                suggestion: `我注意到${gapDesc}`,
                shouldPrompt: true,
            },
            clarificationNeeded: {
                question: `我注意到${gapDesc}，是想让我帮您安排吗？`,
                context: this.getGapContextExplanation(gap),
                options: [
                    {
                        id: 'add_to_gap',
                        label: `是的，帮我安排${this.getGapActionLabel(gap)}`,
                        action: 'ADD_TO_ITINERARY',
                        params: {
                            dayNumber: gap.dayNumber,
                            timeSlot: gap.timeSlot,
                            gapId: gap.id,
                        },
                        style: 'primary',
                    },
                    {
                        id: 'just_query',
                        label: '不用，我只是想了解一下',
                        action: 'QUERY',
                        style: 'secondary',
                    },
                ],
                allowFreeText: true,
            },
        };
    }
    handleSuggestedGapDiscovery(message, intent, gapAnalysis) {
        const gap = gapAnalysis.bestMatch;
        const gapDesc = this.contextAnalyzer.formatGapDescription(gap);
        return {
            uncertainty: intent_uncertainty_interface_1.IntentUncertainty.AMBIGUOUS_ACTION,
            confidence: 0.7,
            originalIntent: intent,
            contextDiscovery: {
                foundGap: true,
                gap,
                confidence: gapAnalysis.confidence,
                suggestion: `顺便提一下，${gapDesc}`,
                shouldPrompt: false,
            },
            clarificationNeeded: {
                question: `您是想了解相关信息，还是想把它加到行程里呢？`,
                options: [
                    {
                        id: 'just_query',
                        label: '只是了解一下',
                        action: 'QUERY',
                        style: 'secondary',
                    },
                    {
                        id: 'add_to_itinerary',
                        label: '帮我加到行程里',
                        description: gap ? `添加到第${gap.dayNumber}天` : undefined,
                        action: 'ADD_TO_ITINERARY',
                        params: gap ? {
                            dayNumber: gap.dayNumber,
                            timeSlot: gap.timeSlot,
                            gapId: gap.id,
                        } : undefined,
                        style: 'primary',
                    },
                ],
                allowFreeText: true,
            },
        };
    }
    handleAmbiguousAction(message, intent, state) {
        return {
            uncertainty: intent_uncertainty_interface_1.IntentUncertainty.AMBIGUOUS_ACTION,
            confidence: 0.6,
            originalIntent: intent,
            resolvedIntent: { action: 'QUERY' },
            clarificationNeeded: {
                question: '您是想了解相关信息，还是想把它加到行程里呢？',
                options: [
                    {
                        id: 'just_query',
                        label: '只是了解一下',
                        action: 'QUERY',
                        style: 'secondary',
                    },
                    {
                        id: 'add_to_itinerary',
                        label: '帮我加到行程里',
                        action: 'ADD_TO_ITINERARY',
                        style: 'primary',
                    },
                ],
                allowFreeText: true,
            },
        };
    }
    generateTargetClarification(message, state, gaps) {
        const options = [];
        const relevantGaps = gaps.slice(0, 3);
        for (const gap of relevantGaps) {
            options.push({
                id: `gap_${gap.id}`,
                label: `第${gap.dayNumber}天${gap.timeSlot.start}`,
                description: this.contextAnalyzer.formatGapDescription(gap),
                action: 'ADD_TO_ITINERARY',
                params: {
                    dayNumber: gap.dayNumber,
                    timeSlot: gap.timeSlot,
                    gapId: gap.id,
                },
            });
        }
        options.push({
            id: 'manual',
            label: '让我自己指定时间',
            action: 'ADD_TO_ITINERARY',
            style: 'secondary',
        });
        return {
            question: '您想把它加到哪个时间段？',
            options,
            allowFreeText: true,
        };
    }
    getGapContextExplanation(gap) {
        const parts = [];
        if (gap.context.dayTheme) {
            parts.push(`第${gap.dayNumber}天的主题是"${gap.context.dayTheme}"`);
        }
        if (gap.context.beforeActivity) {
            parts.push(`之前的活动是${gap.context.beforeActivity.name}`);
        }
        if (gap.context.afterActivity) {
            parts.push(`之后要去${gap.context.afterActivity.name}`);
        }
        return parts.length > 0 ? parts.join('，') : '';
    }
    getGapActionLabel(gap) {
        switch (gap.type) {
            case 'MEAL':
                return '用餐';
            case 'HOTEL':
                return '住宿';
            case 'TRANSPORT':
                return '交通';
            case 'ACTIVITY':
            case 'FREE_TIME':
                return '活动';
            default:
                return '';
        }
    }
    handleClarificationResponse(userResponse, clarificationRequest, state) {
        const selectedOption = this.matchSelectedOption(userResponse, clarificationRequest.options);
        if (selectedOption) {
            return {
                uncertainty: intent_uncertainty_interface_1.IntentUncertainty.CLEAR,
                confidence: 0.95,
                originalIntent: 'GENERAL_CHAT',
                resolvedIntent: {
                    action: selectedOption.action,
                    target: selectedOption.params ? {
                        dayNumber: selectedOption.params.dayNumber,
                        timeSlot: selectedOption.params.timeSlot,
                        itemId: selectedOption.params.targetItemId,
                    } : undefined,
                },
            };
        }
        if (clarificationRequest.allowFreeText) {
            return this.parseFreetextResponse(userResponse, state);
        }
        return {
            uncertainty: intent_uncertainty_interface_1.IntentUncertainty.AMBIGUOUS_ACTION,
            confidence: 0.3,
            originalIntent: 'GENERAL_CHAT',
            clarificationNeeded: {
                question: '抱歉，我没有理解您的选择。请选择一个选项或重新描述：',
                options: clarificationRequest.options,
                allowFreeText: true,
            },
        };
    }
    matchSelectedOption(userResponse, options) {
        const normalized = userResponse.toLowerCase().trim();
        for (const option of options) {
            if (option.label.toLowerCase() === normalized) {
                return option;
            }
            if (option.label.toLowerCase().includes(normalized) ||
                normalized.includes(option.label.toLowerCase())) {
                return option;
            }
            if (option.action === 'QUERY' &&
                ['了解', '看看', '不用', '不'].some(k => normalized.includes(k))) {
                return option;
            }
            if (option.action === 'ADD_TO_ITINERARY' &&
                ['是', '好', '加', '安排', '帮我'].some(k => normalized.includes(k))) {
                return option;
            }
        }
        return null;
    }
    parseFreetextResponse(userResponse, state) {
        const dayMatch = userResponse.match(/第(\d+)天/);
        const timeMatch = userResponse.match(/(\d{1,2})[:\：]?(\d{2})?/);
        if (dayMatch) {
            const dayNumber = parseInt(dayMatch[1], 10);
            const timeSlot = timeMatch ? {
                start: `${timeMatch[1].padStart(2, '0')}:${timeMatch[2] || '00'}`,
                end: `${(parseInt(timeMatch[1], 10) + 2).toString().padStart(2, '0')}:${timeMatch[2] || '00'}`,
            } : undefined;
            return {
                uncertainty: intent_uncertainty_interface_1.IntentUncertainty.CLEAR,
                confidence: 0.8,
                originalIntent: 'ADD_ACTIVITY',
                resolvedIntent: {
                    action: 'ADD_TO_ITINERARY',
                    target: {
                        dayNumber,
                        timeSlot,
                    },
                },
            };
        }
        return {
            uncertainty: intent_uncertainty_interface_1.IntentUncertainty.AMBIGUOUS_TARGET,
            confidence: 0.4,
            originalIntent: 'ADD_ACTIVITY',
            clarificationNeeded: {
                question: '请告诉我想添加到第几天？',
                options: state.tripContext.days.slice(0, 5).map(day => ({
                    id: `day_${day.dayNumber}`,
                    label: `第${day.dayNumber}天 - ${day.theme || day.date}`,
                    action: 'ADD_TO_ITINERARY',
                    params: { dayNumber: day.dayNumber },
                })),
                allowFreeText: true,
            },
        };
    }
};
exports.IntentDisambiguatorService = IntentDisambiguatorService;
exports.IntentDisambiguatorService = IntentDisambiguatorService = IntentDisambiguatorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [context_analyzer_service_1.ContextAnalyzerService])
], IntentDisambiguatorService);
//# sourceMappingURL=intent-disambiguator.service.js.map