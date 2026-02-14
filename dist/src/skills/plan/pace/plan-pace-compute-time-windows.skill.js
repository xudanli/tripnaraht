"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var PlanPaceComputeTimeWindowsSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanPaceComputeTimeWindowsSkill = void 0;
const common_1 = require("@nestjs/common");
let PlanPaceComputeTimeWindowsSkill = PlanPaceComputeTimeWindowsSkill_1 = class PlanPaceComputeTimeWindowsSkill {
    constructor() {
        this.logger = new common_1.Logger(PlanPaceComputeTimeWindowsSkill_1.name);
        this.metadata = {
            name: 'plan.pace.computeTimeWindows',
            description: '计算每天的可用时间窗（入住退房、交通耗时、缓冲）',
            version: '1.0.0',
            category: 'trip',
            toolGroup: 'DOMAIN',
        };
    }
    async execute(input) {
        this.logger.debug(`执行 plan.pace.computeTimeWindows: planId=${input.planState.plan_id}`);
        try {
            const days = input.planState.constraints.time.days;
            const bufferPolicy = input.bufferPolicy || 'standard';
            const availableHoursPerDay = input.planState.constraints.time.availableHoursPerDay || 10;
            const timeWindows = [];
            for (let day = 1; day <= days; day++) {
                const startHour = 9;
                const endHour = startHour + availableHoursPerDay;
                const hasTransfer = input.planState.mobility.transferSegments.some(seg => seg.from.city && seg.to.city);
                let actualStart = startHour;
                let actualEnd = endHour;
                if (hasTransfer) {
                    const transferHours = bufferPolicy === 'conservative' ? 4 :
                        bufferPolicy === 'aggressive' ? 2 : 3;
                    actualStart += transferHours;
                }
                const bufferHours = bufferPolicy === 'conservative' ? 2 :
                    bufferPolicy === 'aggressive' ? 0.5 : 1;
                actualEnd -= bufferHours;
                timeWindows.push({
                    day,
                    start: `${String(actualStart).padStart(2, '0')}:00`,
                    end: `${String(actualEnd).padStart(2, '0')}:00`,
                    bufferPolicy,
                });
            }
            return {
                timeWindows,
            };
        }
        catch (error) {
            this.logger.error(`计算时间窗失败: ${error.message}`, error.stack);
            throw error;
        }
    }
};
exports.PlanPaceComputeTimeWindowsSkill = PlanPaceComputeTimeWindowsSkill;
exports.PlanPaceComputeTimeWindowsSkill = PlanPaceComputeTimeWindowsSkill = PlanPaceComputeTimeWindowsSkill_1 = __decorate([
    (0, common_1.Injectable)()
], PlanPaceComputeTimeWindowsSkill);
//# sourceMappingURL=plan-pace-compute-time-windows.skill.js.map