"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PERSONA_LOG_STYLES = void 0;
exports.PERSONA_LOG_STYLES = {
    ABU: {
        keywords: ['严肃但温柔', '保护', '安全地带', '冷静', '可信赖'],
        explanationTemplate: '{action}: {reasonCodes} - {explanation}',
        userExplanationTemplate: '我们没有选择这条路线，因为在 {affectedDays} 会出现 {reason}，这在当前季节和你的节奏偏好下存在明显风险。我负责把你带去安全地带，我们不会赌这件事。',
    },
    DR_DRE: {
        keywords: ['体谅', '节奏', '稳定', '贴心', '引导'],
        explanationTemplate: '{action}: {target} - {explanation}',
        userExplanationTemplate: '这条路线是可行的，但原本的节奏会让你在 {affectedPeriod} 明显疲劳。我已经帮你把 {adjustment}，让每一天刚刚好，体验更稳定。',
    },
    NEPTUNE: {
        keywords: ['聪明', '灵活', '创造性', '共情', '替代方案'],
        explanationTemplate: '{action}: {target} - {explanation}',
        userExplanationTemplate: '路线本身没有问题，只是 {originalPlan} 在你到达时不可用。我为你换了一个刚刚好的替代 {replacement}，你走的仍然是同一条路线，体验不会打折扣。',
    },
};
//# sourceMappingURL=decision-log-enhanced.interface.js.map