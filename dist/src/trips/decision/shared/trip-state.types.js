"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInitialTripState = createInitialTripState;
exports.canTransitionToPhase = canTransitionToPhase;
function createInitialTripState(userIntent, world, strategyMode) {
    return {
        user_intent: userIntent,
        strategy_mode: strategyMode,
        world,
        planning_phase: 'DRAFTING',
        decision_log: [],
        rejection_log: [],
        plan: null,
    };
}
function canTransitionToPhase(currentPhase, targetPhase) {
    const phaseOrder = ['DRAFTING', 'SAFETY_CHECK', 'PACING_ADJUSTMENT', 'FINALIZING'];
    const currentIndex = phaseOrder.indexOf(currentPhase);
    const targetIndex = phaseOrder.indexOf(targetPhase);
    if (targetIndex < currentIndex) {
        return true;
    }
    return targetIndex === currentIndex + 1 || targetIndex === currentIndex;
}
//# sourceMappingURL=trip-state.types.js.map