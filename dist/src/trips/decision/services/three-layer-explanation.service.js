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
var ThreeLayerExplanationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ThreeLayerExplanationService = void 0;
const common_1 = require("@nestjs/common");
const source_annotation_service_1 = require("../../../data-quality/services/source-annotation.service");
let ThreeLayerExplanationService = ThreeLayerExplanationService_1 = class ThreeLayerExplanationService {
    constructor(sourceAnnotationService) {
        this.sourceAnnotationService = sourceAnnotationService;
        this.logger = new common_1.Logger(ThreeLayerExplanationService_1.name);
    }
    generateThreeLayerExplanation(plan, log, violations) {
        this.logger.log('Generating three-layer explanation');
        const conclusion = this.generateConclusion(plan, log, violations);
        const reason = this.generateReason(plan, log, violations);
        const evidence = this.generateEvidence(plan, log);
        return {
            layer1_conclusion: conclusion,
            layer2_reason: reason,
            layer3_evidence: evidence,
        };
    }
    generateUserFriendlyExplanation(explanation) {
        return {
            shortConclusion: explanation.layer1_conclusion.statement,
            detailedExplanation: explanation,
            expandable: true,
        };
    }
    generateConclusion(plan, log, violations) {
        if (violations && violations.some(v => v.severity === 'error')) {
            return {
                statement: '这条路线目前不建议',
                confidence: 0.9,
            };
        }
        if (violations && violations.some(v => v.severity === 'error')) {
            return {
                statement: '这条路线被拒绝',
                confidence: 0.85,
            };
        }
        if (violations && violations.some(v => v.severity === 'warning')) {
            return {
                statement: '这条路线可行，但需要注意一些问题',
                confidence: 0.75,
            };
        }
        if (plan && plan.days.length > 0) {
            return {
                statement: '这条路线可行',
                confidence: 0.8,
            };
        }
        return {
            statement: '路线评估中',
            confidence: 0.5,
        };
    }
    generateReason(plan, log, violations) {
        const primaryFactors = [];
        const contributingFactors = [];
        if (violations) {
            violations.forEach(v => {
                if (v.severity === 'error') {
                    primaryFactors.push(v.message);
                }
                else {
                    contributingFactors.push(v.message);
                }
            });
        }
        if (log.explanation) {
            primaryFactors.push(log.explanation);
        }
        if (log.strategyMix && log.strategyMix.length > 0) {
            const strategyNames = {
                abu: '核心体验保护策略',
                drdre: '时间窗调度策略',
                neptune: '动态修复策略',
            };
            const strategies = log.strategyMix
                .map(s => strategyNames[s] || s)
                .join('、');
            contributingFactors.push(`采用策略：${strategies}`);
        }
        if (log.chosenActions && log.chosenActions.length > 0) {
            log.chosenActions.forEach(action => {
                const actionDesc = this.describeAction(action);
                if (action.reasonCodes && action.reasonCodes.length > 0) {
                    contributingFactors.push(`${actionDesc}：${action.reasonCodes.join('、')}`);
                }
                else {
                    contributingFactors.push(actionDesc);
                }
            });
        }
        let explanation = '';
        if (primaryFactors.length > 0) {
            explanation = primaryFactors.join('。');
            if (contributingFactors.length > 0) {
                explanation += '。此外，' + contributingFactors.join('；');
            }
        }
        else if (contributingFactors.length > 0) {
            explanation = contributingFactors.join('；');
        }
        else {
            explanation = '基于系统分析和评估';
        }
        return {
            primaryFactors,
            contributingFactors: contributingFactors.length > 0 ? contributingFactors : undefined,
            explanation,
        };
    }
    generateEvidence(plan, log) {
        const dataSources = this.extractDataSources(log);
        const calculationMethod = this.extractCalculationMethod(log);
        const assumptions = this.extractAssumptions(log);
        const limitations = this.extractLimitations(log);
        const evidenceChain = this.buildEvidenceChain(log);
        return {
            dataSources,
            calculationMethod,
            assumptions,
            limitations,
            evidenceChain,
        };
    }
    extractDataSources(log) {
        var _a;
        const sources = [];
        if ((_a = log.evidenceChain) === null || _a === void 0 ? void 0 : _a.planEvidence) {
            sources.push({
                type: 'ROUTE',
                timestamp: log.at,
                reliability: 'HIGH',
                source: 'DATABASE',
                sourceName: '路线规划引擎',
                confidence: 0.8,
                verificationLevel: 'B_RELIABLE',
                isFactual: true,
            });
        }
        return sources;
    }
    extractCalculationMethod(log) {
        if (log.strategyMix && log.strategyMix.length > 0) {
            return `使用${log.strategyMix.join(' + ')}策略进行计算`;
        }
        return undefined;
    }
    extractAssumptions(log) {
        const assumptions = [];
        if (log.explanation) {
        }
        if (assumptions.length === 0) {
            assumptions.push('用户提供的信息准确');
            assumptions.push('环境条件在预测范围内');
            assumptions.push('交通和开放时间信息可靠');
        }
        return assumptions;
    }
    extractLimitations(log) {
        var _a;
        const limitations = [];
        if (log.violations && log.violations.length > 0) {
            limitations.push(`检测到 ${log.violations.length} 个约束违规`);
        }
        if ((_a = log.dryRunResult) === null || _a === void 0 ? void 0 : _a.willFail) {
            limitations.push(`预测可能在第 ${log.dryRunResult.failureDay} 天失败`);
        }
        if (limitations.length === 0) {
            limitations.push('预测基于历史数据和当前信息，实际结果可能有所不同');
            limitations.push('天气和交通状况可能实时变化');
            limitations.push('用户体力和偏好可能存在变化');
        }
        return limitations;
    }
    buildEvidenceChain(log) {
        const chain = [];
        let step = 1;
        if (log.chosenActions && log.chosenActions.length > 0) {
            log.chosenActions.forEach(action => {
                chain.push({
                    step: step++,
                    operation: this.getActionType(action.actionType),
                    input: this.getActionInput(action),
                    output: this.getActionOutput(action),
                    method: this.getActionMethod(action),
                });
            });
        }
        if (chain.length === 0) {
            chain.push({
                step: 1,
                operation: '路线评估',
                input: '用户请求和约束条件',
                output: log.explanation || '评估结果',
                method: '决策引擎分析',
            });
        }
        return chain;
    }
    describeAction(action) {
        const actionNames = {
            prioritize: '优先级调整',
            drop: '活动移除',
            swap: '活动替换',
            reorder: '顺序调整',
            insert_buffer: '插入缓冲时间',
            shorten: '时长缩短',
        };
        return actionNames[action.actionType] || action.actionType;
    }
    getActionType(actionType) {
        return this.describeAction({ actionType });
    }
    getActionInput(action) {
        if (action.payload) {
            return JSON.stringify(action.payload);
        }
        return '当前计划状态';
    }
    getActionOutput(action) {
        return `执行${this.describeAction(action)}操作`;
    }
    getActionMethod(action) {
        if (action.reasonCodes && action.reasonCodes.length > 0) {
            return `基于${action.reasonCodes.join('、')}的决策规则`;
        }
        return '决策规则引擎';
    }
    inferSourceType(ref) {
        const lowerRef = ref.toLowerCase();
        if (lowerRef.includes('dem') || lowerRef.includes('elevation')) {
            return 'DEM';
        }
        else if (lowerRef.includes('weather')) {
            return 'WEATHER';
        }
        else if (lowerRef.includes('transport')) {
            return 'TRANSPORT';
        }
        else if (lowerRef.includes('poi') || lowerRef.includes('place')) {
            return 'POI';
        }
        else if (lowerRef.includes('route')) {
            return 'ROUTE';
        }
        return 'OTHER';
    }
    inferSourceName(ref) {
        const lowerRef = ref.toLowerCase();
        if (lowerRef.includes('dem')) {
            return 'DEM地形数据API';
        }
        else if (lowerRef.includes('weather')) {
            return '天气数据API';
        }
        else if (lowerRef.includes('transport')) {
            return '交通数据API';
        }
        else if (lowerRef.includes('poi')) {
            return 'POI数据API';
        }
        return '数据源';
    }
};
exports.ThreeLayerExplanationService = ThreeLayerExplanationService;
exports.ThreeLayerExplanationService = ThreeLayerExplanationService = ThreeLayerExplanationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [source_annotation_service_1.SourceAnnotationService])
], ThreeLayerExplanationService);
//# sourceMappingURL=three-layer-explanation.service.js.map