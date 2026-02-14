"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var PlanTransitBuildTransferGraphSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanTransitBuildTransferGraphSkill = void 0;
const common_1 = require("@nestjs/common");
let PlanTransitBuildTransferGraphSkill = PlanTransitBuildTransferGraphSkill_1 = class PlanTransitBuildTransferGraphSkill {
    constructor() {
        this.logger = new common_1.Logger(PlanTransitBuildTransferGraphSkill_1.name);
        this.metadata = {
            name: 'plan.transit.buildTransferGraph',
            description: '构建跨城段可达图，识别不可达/高风险段',
            version: '1.0.0',
            category: 'trip',
            toolGroup: 'DOMAIN',
        };
    }
    async execute(input) {
        this.logger.debug(`执行 plan.transit.buildTransferGraph: planId=${input.planState.plan_id}`);
        try {
            const segments = input.planState.mobility.transferSegments;
            const analyzedSegments = segments.map(segment => {
                const analyzed = { ...segment };
                if (analyzed.riskFlags.length > 0) {
                    const hasHighRisk = analyzed.riskFlags.some(flag => flag.severity === 'high');
                    if (hasHighRisk) {
                        analyzed.feasibility = 'needs_confirmation';
                    }
                }
                if (!analyzed.availableModes || analyzed.availableModes.length === 0) {
                    analyzed.feasibility = 'infeasible';
                }
                return analyzed;
            });
            const riskSegments = analyzedSegments
                .filter(s => s.riskFlags.some(f => f.severity === 'high'))
                .map(s => s.id);
            const infeasibleSegments = analyzedSegments
                .filter(s => s.feasibility === 'infeasible')
                .map(s => s.id);
            return {
                transferGraph: {
                    segments: analyzedSegments,
                    riskSegments,
                    infeasibleSegments,
                },
            };
        }
        catch (error) {
            this.logger.error(`构建可达图失败: ${error.message}`, error.stack);
            throw error;
        }
    }
};
exports.PlanTransitBuildTransferGraphSkill = PlanTransitBuildTransferGraphSkill;
exports.PlanTransitBuildTransferGraphSkill = PlanTransitBuildTransferGraphSkill = PlanTransitBuildTransferGraphSkill_1 = __decorate([
    (0, common_1.Injectable)()
], PlanTransitBuildTransferGraphSkill);
//# sourceMappingURL=plan-transit-build-transfer-graph.skill.js.map