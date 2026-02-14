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
var PlanGateRunThreeGuardiansSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanGateRunThreeGuardiansSkill = void 0;
const common_1 = require("@nestjs/common");
const decision_run_three_guardians_skill_1 = require("../../decision/decision-run-three-guardians.skill");
const world_build_context_skill_1 = require("../../world/world-build-context.skill");
let PlanGateRunThreeGuardiansSkill = PlanGateRunThreeGuardiansSkill_1 = class PlanGateRunThreeGuardiansSkill {
    constructor(decisionRunThreeGuardians, worldBuildContext) {
        this.decisionRunThreeGuardians = decisionRunThreeGuardians;
        this.worldBuildContext = worldBuildContext;
        this.logger = new common_1.Logger(PlanGateRunThreeGuardiansSkill_1.name);
        this.metadata = {
            name: 'plan.gate.runThreeGuardians',
            description: '调用三人格（Abu/Dr.Dre/Neptune）对方案进行完整评审',
            version: '1.0.0',
            category: 'trip',
            toolGroup: 'DOMAIN',
        };
    }
    async execute(input) {
        var _a, _b;
        this.logger.debug(`执行 plan.gate.runThreeGuardians: planId=${input.planState.plan_id}`);
        try {
            if (!this.decisionRunThreeGuardians) {
                this.logger.warn('DecisionRunThreeGuardiansSkill 未注入，跳过三人格评审');
                return {
                    gateStatus: {
                        status: 'NEED_CONFIRM',
                        reasons: ['三人格评审服务不可用'],
                        missingEvidence: [],
                    },
                };
            }
            let world = input.planState.world;
            if (!world && input.tripId && this.worldBuildContext) {
                const worldResult = await this.worldBuildContext.execute({ tripId: input.tripId });
                world = worldResult.world;
            }
            if (!world) {
                return {
                    gateStatus: {
                        status: 'NEED_CONFIRM',
                        reasons: ['缺少世界模型上下文'],
                        missingEvidence: ['world'],
                    },
                };
            }
            const result = await this.decisionRunThreeGuardians.execute({
                world,
                planCandidate: input.planState.itinerary,
                tripId: input.tripId,
            });
            const gateStatus = {
                status: result.allowed ? 'ALLOW' : 'NEED_CONFIRM',
                reasons: [],
                missingEvidence: [],
                guardianResults: {
                    abu: {
                        verdict: result.abuResult.allowed ? 'ALLOW' : 'REJECT',
                        evidence: result.abuResult.violations.map(v => v.explanation),
                    },
                    drdre: {
                        verdict: result.drdreResult.adjusted ? 'ADJUST' : 'ALLOW',
                        evidence: ((_a = result.drdreResult.changes) === null || _a === void 0 ? void 0 : _a.map(c => c.reason || '')) || [],
                    },
                    neptune: {
                        verdict: result.neptuneResult.repaired ? 'REPLACE' : 'ALLOW',
                        evidence: ((_b = result.neptuneResult.replacements) === null || _b === void 0 ? void 0 : _b.map(r => r.explanation || '')) || [],
                    },
                },
                consolidatedVerdict: result.allowed ? 'ALLOW' : 'NEED_CONFIRM',
                requiredUserConfirmations: result.requiredUserConfirmations || [],
            };
            if (!result.abuResult.allowed) {
                gateStatus.reasons.push(`Abu 拒绝: ${result.abuResult.violations.map(v => v.explanation).join(', ')}`);
            }
            if (result.drdreResult.adjusted) {
                gateStatus.reasons.push(`Dr.Dre 建议调整节奏`);
            }
            if (result.neptuneResult.repaired) {
                gateStatus.reasons.push(`Neptune 建议替换路段`);
            }
            return {
                gateStatus,
            };
        }
        catch (error) {
            this.logger.error(`三人格评审失败: ${error.message}`, error.stack);
            throw error;
        }
    }
};
exports.PlanGateRunThreeGuardiansSkill = PlanGateRunThreeGuardiansSkill;
exports.PlanGateRunThreeGuardiansSkill = PlanGateRunThreeGuardiansSkill = PlanGateRunThreeGuardiansSkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [decision_run_three_guardians_skill_1.DecisionRunThreeGuardiansSkill,
        world_build_context_skill_1.WorldBuildContextSkill])
], PlanGateRunThreeGuardiansSkill);
//# sourceMappingURL=plan-gate-run-three-guardians.skill.js.map