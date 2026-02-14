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
var DecisionNeptuneRepairSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisionNeptuneRepairSkill = void 0;
const common_1 = require("@nestjs/common");
const neptune_strategy_service_1 = require("../../trips/decision/strategies/neptune-strategy.service");
let DecisionNeptuneRepairSkill = DecisionNeptuneRepairSkill_1 = class DecisionNeptuneRepairSkill {
    constructor(neptuneStrategy) {
        this.neptuneStrategy = neptuneStrategy;
        this.logger = new common_1.Logger(DecisionNeptuneRepairSkill_1.name);
        this.metadata = {
            name: 'decision.neptuneRepair',
            description: '在保持路线哲学的前提下，替换不可用的路段、入口或 POI。可以 REPLACE，但不能改变路线方向。',
            version: '1.0.0',
            category: 'decision',
            toolGroup: 'DOMAIN',
        };
    }
    async execute(input) {
        this.logger.debug(`执行 decision.neptuneRepair: ${input.brokenPlan.tripId || 'unknown'}`);
        const result = await this.neptuneStrategy.evaluate(input.world, input.brokenPlan);
        const replacements = result.logs
            .filter(log => log.action === 'REPLACE')
            .map(log => {
            var _a, _b, _c;
            return ({
                type: ((_a = log.reasonCodes) === null || _a === void 0 ? void 0 : _a[0]) || 'UNKNOWN',
                originalId: ((_b = log.evidenceRefs) === null || _b === void 0 ? void 0 : _b[0]) || 'unknown',
                newId: ((_c = log.evidenceRefs) === null || _c === void 0 ? void 0 : _c[1]) || 'unknown',
                explanation: log.explanation,
            });
        });
        const philosophyViolations = result.logs
            .filter(log => { var _a; return (_a = log.reasonCodes) === null || _a === void 0 ? void 0 : _a.some(code => code.includes('PHILOSOPHY')); })
            .map(log => log.explanation);
        return {
            repairedPlan: result.updatedPlan || null,
            replacements,
            philosophyCheck: {
                valid: philosophyViolations.length === 0,
                violations: philosophyViolations.length > 0 ? philosophyViolations : undefined,
            },
        };
    }
};
exports.DecisionNeptuneRepairSkill = DecisionNeptuneRepairSkill;
exports.DecisionNeptuneRepairSkill = DecisionNeptuneRepairSkill = DecisionNeptuneRepairSkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [neptune_strategy_service_1.NeptuneStrategy])
], DecisionNeptuneRepairSkill);
//# sourceMappingURL=decision-neptune-repair.skill.js.map