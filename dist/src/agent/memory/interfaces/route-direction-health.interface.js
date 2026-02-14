"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateRouteDirectionHealthScore = calculateRouteDirectionHealthScore;
function calculateRouteDirectionHealthScore(health) {
    if (health.totalRuns === 0) {
        return 0.5;
    }
    const successRate = health.successRuns / health.totalRuns;
    const failurePenalty = health.commonFailureReasons.length * 0.1;
    const repairPenalty = health.commonRepairs.length * 0.05;
    return Math.max(0, Math.min(1, successRate - failurePenalty - repairPenalty));
}
//# sourceMappingURL=route-direction-health.interface.js.map