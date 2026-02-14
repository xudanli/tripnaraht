"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractLearningSignals = extractLearningSignals;
function extractLearningSignals(feedback) {
    const signal = {};
    if (feedback.fatigueLevel && feedback.fatigueLevel >= 4) {
        signal.profileUpdate = {
            ...signal.profileUpdate,
            pacePreference: 'SLOW',
        };
    }
    if (feedback.abandoned || !feedback.overallSuccess) {
    }
    return signal;
}
//# sourceMappingURL=trip-outcome-feedback.interface.js.map