"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PersonaExplanationService = void 0;
const common_1 = require("@nestjs/common");
const decision_log_enhanced_interface_1 = require("../interfaces/decision-log-enhanced.interface");
let PersonaExplanationService = class PersonaExplanationService {
    generateUserExplanation(persona, action, decision, context) {
        const style = decision_log_enhanced_interface_1.PERSONA_LOG_STYLES[persona];
        let explanation = style.userExplanationTemplate;
        if (context) {
            if (context.affectedDays) {
                explanation = explanation.replace('{affectedDays}', `第 ${context.affectedDays.join('、')} 天`);
            }
            if (context.affectedPeriod) {
                explanation = explanation.replace('{affectedPeriod}', context.affectedPeriod);
            }
            if (context.originalPlan) {
                explanation = explanation.replace('{originalPlan}', context.originalPlan);
            }
            if (context.replacement) {
                explanation = explanation.replace('{replacement}', context.replacement);
            }
            if (context.adjustment) {
                explanation = explanation.replace('{adjustment}', context.adjustment);
            }
            if (context.reason) {
                explanation = explanation.replace('{reason}', context.reason);
            }
        }
        switch (action) {
            case 'REJECT':
                return this.generateRejectionExplanation(persona, decision, context);
            case 'ADJUST':
                return this.generateAdjustmentExplanation(persona, decision, context);
            case 'REPLACE':
                return this.generateReplacementExplanation(persona, decision, context);
            case 'ALLOW':
                return this.generateAllowExplanation(persona, decision);
            default:
                return explanation;
        }
    }
    generateRejectionExplanation(persona, decision, context) {
        if (persona === 'ABU') {
            const reason = this.extractReasonFromCodes(decision.reasonCodes);
            const affectedDays = (context === null || context === void 0 ? void 0 : context.affectedDays) || [];
            if (affectedDays.length > 0) {
                return `我们没有选择这条路线，因为在第 ${affectedDays.join('、')} 天会出现${reason}，这在当前季节和你的节奏偏好下存在明显风险。我负责把你带去安全地带，我们不会赌这件事。`;
            }
            return `我们没有选择这条路线，因为${reason}，这在当前条件下存在明显风险。我负责把你带去安全地带，我们不会赌这件事。`;
        }
        return decision.explanation;
    }
    generateAdjustmentExplanation(persona, decision, context) {
        if (persona === 'DR_DRE') {
            const adjustment = (context === null || context === void 0 ? void 0 : context.adjustment) || '关键一天拆开，并插入了一个缓冲日';
            const affectedPeriod = (context === null || context === void 0 ? void 0 : context.affectedPeriod) || '中段';
            return `这条路线是可行的，但原本的节奏会让你在${affectedPeriod}明显疲劳。我已经帮你把${adjustment}，让每一天刚刚好，体验更稳定。`;
        }
        return decision.explanation;
    }
    generateReplacementExplanation(persona, decision, context) {
        if (persona === 'NEPTUNE') {
            const originalPlan = (context === null || context === void 0 ? void 0 : context.originalPlan) || '原计划的入口';
            const replacement = (context === null || context === void 0 ? void 0 : context.replacement) || '一个入口';
            return `路线本身没有问题，只是${originalPlan}在你到达时不可用。我为你换了一个刚刚好的替代${replacement}，你走的仍然是同一条路线，体验不会打折扣。`;
        }
        return decision.explanation;
    }
    generateAllowExplanation(persona, decision) {
        return decision.explanation || '路线已通过所有安全检查，可以执行。';
    }
    extractReasonFromCodes(reasonCodes) {
        const codeMap = {
            'RAPID_ASCENT': '连续高强度爬升',
            'ROLLING_FATIGUE': '连续疲劳累积',
            'WEATHER_RISK': '天气风险',
            'SLOPE_TOO_STEEP': '坡度过于陡峭',
            'ALTITUDE_RISK': '高海拔风险',
            'NO_ACCLIMATIZATION': '缺少适应期',
            'NO_WEATHER_BUFFER': '缺少天气缓冲',
            'NO_DEM_EVIDENCE': '缺少地形证据',
        };
        const reasons = reasonCodes
            .map(code => codeMap[code] || code)
            .filter(Boolean);
        if (reasons.length === 0) {
            return '存在安全风险';
        }
        return reasons.join('、');
    }
};
exports.PersonaExplanationService = PersonaExplanationService;
exports.PersonaExplanationService = PersonaExplanationService = __decorate([
    (0, common_1.Injectable)()
], PersonaExplanationService);
//# sourceMappingURL=persona-explanation.service.js.map