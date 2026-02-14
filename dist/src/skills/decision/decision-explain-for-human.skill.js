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
var DecisionExplainForHumanSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisionExplainForHumanSkill = void 0;
const common_1 = require("@nestjs/common");
const decision_log_storage_service_1 = require("../../trips/decision/services/decision-log-storage.service");
const world_build_context_skill_1 = require("../world/world-build-context.skill");
let DecisionExplainForHumanSkill = DecisionExplainForHumanSkill_1 = class DecisionExplainForHumanSkill {
    constructor(decisionLogStorage, worldBuildContext) {
        this.decisionLogStorage = decisionLogStorage;
        this.worldBuildContext = worldBuildContext;
        this.logger = new common_1.Logger(DecisionExplainForHumanSkill_1.name);
        this.metadata = {
            name: 'decision.explainForHuman',
            description: '将技术性的决策日志转换为用户可读的解释，包括三人格的工作说明、风险点和取舍',
            version: '1.0.0',
            category: 'decision',
        };
    }
    async execute(input) {
        this.logger.debug(`执行 decision.explainForHuman: tripId=${input.tripId || 'none'}`);
        try {
            let decisionLog;
            let world = input.world;
            if (input.tripId) {
                const logs = await this.decisionLogStorage.queryLogs({
                    tripId: input.tripId,
                    limit: 100,
                });
                decisionLog = logs.map(log => ({
                    persona: log.persona,
                    action: log.action,
                    explanation: log.explanation,
                    reasonCodes: log.reasonCodes,
                    timestamp: log.timestamp,
                }));
                if (!world) {
                    const contextResult = await this.worldBuildContext.execute({
                        tripId: input.tripId,
                    });
                    world = contextResult.world;
                }
            }
            else if (input.decisionLog) {
                decisionLog = input.decisionLog;
            }
            else {
                throw new Error('必须提供 tripId 或 decisionLog');
            }
            if (!decisionLog || decisionLog.length === 0) {
                return {
                    userFacingNarrative: {
                        abuSection: '暂无决策记录',
                        drdreSection: '暂无节奏调整记录',
                        neptuneSection: '暂无路段替换记录',
                    },
                    riskHighlights: [],
                    tradeOffs: [],
                    explanation: '暂无决策记录',
                    summary: '暂无决策记录',
                    keyPoints: [],
                };
            }
            const abuLogs = decisionLog.filter(log => log.persona === 'ABU');
            const drdreLogs = decisionLog.filter(log => log.persona === 'DR_DRE');
            const neptuneLogs = decisionLog.filter(log => log.persona === 'NEPTUNE');
            const userFacingNarrative = {
                abuSection: this.generateAbuNarrative(abuLogs),
                drdreSection: this.generateDrdreNarrative(drdreLogs),
                neptuneSection: this.generateNeptuneNarrative(neptuneLogs, world),
            };
            const riskHighlights = this.extractRiskHighlights(decisionLog);
            const tradeOffs = this.extractTradeOffs(decisionLog);
            const explanation = [
                userFacingNarrative.abuSection,
                userFacingNarrative.drdreSection,
                userFacingNarrative.neptuneSection,
            ].join('\n\n');
            const summary = `本次决策共涉及 ${decisionLog.length} 条记录，${riskHighlights.length} 个风险点，${tradeOffs.length} 个取舍。`;
            const keyPoints = riskHighlights.map(rh => ({
                point: rh.explanation,
                category: rh.severity,
            }));
            return {
                userFacingNarrative,
                riskHighlights,
                tradeOffs,
                explanation,
                summary,
                keyPoints,
            };
        }
        catch (error) {
            this.logger.error(`生成用户解释失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    generateAbuNarrative(logs) {
        if (logs.length === 0) {
            return '安全守护者 Abu 检查了行程，未发现安全隐患。';
        }
        const rejectLogs = logs.filter(log => log.action === 'REJECT');
        if (rejectLogs.length > 0) {
            const reasons = rejectLogs.map(log => log.explanation).join('、');
            return `安全守护者 Abu 发现了一些安全隐患：${reasons}。为确保您的安全，这些危险路段已被标记。`;
        }
        return '安全守护者 Abu 检查了行程的所有路段，确认计划安全可行。';
    }
    generateDrdreNarrative(logs) {
        if (logs.length === 0) {
            return '节奏调节者 Dr.Dre 检查了行程节奏，认为当前安排合理。';
        }
        const adjustLogs = logs.filter(log => log.action === 'ADJUST');
        if (adjustLogs.length > 0) {
            const adjustments = adjustLogs.map(log => log.explanation).join('、');
            return `节奏调节者 Dr.Dre 优化了行程节奏：${adjustments}。这能让您更轻松地享受旅程，避免过度疲劳。`;
        }
        return '节奏调节者 Dr.Dre 检查了行程密度，当前节奏适中。';
    }
    generateNeptuneNarrative(logs, world) {
        var _a;
        if (logs.length === 0) {
            return '路线守护者 Neptune 检查了路线完整性，所有路段均可用。';
        }
        const replaceLogs = logs.filter(log => log.action === 'REPLACE');
        if (replaceLogs.length > 0) {
            const replacements = replaceLogs.map(log => log.explanation).join('、');
            const philosophyNote = ((_a = world === null || world === void 0 ? void 0 : world.routeDirection) === null || _a === void 0 ? void 0 : _a.name)
                ? `我们保持了"${world.routeDirection.name}"路线的核心风格`
                : '我们保持了路线的核心风格';
            return `路线守护者 Neptune 替换了一些不可用的路段：${replacements}。${philosophyNote}，确保您能获得相同的旅行体验。`;
        }
        return '路线守护者 Neptune 检查了路线可用性，所有关键路段均畅通。';
    }
    extractRiskHighlights(logs) {
        const risks = [];
        const highRisks = logs
            .filter(log => { var _a; return log.action === 'REJECT' || ((_a = log.reasonCodes) === null || _a === void 0 ? void 0 : _a.some(code => code.includes('HARD'))); })
            .slice(0, 5)
            .map(log => ({
            risk: log.explanation,
            severity: 'high',
            explanation: log.explanation,
        }));
        risks.push(...highRisks);
        const mediumRisks = logs
            .filter(log => log.action === 'ADJUST' && !highRisks.some(r => r.risk === log.explanation))
            .slice(0, 3)
            .map(log => ({
            risk: log.explanation,
            severity: 'medium',
            explanation: log.explanation,
        }));
        risks.push(...mediumRisks);
        return risks.slice(0, 5);
    }
    extractTradeOffs(logs) {
        const tradeOffs = [];
        logs
            .filter(log => log.action === 'ADJUST')
            .forEach(log => {
            tradeOffs.push({
                what: log.explanation,
                why: '为了确保行程节奏合理，避免过度疲劳',
                impact: '行程可能略有调整，但体验更加舒适',
            });
        });
        logs
            .filter(log => log.action === 'REPLACE')
            .forEach(log => {
            tradeOffs.push({
                what: log.explanation,
                why: '原路段不可用或存在风险',
                impact: '替换为相似风格的路线，保持旅行体验',
            });
        });
        return tradeOffs;
    }
};
exports.DecisionExplainForHumanSkill = DecisionExplainForHumanSkill;
exports.DecisionExplainForHumanSkill = DecisionExplainForHumanSkill = DecisionExplainForHumanSkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [decision_log_storage_service_1.DecisionLogStorageService,
        world_build_context_skill_1.WorldBuildContextSkill])
], DecisionExplainForHumanSkill);
//# sourceMappingURL=decision-explain-for-human.skill.js.map