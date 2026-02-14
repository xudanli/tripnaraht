"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var BrandExpressionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrandExpressionService = void 0;
const common_1 = require("@nestjs/common");
let BrandExpressionService = BrandExpressionService_1 = class BrandExpressionService {
    constructor() {
        this.logger = new common_1.Logger(BrandExpressionService_1.name);
    }
    generateRationalExpression(data, context) {
        return {
            factLayer: this.generateFactLayer(data),
            relationLayer: this.generateRelationLayer(data),
            predictionLayer: this.generatePredictionLayer(data),
            suggestionLayer: this.generateSuggestionLayer(data, context),
        };
    }
    generateWarmthExpression(userContext, context) {
        return {
            understanding: this.generateUnderstanding(userContext),
            companion: this.generateCompanion(),
            encouragement: this.generateEncouragement(userContext),
            detail: this.generateDetail(context),
        };
    }
    generateBalancedCopy(content, context) {
        const ratio = this.determineRatio(context);
        const rationalExpression = this.generateRationalExpression(content, {
            scenario: context.scenario,
            userContext: context.userContext,
            dataContext: content,
        });
        const warmthExpression = this.generateWarmthExpression(context.userContext || {}, {
            scenario: context.scenario,
            userContext: context.userContext,
            dataContext: content,
        });
        const rationalText = this.generateRationalText(rationalExpression, ratio.rational);
        const warmthText = this.generateWarmthText(warmthExpression, ratio.warmth);
        const combined = this.combineParts(rationalText, warmthText, ratio);
        return {
            rational: {
                text: rationalText,
                layers: rationalExpression,
            },
            warmth: {
                text: warmthText,
                dimensions: warmthExpression,
            },
            combined,
            ratio,
        };
    }
    generateFactLayer(data) {
        const facts = [];
        const dataObj = {};
        if (data.name) {
            facts.push(`路线名称：${data.name}`);
            dataObj.name = data.name;
        }
        if (data.duration) {
            facts.push(`预计时长：${data.duration}天`);
            dataObj.duration = data.duration;
        }
        if (data.tags && Array.isArray(data.tags)) {
            facts.push(`路线标签：${data.tags.join('、')}`);
            dataObj.tags = data.tags;
        }
        if (data.seasonality) {
            if (data.seasonality.bestMonths) {
                facts.push(`最佳月份：${data.seasonality.bestMonths.join('、')}月`);
                dataObj.bestMonths = data.seasonality.bestMonths;
            }
        }
        return {
            facts: facts.length > 0 ? facts : ['路线基本信息'],
            data: dataObj,
        };
    }
    generateRelationLayer(data) {
        const relations = [];
        const connections = [];
        if (data.seasonality && data.riskProfile) {
            relations.push('季节性因素与风险存在关联');
            connections.push({
                from: '季节性',
                to: '风险',
                relation: '最佳季节通常风险较低',
            });
        }
        if (data.constraints && data.riskProfile) {
            relations.push('路线约束与风险相关');
            connections.push({
                from: '路线约束',
                to: '风险',
                relation: '约束条件影响风险水平',
            });
        }
        return {
            relations: relations.length > 0 ? relations : ['路线各要素之间存在关联'],
            connections: connections.length > 0 ? connections : [],
        };
    }
    generatePredictionLayer(data) {
        var _a;
        const predictions = [];
        if (data.seasonality) {
            const currentMonth = new Date().getMonth() + 1;
            const isBestSeason = (_a = data.seasonality.bestMonths) === null || _a === void 0 ? void 0 : _a.includes(currentMonth);
            predictions.push({
                scenario: '季节性体验',
                probability: isBestSeason ? 0.9 : 0.6,
                explanation: isBestSeason
                    ? '当前处于最佳旅行季节，体验预期良好'
                    : '当前不是最佳季节，但体验仍可接受',
            });
        }
        if (data.completionProbability !== undefined) {
            predictions.push({
                scenario: '完成可能性',
                probability: data.completionProbability,
                explanation: `基于当前条件，完成这条路线的可能性为${Math.round(data.completionProbability * 100)}%`,
            });
        }
        return {
            predictions: predictions.length > 0 ? predictions : [
                {
                    scenario: '整体体验',
                    probability: 0.7,
                    explanation: '基于路线特征，预期体验良好',
                },
            ],
        };
    }
    generateSuggestionLayer(data, context) {
        var _a, _b, _c;
        const suggestions = [];
        const rationale = [];
        if ((_a = data.constraints) === null || _a === void 0 ? void 0 : _a.requiresPermit) {
            suggestions.push('提前申请相关许可');
            rationale.push('路线要求必须获得许可才能进入');
        }
        if ((_b = data.riskProfile) === null || _b === void 0 ? void 0 : _b.altitudeSickness) {
            suggestions.push('提前适应高海拔环境');
            rationale.push('路线涉及高海拔地区，需要适应以避免高反');
        }
        if ((_c = data.riskProfile) === null || _c === void 0 ? void 0 : _c.weatherWindow) {
            suggestions.push('关注天气预报，准备应对恶劣天气');
            rationale.push('路线受天气窗口限制，需要关注天气变化');
        }
        return {
            suggestions: suggestions.length > 0 ? suggestions : ['做好充分准备'],
            rationale: rationale.length > 0 ? rationale : ['基于路线特征，建议做好充分准备'],
        };
    }
    generateUnderstanding(userContext) {
        return {
            message: '我理解你的想法和顾虑',
            empathy: [
                '做出旅行决定并不容易',
                '你希望找到最适合自己的路线',
                '我们理解你的犹豫和思考',
            ],
        };
    }
    generateCompanion() {
        return {
            message: '我们会陪伴你一起探索',
            support: [
                '你不是一个人在决策',
                '我们会提供你需要的信息和支持',
                '无论你做出什么决定，我们都会支持你',
            ],
        };
    }
    generateEncouragement(userContext) {
        return {
            message: '相信你能做出最适合自己的决定',
            positive: [
                '你已经迈出了第一步',
                '你的思考和谨慎是值得赞赏的',
                '无论结果如何，这个过程都是有价值的',
            ],
        };
    }
    generateDetail(context) {
        var _a;
        const personalized = [];
        const attention = [];
        if ((_a = context.userContext) === null || _a === void 0 ? void 0 : _a.preferences) {
            personalized.push('我们注意到你的偏好和需求');
            attention.push('我们会根据你的情况提供个性化建议');
        }
        return {
            personalized: personalized.length > 0 ? personalized : ['我们会关注你的具体情况'],
            attention: attention.length > 0 ? attention : ['我们会关注每一个细节'],
        };
    }
    determineRatio(context) {
        const ratios = {
            risk_warning: { rational: 0.8, warmth: 0.2 },
            decision_support: { rational: 0.7, warmth: 0.3 },
            encouragement: { rational: 0.3, warmth: 0.7 },
            story_sharing: { rational: 0.4, warmth: 0.6 },
            error_handling: { rational: 0.5, warmth: 0.5 },
            information_sharing: { rational: 0.65, warmth: 0.35 },
            rejection: { rational: 0.6, warmth: 0.4 },
            confirmation: { rational: 0.5, warmth: 0.5 },
        };
        return ratios[context.scenario] || { rational: 0.65, warmth: 0.35 };
    }
    generateRationalText(expression, ratio) {
        const parts = [];
        if (expression.factLayer.facts.length > 0) {
            parts.push(expression.factLayer.facts.join('。'));
        }
        if (expression.relationLayer.relations.length > 0) {
            parts.push(expression.relationLayer.relations.join('。'));
        }
        if (expression.predictionLayer.predictions.length > 0) {
            const prediction = expression.predictionLayer.predictions[0];
            parts.push(`${prediction.scenario}：${prediction.explanation}`);
        }
        if (expression.suggestionLayer.suggestions.length > 0) {
            parts.push(`建议：${expression.suggestionLayer.suggestions.join('、')}`);
        }
        return parts.join(' ');
    }
    generateWarmthText(expression, ratio) {
        const parts = [];
        if (ratio >= 0.3) {
            parts.push(expression.understanding.message);
        }
        if (ratio >= 0.4) {
            parts.push(expression.companion.message);
        }
        if (ratio >= 0.5) {
            parts.push(expression.encouragement.message);
        }
        if (expression.detail.personalized.length > 0 && ratio >= 0.3) {
            parts.push(expression.detail.personalized[0]);
        }
        return parts.join(' ');
    }
    combineParts(rationalText, warmthText, ratio) {
        const parts = [];
        if (ratio.rational >= ratio.warmth) {
            parts.push(rationalText);
            if (warmthText) {
                parts.push(warmthText);
            }
        }
        else {
            if (warmthText) {
                parts.push(warmthText);
            }
            parts.push(rationalText);
        }
        return parts.filter(p => p.trim().length > 0).join(' ');
    }
};
exports.BrandExpressionService = BrandExpressionService;
exports.BrandExpressionService = BrandExpressionService = BrandExpressionService_1 = __decorate([
    (0, common_1.Injectable)()
], BrandExpressionService);
//# sourceMappingURL=brand-expression.service.js.map