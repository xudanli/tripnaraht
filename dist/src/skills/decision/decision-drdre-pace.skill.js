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
var DecisionDrdrePaceSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisionDrdrePaceSkill = void 0;
const common_1 = require("@nestjs/common");
const dr_dre_strategy_service_1 = require("../../trips/decision/strategies/dr-dre-strategy.service");
let DecisionDrdrePaceSkill = DecisionDrdrePaceSkill_1 = class DecisionDrdrePaceSkill {
    constructor(drDreStrategy) {
        this.drDreStrategy = drDreStrategy;
        this.logger = new common_1.Logger(DecisionDrdrePaceSkill_1.name);
        this.metadata = {
            name: 'decision.drdrePace',
            description: '基于人体能力模型调整行程节奏，可以拆分天数或插入缓冲日，但不能替换路线。',
            version: '1.0.0',
            category: 'decision',
            toolGroup: 'DOMAIN',
        };
    }
    async execute(input) {
        this.logger.debug(`执行 decision.drdrePace: ${input.draftPlan.tripId || 'unknown'}`);
        const result = await this.drDreStrategy.evaluate(input.world, input.draftPlan);
        const changes = result.logs
            .filter(log => log.action === 'ADJUST' || log.action === 'REPLACE')
            .map(log => {
            const reasonCodes = log.reasonCodes || [];
            let type = 'ADJUST_PACE';
            if (reasonCodes.some(c => c.includes('SPLIT'))) {
                type = 'SPLIT_DAY';
            }
            else if (reasonCodes.some(c => c.includes('BUFFER') || c.includes('REST'))) {
                type = 'BUFFER_DAY';
            }
            return {
                type,
                description: log.explanation,
                dayIndex: undefined,
            };
        });
        const reasonSummary = result.logs
            .map(log => log.explanation)
            .join('; ');
        return {
            adjustedPlan: result.updatedPlan || null,
            changes,
            reasonSummary,
        };
    }
};
exports.DecisionDrdrePaceSkill = DecisionDrdrePaceSkill;
exports.DecisionDrdrePaceSkill = DecisionDrdrePaceSkill = DecisionDrdrePaceSkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [dr_dre_strategy_service_1.DrDreStrategy])
], DecisionDrdrePaceSkill);
//# sourceMappingURL=decision-drdre-pace.skill.js.map