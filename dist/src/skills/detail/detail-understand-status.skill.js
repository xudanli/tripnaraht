"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var DetailUnderstandStatusSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DetailUnderstandStatusSkill = void 0;
const common_1 = require("@nestjs/common");
let DetailUnderstandStatusSkill = DetailUnderstandStatusSkill_1 = class DetailUnderstandStatusSkill {
    constructor() {
        this.logger = new common_1.Logger(DetailUnderstandStatusSkill_1.name);
        this.metadata = {
            name: 'detail.understandStatus',
            description: '理解当前行程状态（规划中/进行中/已完成），识别下一步行动和风险',
            version: '1.0.0',
            category: 'trip',
            toolGroup: 'DOMAIN',
        };
    }
    async execute(input) {
        var _a, _b;
        this.logger.debug(`执行 detail.understandStatus: tripId=${input.tripId}`);
        try {
            const tripData = input.tripData || {};
            const now = new Date();
            const startDate = tripData.startDate ? new Date(tripData.startDate) : null;
            const endDate = tripData.endDate ? new Date(tripData.endDate) : null;
            let currentPhase = 'PLANNING';
            if (startDate && endDate) {
                if (now < startDate) {
                    currentPhase = 'PLANNING';
                }
                else if (now >= startDate && now <= endDate) {
                    currentPhase = 'IN_PROGRESS';
                }
                else {
                    currentPhase = 'COMPLETED';
                }
            }
            const totalItems = ((_a = tripData.days) === null || _a === void 0 ? void 0 : _a.reduce((sum, day) => { var _a; return sum + (((_a = day.items) === null || _a === void 0 ? void 0 : _a.length) || 0); }, 0)) || 0;
            const completedItems = ((_b = tripData.days) === null || _b === void 0 ? void 0 : _b.reduce((sum, day) => {
                var _a;
                return sum + (((_a = day.items) === null || _a === void 0 ? void 0 : _a.filter((item) => item.completed).length) || 0);
            }, 0)) || 0;
            const progress = {
                completed: completedItems,
                total: totalItems,
                percentage: totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0,
            };
            const nextSteps = [];
            if (currentPhase === 'PLANNING') {
                nextSteps.push({
                    step: '确认行程细节',
                    priority: 'high',
                });
                nextSteps.push({
                    step: '准备行前清单',
                    priority: 'medium',
                });
            }
            else if (currentPhase === 'IN_PROGRESS') {
                nextSteps.push({
                    step: '查看今日行程',
                    priority: 'high',
                });
                nextSteps.push({
                    step: '确认交通安排',
                    priority: 'medium',
                });
            }
            const risks = [];
            const opportunities = [];
            const statusUnderstanding = {
                currentPhase,
                progress,
                nextSteps,
                risks,
                opportunities,
            };
            return {
                statusUnderstanding,
            };
        }
        catch (error) {
            this.logger.error(`理解状态失败: ${error.message}`, error.stack);
            throw error;
        }
    }
};
exports.DetailUnderstandStatusSkill = DetailUnderstandStatusSkill;
exports.DetailUnderstandStatusSkill = DetailUnderstandStatusSkill = DetailUnderstandStatusSkill_1 = __decorate([
    (0, common_1.Injectable)()
], DetailUnderstandStatusSkill);
//# sourceMappingURL=detail-understand-status.skill.js.map