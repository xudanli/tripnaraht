"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var ProductExplainableOutputBuilderService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductExplainableOutputBuilderService = void 0;
const common_1 = require("@nestjs/common");
let ProductExplainableOutputBuilderService = ProductExplainableOutputBuilderService_1 = class ProductExplainableOutputBuilderService {
    constructor() {
        this.logger = new common_1.Logger(ProductExplainableOutputBuilderService_1.name);
    }
    async buildExplainableOutput(result, context = {}) {
        const conclusion = this.buildConclusion(result, context);
        const evidence = await this.collectEvidence(result, context);
        const actionableSteps = this.generateActionableSteps(result, evidence);
        return {
            conclusion,
            evidence,
            actionable_steps: actionableSteps,
            alternatives: context.alternatives,
        };
    }
    buildConclusion(result, context) {
        var _a, _b, _c, _d;
        if (result.status === 'INFEASIBLE') {
            return {
                decision: 'REJECT',
                confidence: 0.9,
                summary: '路线不可行，建议调整约束条件或选择替代方案',
            };
        }
        const hasCriticalIssues = ((_b = (_a = result.diagnostics) === null || _a === void 0 ? void 0 : _a.critical_windows) === null || _b === void 0 ? void 0 : _b.some(w => w.slack_to_close_min < 15)) ||
            ((_c = result.robustness) === null || _c === void 0 ? void 0 : _c.risk_level) === 'high' ||
            (((_d = context.data_quality) === null || _d === void 0 ? void 0 : _d.missing.length) || 0) > 0;
        if (hasCriticalIssues) {
            return {
                decision: 'ADJUST',
                confidence: 0.7,
                summary: '路线可行但存在风险，建议调整以提高可靠性',
            };
        }
        return {
            decision: 'ACCEPT',
            confidence: 0.85,
            summary: '路线可行且质量良好，可以执行',
        };
    }
    async collectEvidence(result, context) {
        var _a, _b, _c;
        const ruleHits = context.rule_hits || [];
        const keyFeatures = [];
        const evidenceChain = [];
        keyFeatures.push(...this.extractKeyFeatures(result, context));
        if (context.dem_evidence) {
            context.dem_evidence.forEach(ev => {
                if (ev.cumulativeAscent) {
                    keyFeatures.push({
                        name: '累计爬升',
                        value: ev.cumulativeAscent,
                        unit: 'm',
                        status: ev.violation === 'HARD' ? 'VIOLATION' : ev.violation === 'SOFT' ? 'WARNING' : 'OK',
                        explanation: ev.explanation,
                    });
                }
                if (ev.maxSlopePct) {
                    keyFeatures.push({
                        name: '最大坡度',
                        value: ev.maxSlopePct,
                        unit: '%',
                        status: ev.maxSlopePct > 25 ? 'WARNING' : 'OK',
                        threshold: 25,
                    });
                }
            });
        }
        evidenceChain.push(...this.buildEvidenceChain(ruleHits, keyFeatures, context));
        const dataQuality = {
            missing_data: ((_a = context.data_quality) === null || _a === void 0 ? void 0 : _a.missing) || [],
            stale_data: ((_b = context.data_quality) === null || _b === void 0 ? void 0 : _b.stale) || [],
            low_reliability: ((_c = context.data_quality) === null || _c === void 0 ? void 0 : _c.low_reliability) || [],
        };
        return {
            rule_hits: ruleHits,
            key_features: keyFeatures,
            data_quality: dataQuality,
            evidence_chain: evidenceChain,
        };
    }
    extractKeyFeatures(result, context) {
        var _a, _b;
        const features = [];
        features.push({
            name: '总旅行时间',
            value: result.summary.total_travel_min,
            unit: '分钟',
            status: result.summary.total_travel_min > 240 ? 'WARNING' : 'OK',
        });
        features.push({
            name: '总等待时间',
            value: result.summary.total_wait_min,
            unit: '分钟',
            status: result.summary.total_wait_min > 60 ? 'WARNING' : 'OK',
        });
        if (result.summary.dropped_count > 0) {
            features.push({
                name: '丢弃节点数',
                value: result.summary.dropped_count,
                status: result.summary.dropped_count > 2 ? 'WARNING' : 'OK',
                explanation: '部分节点因约束冲突被丢弃',
            });
        }
        if (result.robustness) {
            features.push({
                name: '稳健度等级',
                value: result.robustness.risk_level === 'low' ? 1 : result.robustness.risk_level === 'medium' ? 2 : 3,
                status: result.robustness.risk_level === 'high' ? 'WARNING' : 'OK',
                explanation: `最小松弛时间: ${Math.min(...(((_a = result.robustness.top3_min_slack_nodes) === null || _a === void 0 ? void 0 : _a.map(n => n.slack_min)) || [0]))} 分钟`,
            });
        }
        if (((_b = result.diagnostics) === null || _b === void 0 ? void 0 : _b.critical_windows) && result.diagnostics.critical_windows.length > 0) {
            const minSlack = Math.min(...result.diagnostics.critical_windows.map(w => w.slack_to_close_min));
            features.push({
                name: '关键时间窗最小松弛',
                value: minSlack,
                unit: '分钟',
                threshold: 30,
                status: minSlack < 15 ? 'VIOLATION' : minSlack < 30 ? 'WARNING' : 'OK',
                explanation: '存在时间窗接近关闭的节点',
            });
        }
        return features;
    }
    buildEvidenceChain(ruleHits, keyFeatures, context) {
        const chain = [];
        ruleHits.forEach(rule => {
            chain.push({
                type: 'RULE_HIT',
                rule_id: rule.rule_id,
                rule_hit: rule,
            });
        });
        keyFeatures.forEach(feature => {
            chain.push({
                type: 'FEATURE',
                feature,
                data_source: this.inferDataSource(feature.name),
            });
        });
        const violations = keyFeatures.filter(f => f.status === 'VIOLATION');
        violations.forEach(v => {
            chain.push({
                type: 'CONSTRAINT',
                constraint: {
                    name: v.name,
                    status: 'VIOLATED',
                    details: v.explanation || `${v.name} 超过阈值`,
                },
            });
        });
        return chain;
    }
    inferDataSource(featureName) {
        const timestamp = new Date().toISOString();
        if (featureName.includes('爬升') || featureName.includes('坡度')) {
            return {
                type: 'DEM',
                timestamp,
                reliability: 'HIGH',
                source: 'API',
            };
        }
        if (featureName.includes('旅行时间') || featureName.includes('等待时间')) {
            return {
                type: 'TRANSPORT',
                timestamp,
                reliability: 'MEDIUM',
                source: 'CACHE',
            };
        }
        return {
            type: 'ROUTE',
            timestamp,
            reliability: 'MEDIUM',
            source: 'DATABASE',
        };
    }
    generateActionableSteps(result, evidence) {
        var _a;
        const steps = [];
        const violations = evidence.key_features.filter(f => f.status === 'VIOLATION');
        violations.forEach(v => {
            steps.push({
                priority: 'HIGH',
                action: this.generateActionForViolation(v),
                estimated_impact: '消除约束违反',
                user_confirmation_required: true,
            });
        });
        const warnings = evidence.key_features.filter(f => f.status === 'WARNING');
        if (warnings.length > 0) {
            steps.push({
                priority: 'MEDIUM',
                action: `优化 ${warnings.map(w => w.name).join('、')} 以减少风险`,
                estimated_impact: '提高路线可靠性和体验',
                user_confirmation_required: false,
            });
        }
        if (result.summary.dropped_count > 0) {
            steps.push({
                priority: 'MEDIUM',
                action: `重新考虑 ${result.summary.dropped_count} 个被丢弃的节点，可尝试调整时间或替换为替代节点`,
                estimated_impact: '增加路线丰富度',
                user_confirmation_required: false,
                actionable_items: (_a = result.dropped) === null || _a === void 0 ? void 0 : _a.map(d => ({
                    type: 'REPLACE_POI',
                    target: d.name,
                    suggested_value: `寻找 ${d.name} 的替代 POI`,
                })),
            });
        }
        if (evidence.data_quality.missing_data.length > 0) {
            steps.push({
                priority: 'HIGH',
                action: `刷新缺失数据: ${evidence.data_quality.missing_data.join('、')}`,
                estimated_impact: '提高路线准确性',
                user_confirmation_required: true,
            });
        }
        return steps;
    }
    generateActionForViolation(violation) {
        if (violation.name.includes('爬升')) {
            return `降低路线难度：选择爬升更少的替代路线或增加天数`;
        }
        if (violation.name.includes('坡度')) {
            return `避开陡坡路段：选择坡度更小的路线`;
        }
        if (violation.name.includes('时间窗')) {
            return `调整时间安排：提前出发或调整节点顺序以避免时间窗冲突`;
        }
        return `调整 ${violation.name} 以满足约束条件`;
    }
};
exports.ProductExplainableOutputBuilderService = ProductExplainableOutputBuilderService;
exports.ProductExplainableOutputBuilderService = ProductExplainableOutputBuilderService = ProductExplainableOutputBuilderService_1 = __decorate([
    (0, common_1.Injectable)()
], ProductExplainableOutputBuilderService);
//# sourceMappingURL=product-explainable-output-builder.service.js.map