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
var DecisionRunThreeGuardiansSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisionRunThreeGuardiansSkill = void 0;
const common_1 = require("@nestjs/common");
const strategy_orchestrator_service_1 = require("../../trips/decision/services/strategy-orchestrator.service");
const world_build_context_skill_1 = require("../world/world-build-context.skill");
const prisma_service_1 = require("../../prisma/prisma.service");
let DecisionRunThreeGuardiansSkill = DecisionRunThreeGuardiansSkill_1 = class DecisionRunThreeGuardiansSkill {
    constructor(worldBuildContext, prisma, strategyOrchestrator) {
        this.worldBuildContext = worldBuildContext;
        this.prisma = prisma;
        this.strategyOrchestrator = strategyOrchestrator;
        this.logger = new common_1.Logger(DecisionRunThreeGuardiansSkill_1.name);
        this.metadata = {
            name: 'decision.runThreeGuardians',
            description: '一次性执行三人格策略编排（Abu → Dr.Dre → Neptune），返回结构化决策结果和最终计划',
            version: '1.0.0',
            category: 'decision',
            inputSchema: {
                dependencies: [
                    { param: 'world', alternatives: ['tripId'] },
                    { param: 'tripId', alternatives: ['world'] },
                ],
                extractors: {
                    tripId: 'tripId',
                },
            },
        };
    }
    async execute(input) {
        this.logger.debug(`执行 decision.runThreeGuardians: tripId=${input.tripId || 'none'}`);
        try {
            let world;
            if (input.world) {
                world = input.world;
            }
            else if (input.tripId) {
                const contextResult = await this.worldBuildContext.execute({
                    tripId: input.tripId,
                });
                world = contextResult.world;
            }
            else {
                throw new Error('必须提供 world 或 tripId');
            }
            if (!this.strategyOrchestrator) {
                throw new Error('StrategyOrchestratorService 未可用，请确保 DecisionModule 已正确加载');
            }
            const result = await this.strategyOrchestrator.run(world, input.planCandidate);
            const abuLogs = result.logs.filter(log => log.persona === 'ABU');
            const drdreLogs = result.logs.filter(log => log.persona === 'DR_DRE');
            const neptuneLogs = result.logs.filter(log => log.persona === 'NEPTUNE');
            const abuResult = {
                allowed: result.allowed,
                violations: abuLogs
                    .filter(log => log.action === 'REJECT')
                    .map(log => {
                    var _a;
                    return ({
                        segmentId: ((_a = log.evidenceRefs) === null || _a === void 0 ? void 0 : _a[0]) || 'unknown',
                        explanation: log.explanation,
                        reasonCodes: log.reasonCodes || [],
                    });
                }),
                decisionLog: abuLogs.map(log => ({
                    persona: log.persona,
                    action: log.action,
                    explanation: log.explanation,
                    reasonCodes: log.reasonCodes || [],
                    timestamp: log.timestamp,
                })),
            };
            const drdreResult = {
                adjusted: drdreLogs.some((log) => log.action === 'ADJUST'),
                adjustedPlan: result.plan || undefined,
                changes: drdreLogs
                    .filter((log) => log.action === 'ADJUST')
                    .map((log) => ({
                    type: log.action,
                    explanation: log.explanation,
                    metadata: log.evidenceRefs ? { evidenceRefs: log.evidenceRefs } : undefined,
                })),
                decisionLog: drdreLogs.map((log) => ({
                    persona: log.persona,
                    action: log.action,
                    explanation: log.explanation,
                    reasonCodes: log.reasonCodes || [],
                    timestamp: log.timestamp,
                })),
            };
            const neptuneResult = {
                repaired: neptuneLogs.some((log) => log.action === 'REPLACE'),
                repairedPlan: result.plan || undefined,
                replacements: neptuneLogs
                    .filter((log) => log.action === 'REPLACE')
                    .map((log) => {
                    var _a, _b;
                    return ({
                        from: (_a = log.evidenceRefs) === null || _a === void 0 ? void 0 : _a[0],
                        to: (_b = log.evidenceRefs) === null || _b === void 0 ? void 0 : _b[1],
                        explanation: log.explanation,
                        metadata: log.evidenceRefs ? { evidenceRefs: log.evidenceRefs } : undefined,
                    });
                }),
                decisionLog: neptuneLogs.map((log) => ({
                    persona: log.persona,
                    action: log.action,
                    explanation: log.explanation,
                    reasonCodes: log.reasonCodes || [],
                    timestamp: log.timestamp,
                })),
            };
            const keyDecisions = result.logs
                .filter(log => log.action !== 'ALLOW')
                .map(log => ({
                persona: log.persona,
                action: log.action,
                reason: log.explanation,
            }));
            const decisionSummary = {
                finalAction: result.finalAction,
                allowed: result.allowed,
                summary: this.generateSummary(result),
                keyDecisions,
            };
            return {
                abuResult,
                drdreResult,
                neptuneResult,
                finalPlan: result.plan,
                decisionSummary,
                allLogs: result.logs,
            };
        }
        catch (error) {
            this.logger.error(`执行三人格策略失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    generateSummary(result) {
        var _a;
        if (!result.allowed) {
            return `Abu 拒绝了计划：${((_a = result.logs.find((log) => log.persona === 'ABU' && log.action === 'REJECT')) === null || _a === void 0 ? void 0 : _a.explanation) || '安全检查未通过'}`;
        }
        const actions = [];
        if (result.logs.some((log) => log.persona === 'DR_DRE' && log.action === 'ADJUST')) {
            actions.push('Dr.Dre 调整了行程节奏');
        }
        if (result.logs.some((log) => log.persona === 'NEPTUNE' && log.action === 'REPLACE')) {
            actions.push('Neptune 替换了部分路段');
        }
        if (actions.length === 0) {
            return '计划通过所有检查，无需调整';
        }
        return `计划已优化：${actions.join('，')}`;
    }
};
exports.DecisionRunThreeGuardiansSkill = DecisionRunThreeGuardiansSkill;
exports.DecisionRunThreeGuardiansSkill = DecisionRunThreeGuardiansSkill = DecisionRunThreeGuardiansSkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [world_build_context_skill_1.WorldBuildContextSkill,
        prisma_service_1.PrismaService,
        strategy_orchestrator_service_1.StrategyOrchestratorService])
], DecisionRunThreeGuardiansSkill);
//# sourceMappingURL=decision-run-three-guardians.skill.js.map