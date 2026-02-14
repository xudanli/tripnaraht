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
var StrategyOrchestratorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StrategyOrchestratorService = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const abu_strategy_service_1 = require("../strategies/abu-strategy.service");
const dr_dre_strategy_service_1 = require("../strategies/dr-dre-strategy.service");
const neptune_strategy_service_1 = require("../strategies/neptune-strategy.service");
const decision_log_storage_service_1 = require("./decision-log-storage.service");
const context_engineer_service_1 = require("../../../agent/context-engine/services/context-engineer.service");
const skills_registry_service_1 = require("../../../skills/services/skills-registry.service");
let StrategyOrchestratorService = StrategyOrchestratorService_1 = class StrategyOrchestratorService {
    constructor(abu, dre, nep, logStorage, moduleRef) {
        this.abu = abu;
        this.dre = dre;
        this.nep = nep;
        this.logStorage = logStorage;
        this.moduleRef = moduleRef;
        this.logger = new common_1.Logger(StrategyOrchestratorService_1.name);
    }
    async run(world, plan) {
        var _a;
        if (!world) {
            this.logger.error('WorldModelContext 不能为空');
            throw new Error('WorldModelContext 不能为空');
        }
        if (!plan) {
            this.logger.error('RoutePlanDraft 不能为空');
            throw new Error('RoutePlanDraft 不能为空');
        }
        this.logger.debug(`开始策略编排: ${plan.tripId || 'unknown'}`);
        const allLogs = [];
        let currentPlan = plan;
        this.logger.debug('执行 Abu 策略...');
        const contextEngineer = this.getContextEngineer();
        if (contextEngineer && plan.tripId) {
            try {
                const ctx = await contextEngineer.build({
                    tripId: plan.tripId,
                    phase: 'SAFETY_CHECK',
                    agent: 'ABU',
                    userQuery: `安全评估: ${plan.tripId}`,
                    tokenBudget: 3000,
                    requiredTopics: ['ABU_RULES', 'COUNTRY_SAFETY', 'COUNTRY_ROAD_RULES', 'REJECTION_LOG'],
                });
                this.logger.debug(`Abu Context Package: ${ctx.blocks.length} 个块, ${ctx.totalTokens} tokens`);
            }
            catch (error) {
                this.logger.warn(`为 Abu 构建上下文失败: ${error.message}`);
            }
        }
        const abuResult = await this.abu.evaluate(world, currentPlan);
        allLogs.push(...abuResult.logs);
        if (!abuResult.allowed) {
            this.logger.warn(`Abu 拒绝了计划 ${plan.tripId}: ${(_a = abuResult.logs[0]) === null || _a === void 0 ? void 0 : _a.explanation}`);
            return {
                plan: null,
                logs: allLogs,
                allowed: false,
                finalAction: 'REJECT',
            };
        }
        this.logger.debug('执行 Dr.Dre 策略...');
        if (contextEngineer && plan.tripId) {
            try {
                const ctx = await contextEngineer.build({
                    tripId: plan.tripId,
                    phase: 'PACING_ADJUSTMENT',
                    agent: 'DR_DRE',
                    userQuery: `节奏调整: ${plan.tripId}`,
                    tokenBudget: 3000,
                    requiredTopics: ['PLAN_DAY', 'PLAN_SEGMENT', 'DECISION_LOG'],
                });
                this.logger.debug(`Dr.Dre Context Package: ${ctx.blocks.length} 个块, ${ctx.totalTokens} tokens`);
            }
            catch (error) {
                this.logger.warn(`为 Dr.Dre 构建上下文失败: ${error.message}`);
            }
        }
        const dreResult = await this.dre.evaluate(world, currentPlan);
        allLogs.push(...dreResult.logs);
        if (dreResult.updatedPlan) {
            currentPlan = dreResult.updatedPlan;
            this.logger.debug(`Dr.Dre 调整了计划: ${dreResult.action}`);
        }
        this.logger.debug('执行 Neptune 策略...');
        if (contextEngineer && plan.tripId) {
            try {
                const ctx = await contextEngineer.build({
                    tripId: plan.tripId,
                    phase: 'FINALIZING',
                    agent: 'NEPTUNE',
                    userQuery: `空间修复: ${plan.tripId}`,
                    tokenBudget: 3000,
                    requiredTopics: ['REJECTION_LOG', 'PLAN_SEGMENT', 'DECISION_LOG'],
                });
                this.logger.debug(`Neptune Context Package: ${ctx.blocks.length} 个块, ${ctx.totalTokens} tokens`);
            }
            catch (error) {
                this.logger.warn(`为 Neptune 构建上下文失败: ${error.message}`);
            }
        }
        const nepResult = await this.nep.evaluate(world, currentPlan);
        allLogs.push(...nepResult.logs);
        if (nepResult.updatedPlan) {
            currentPlan = nepResult.updatedPlan;
            this.logger.debug(`Neptune 替换了计划: ${nepResult.action}`);
        }
        const finalAction = this.determineFinalAction(abuResult.action, dreResult.action, nepResult.action);
        this.logger.debug(`策略编排完成: ${finalAction}, 日志数: ${allLogs.length}`);
        this.saveLogs(allLogs, world, plan).catch(error => {
            this.logger.warn(`Failed to save decision logs: ${error}`);
        });
        return {
            plan: currentPlan,
            logs: allLogs,
            allowed: true,
            finalAction,
        };
    }
    async saveLogs(logs, world, plan) {
        if (logs.length === 0) {
            return;
        }
        const skillsRegistry = this.getSkillsRegistry();
        if (skillsRegistry) {
            try {
                const decisionLogAppendSkill = skillsRegistry.getSkill('decision.logAppend');
                if (decisionLogAppendSkill) {
                    const result = await decisionLogAppendSkill.execute({
                        tripId: plan.tripId,
                        countryCode: world.physical.countryCode,
                        routeDirectionId: plan.routeDirectionId,
                        entries: logs.map((log) => ({
                            persona: log.persona,
                            action: log.action,
                            reasonCodes: log.reasonCodes,
                            explanation: log.explanation,
                            decisionSource: log.decisionSource,
                            decisionStage: log.decisionStage,
                            evidenceRefs: log.evidenceRefs,
                            timestamp: log.timestamp,
                        })),
                        metadata: {
                            month: world.physical.month,
                        },
                    });
                    this.logger.debug(`使用 decision.logAppend skill 保存了 ${result.writtenCount} 条日志`);
                    return;
                }
            }
            catch (error) {
                this.logger.warn(`使用 decision.logAppend skill 失败: ${error.message}，回退到直接保存`);
            }
        }
        await this.logStorage.saveLogEntries(logs, {
            tripId: plan.tripId,
            countryCode: world.physical.countryCode,
            routeDirectionId: plan.routeDirectionId,
            metadata: {
                month: world.physical.month,
            },
        });
    }
    determineFinalAction(abuAction, dreAction, nepAction) {
        if (nepAction === 'REPLACE') {
            return 'REPLACE';
        }
        if (dreAction === 'ADJUST') {
            return 'ADJUST';
        }
        return 'ALLOW';
    }
    getContextEngineer() {
        if (this.contextEngineer === undefined) {
            try {
                this.contextEngineer = this.moduleRef.get(context_engineer_service_1.ContextEngineerService, { strict: false });
                if (this.contextEngineer) {
                    this.logger.debug('[StrategyOrchestratorService] 懒加载获取 ContextEngineerService 成功');
                }
                else {
                    this.contextEngineer = null;
                }
            }
            catch (error) {
                this.logger.debug('[StrategyOrchestratorService] ContextEngineerService 不可用（懒加载失败）');
                this.contextEngineer = null;
            }
        }
        return this.contextEngineer || undefined;
    }
    getSkillsRegistry() {
        if (this.skillsRegistry === undefined) {
            try {
                this.skillsRegistry = this.moduleRef.get(skills_registry_service_1.SkillsRegistryService, { strict: false });
                if (this.skillsRegistry) {
                    this.logger.debug('[StrategyOrchestratorService] 懒加载获取 SkillsRegistryService 成功');
                }
                else {
                    this.skillsRegistry = null;
                }
            }
            catch (error) {
                this.logger.debug('[StrategyOrchestratorService] SkillsRegistryService 不可用（懒加载失败）');
                this.skillsRegistry = null;
            }
        }
        return this.skillsRegistry || undefined;
    }
};
exports.StrategyOrchestratorService = StrategyOrchestratorService;
exports.StrategyOrchestratorService = StrategyOrchestratorService = StrategyOrchestratorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [abu_strategy_service_1.AbuStrategy,
        dr_dre_strategy_service_1.DrDreStrategy,
        neptune_strategy_service_1.NeptuneStrategy,
        decision_log_storage_service_1.DecisionLogStorageService,
        core_1.ModuleRef])
], StrategyOrchestratorService);
//# sourceMappingURL=strategy-orchestrator.service.js.map