"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var ExecRemindSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecRemindSkill = void 0;
const common_1 = require("@nestjs/common");
let ExecRemindSkill = ExecRemindSkill_1 = class ExecRemindSkill {
    constructor() {
        this.logger = new common_1.Logger(ExecRemindSkill_1.name);
        this.metadata = {
            name: 'exec.remind',
            description: '生成贴心管家式的提醒（出发、入住、活动、交通、天气、安全、预算等）',
            version: '1.0.0',
            category: 'trip',
            toolGroup: 'DOMAIN',
        };
    }
    async execute(input) {
        this.logger.debug(`执行 exec.remind: tripId=${input.tripId}, currentDate=${input.currentDate}`);
        try {
            const reminders = [];
            const advanceHours = input.advanceHours || 24;
            const currentDate = new Date(input.currentDate);
            const targetDate = new Date(currentDate);
            targetDate.setHours(targetDate.getHours() + advanceHours);
            const reminderTypes = input.reminderTypes || [
                'departure',
                'check_in',
                'activity_start',
                'transport',
                'weather',
                'safety',
                'budget',
            ];
            if (reminderTypes.includes('departure')) {
                reminders.push({
                    id: `reminder_${Date.now()}_departure`,
                    type: 'departure',
                    title: '出发提醒',
                    message: `您的行程即将开始，请确认已准备好所有必需品。`,
                    triggerTime: targetDate.toISOString(),
                    priority: 'high',
                });
            }
            if (reminderTypes.includes('check_in')) {
                reminders.push({
                    id: `reminder_${Date.now()}_check_in`,
                    type: 'check_in',
                    title: '入住提醒',
                    message: `请记得在指定时间办理入住手续。`,
                    triggerTime: targetDate.toISOString(),
                    priority: 'medium',
                });
            }
            if (reminderTypes.includes('activity_start')) {
                reminders.push({
                    id: `reminder_${Date.now()}_activity`,
                    type: 'activity_start',
                    title: '活动提醒',
                    message: `您有活动即将开始，请提前到达。`,
                    triggerTime: targetDate.toISOString(),
                    priority: 'medium',
                });
            }
            if (reminderTypes.includes('transport')) {
                reminders.push({
                    id: `reminder_${Date.now()}_transport`,
                    type: 'transport',
                    title: '交通提醒',
                    message: `请提前到达交通站点，预留充足时间。`,
                    triggerTime: targetDate.toISOString(),
                    priority: 'high',
                });
            }
            if (reminderTypes.includes('weather')) {
                reminders.push({
                    id: `reminder_${Date.now()}_weather`,
                    type: 'weather',
                    title: '天气提醒',
                    message: `请注意查看当地天气预报，做好相应准备。`,
                    triggerTime: targetDate.toISOString(),
                    priority: 'medium',
                });
            }
            if (reminderTypes.includes('safety')) {
                reminders.push({
                    id: `reminder_${Date.now()}_safety`,
                    type: 'safety',
                    title: '安全提醒',
                    message: `请注意安全，遵守当地法律法规。`,
                    triggerTime: targetDate.toISOString(),
                    priority: 'high',
                });
            }
            if (reminderTypes.includes('budget')) {
                reminders.push({
                    id: `reminder_${Date.now()}_budget`,
                    type: 'budget',
                    title: '预算提醒',
                    message: `请注意控制支出，避免超支。`,
                    triggerTime: targetDate.toISOString(),
                    priority: 'low',
                });
            }
            return {
                reminders,
            };
        }
        catch (error) {
            this.logger.error(`生成提醒失败: ${error.message}`, error.stack);
            throw error;
        }
    }
};
exports.ExecRemindSkill = ExecRemindSkill;
exports.ExecRemindSkill = ExecRemindSkill = ExecRemindSkill_1 = __decorate([
    (0, common_1.Injectable)()
], ExecRemindSkill);
//# sourceMappingURL=exec-remind.skill.js.map