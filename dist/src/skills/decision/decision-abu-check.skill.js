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
var DecisionAbuCheckSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisionAbuCheckSkill = void 0;
const common_1 = require("@nestjs/common");
const abu_strategy_service_1 = require("../../trips/decision/strategies/abu-strategy.service");
let DecisionAbuCheckSkill = DecisionAbuCheckSkill_1 = class DecisionAbuCheckSkill {
    constructor(abuStrategy) {
        this.abuStrategy = abuStrategy;
        this.logger = new common_1.Logger(DecisionAbuCheckSkill_1.name);
        this.metadata = {
            name: 'decision.abuCheck',
            description: '基于物理现实和合规的安全检查，不考虑体验偏好。只能 ALLOW 或 REJECT，不可调整。',
            version: '1.0.0',
            category: 'decision',
            toolGroup: 'DOMAIN',
        };
    }
    async execute(input) {
        this.logger.debug(`执行 decision.abuCheck: ${input.candidatePlan.tripId || 'unknown'}`);
        const world = {
            physical: input.world.physical,
            human: input.world.human,
            routeDirection: input.world.routeDirection,
            complianceEvidence: [],
        };
        const result = await this.abuStrategy.evaluate(world, input.candidatePlan);
        const violations = result.logs
            .filter(log => { var _a; return (_a = log.reasonCodes) === null || _a === void 0 ? void 0 : _a.some(code => code.includes('HARD') || code.includes('VIOLATION')); })
            .map(log => {
            var _a;
            return ({
                segmentId: ((_a = log.evidenceRefs) === null || _a === void 0 ? void 0 : _a[0]) || 'unknown',
                elevationProfile: [],
                cumulativeAscent: 0,
                maxSlopePct: 0,
                rollingAscent3Days: 0,
                fatigueIndex: 0,
                violation: 'HARD',
                explanation: log.explanation,
                metadata: {},
            });
        });
        return {
            allowed: result.allowed,
            violations,
            decisionLog: result.logs.map(log => ({
                persona: log.persona,
                action: log.action,
                explanation: log.explanation,
                reasonCodes: log.reasonCodes || [],
                timestamp: log.timestamp,
            })),
        };
    }
};
exports.DecisionAbuCheckSkill = DecisionAbuCheckSkill;
exports.DecisionAbuCheckSkill = DecisionAbuCheckSkill = DecisionAbuCheckSkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [abu_strategy_service_1.AbuStrategy])
], DecisionAbuCheckSkill);
//# sourceMappingURL=decision-abu-check.skill.js.map